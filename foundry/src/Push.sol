// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Verified against @inco/lightning v1.0.2 (npm), inspected directly from the
// published package source on 2026-08-07. Every `e.*` call on euint256/ebool
// below exists in that source with the exact signature used here.
import {e, ebool, euint256, inco} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

interface IJackpotRandomTicketBuyer {
    // count capped at 1-10 by the real contract - InvalidTicketCount() otherwise.
    // Confirmed against llms.megapot.io/tasks/buy-random.
    function buyTickets(
        uint256 _count,
        address _recipient,
        address[] calldata _referrers,
        uint256[] calldata _referralSplitBps, // misleadingly named on Megapot's side - actually 1e18 PRECISE_UNIT scale, not bps
        bytes32 _source
    ) external returns (uint256[] memory ticketIds);
}

struct StaticTicket {
    uint8[] normals;
    uint8 bonusball;
}

interface IBatchPurchaseFacilitator {
    // NOT immediate - keeper-executed. Only usable for counts >= minimumTicketCount()
    // (currently 10). A recipient can only have ONE active order at a time -
    // reverts with ActiveBatchOrderExists() otherwise. Confirmed against
    // llms.megapot.io/tasks/buy-bulk.
    function createBatchOrder(
        address _recipient,
        uint64 _dynamicTicketCount,
        StaticTicket[] calldata _userStaticTickets,
        address[] calldata _referrers,
        uint256[] calldata _referralSplit,
        bytes32 _source
    ) external;

    function hasActiveBatchOrder(address _recipient) external view returns (bool);
    function minimumTicketCount() external view returns (uint256);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @title Push
/// @notice A real-stakes crash-style climb built on Megapot. Stake USDC,
/// climb a confidentially sealed multiplier, cash out to convert your stake
/// into that many real random-number Megapot tickets, or crash and lose the
/// stake to the house bankroll. On top of the core climb, this contract adds
/// three things aimed squarely at Megapot's own judging criteria:
///   1. On-chain player stats + achievement events (social/competitive)
///   2. A separately funded, NON-LEVERAGED community pool with a periodic
///      weighted draw among active players (community ticket pool, done
///      safely - payout always equals exactly what's accumulated, so unlike
///      an earlier version of this design, it can never be insolvent)
///   3. Everything above emits events cheaply enough for a frontend
///      leaderboard without any additional payout logic
contract Push {
    using e for uint256;

    uint256 public constant TICKET_PRICE = 1_000_000; // $1 USDC, 6 decimals
    uint256 public constant COMMUNITY_SKIM_BPS = 200; // 2% of every stake feeds the community pool
    uint256[] public tiers; // e.g. [1,2,3,5,8,12,20]

    IJackpotRandomTicketBuyer public immutable ticketBuyer;
    IBatchPurchaseFacilitator public immutable batchFacilitator;
    IERC20 public immutable usdc;
    address public immutable referrer;
    address public immutable owner;

    // ---------- Core climb ----------

    struct Round {
        address player;
        uint256 stakedDollars;
        uint256 reserved;
        euint256 crashTierIndex; // sealed - never allowed to the player
        bool settled;
    }

    mapping(uint256 => Round) public rounds;
    uint256 public nextRoundId;
    uint256 public bankroll;

    mapping(uint256 => bytes32) public pendingSurvivedHandle;
    mapping(uint256 => uint8) public pendingClaimedTier;

    event RoundStarted(uint256 indexed roundId, address indexed player, uint256 stakedDollars);
    event CashOutRequested(uint256 indexed roundId, uint8 claimedTierIndex, bytes32 survivedHandle);
    event Settled(uint256 indexed roundId, bool survived, uint256 ticketsWon);
    event BankrollFunded(address indexed backer, uint256 amount);
    event BatchOrderPending(address indexed recipient, uint256 count);

    // ---------- Player stats / achievements ----------

    struct PlayerStats {
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 bestTierEverReached; // tier value (e.g. 20), not index
        uint256 totalTicketsWon;
        uint256 totalCashouts;
        uint256 totalCrashes;
    }

    mapping(address => PlayerStats) public playerStats;

    event Achievement(address indexed player, string kind, uint256 value);

    // ---------- Community pool (non-leveraged, always solvent) ----------

    struct Participant {
        address player;
        uint256 weight; // dollars staked this period
    }

    struct CommunityPeriod {
        Participant[] participants;
        uint256 totalWeight;
        uint256 potAtSnapshot;
        bool drawRequested;
        bool settled;
    }

    mapping(uint256 => CommunityPeriod) private periods;
    mapping(uint256 => euint256) private pendingCommunityWinningWeight;
    uint256 public currentPeriodId;
    uint256 public communityPotBalance;

    event CommunityDrawRequested(uint256 indexed periodId, uint256 potAtSnapshot, uint256 totalWeight);
    event CommunityDrawSettled(uint256 indexed periodId, address indexed winner, uint256 ticketsWon);

    constructor(
        address _ticketBuyer,
        address _batchFacilitator,
        address _usdc,
        address _referrer,
        uint256[] memory _tiers
    ) {
        require(_tiers.length > 0, "need at least one tier");
        ticketBuyer = IJackpotRandomTicketBuyer(_ticketBuyer);
        batchFacilitator = IBatchPurchaseFacilitator(_batchFacilitator);
        usdc = IERC20(_usdc);
        referrer = _referrer;
        owner = msg.sender;
        tiers = _tiers;
    }

    /// @notice Routes a ticket purchase through the right Megapot contract
    /// based on size. <=10: JackpotRandomTicketBuyer, immediate, tickets
    /// land in `recipient`'s wallet in this same transaction. >10: must go
    /// through BatchPurchaseFacilitator instead - NOT immediate, keeper-
    /// executed, and Megapot only allows one active batch order per
    /// recipient at a time (ActiveBatchOrderExists() reverts otherwise).
    /// Emits BatchOrderPending so a frontend/keeper knows to poll
    /// getBatchOrderInfo(recipient) rather than expect tickets right away.
    function _buyTickets(uint256 count, address recipient) internal {
        address[] memory refs = new address[](1);
        refs[0] = referrer;
        uint256[] memory splits = new uint256[](1);
        splits[0] = 1e18;

        if (count <= 10) {
            usdc.approve(address(ticketBuyer), count * TICKET_PRICE);
            ticketBuyer.buyTickets(count, recipient, refs, splits, bytes32(0));
        } else {
            require(!batchFacilitator.hasActiveBatchOrder(recipient), "recipient already has a pending batch order");
            require(count <= type(uint64).max, "ticket count exceeds uint64 range");
            usdc.approve(address(batchFacilitator), count * TICKET_PRICE);
            StaticTicket[] memory none = new StaticTicket[](0);
            // forge-lint: disable-next-line(unsafe-typecast)
            batchFacilitator.createBatchOrder(recipient, uint64(count), none, refs, splits, bytes32(0));
            emit BatchOrderPending(recipient, count);
        }
    }

    // ============================================================
    // Core climb
    // ============================================================

    /// @notice Stake real USDC. A small skim (COMMUNITY_SKIM_BPS) peels off
    /// into the non-leveraged community pool; the rest becomes bankroll,
    /// which must cover this round's worst case (stakedDollars * topTier)
    /// before the stake is accepted. This stake also counts as this
    /// period's weight toward the community draw below.
    function stake(uint256 dollarAmount) external returns (uint256 roundId) {
        require(dollarAmount > 0, "stake at least $1");
        uint256 totalCost = dollarAmount * TICKET_PRICE;
        require(usdc.transferFrom(msg.sender, address(this), totalCost), "usdc transfer failed");

        uint256 skim = (totalCost * COMMUNITY_SKIM_BPS) / 10_000;
        communityPotBalance += skim;
        bankroll += (totalCost - skim);

        uint256 worstCase = dollarAmount * tiers[tiers.length - 1] * TICKET_PRICE;
        require(bankroll >= worstCase, "bankroll can't cover this stake right now - try a smaller amount");
        bankroll -= worstCase;

        euint256 crashTierIndex = e.randBounded(tiers.length);
        e.allowThis(crashTierIndex);

        roundId = nextRoundId++;
        rounds[roundId] = Round({
            player: msg.sender,
            stakedDollars: dollarAmount,
            reserved: worstCase,
            crashTierIndex: crashTierIndex,
            settled: false
        });

        CommunityPeriod storage p = periods[currentPeriodId];
        p.participants.push(Participant({player: msg.sender, weight: dollarAmount}));
        p.totalWeight += dollarAmount;

        emit RoundStarted(roundId, msg.sender, dollarAmount);
    }

    function requestCashOut(uint256 roundId, uint8 claimedTierIndex) external {
        Round storage r = rounds[roundId];
        require(r.player == msg.sender, "not your round");
        require(!r.settled, "already settled");
        require(claimedTierIndex < tiers.length, "bad tier");

        ebool survived = e.lt(claimedTierIndex, r.crashTierIndex);
        e.allow(survived, msg.sender);

        bytes32 handle = ebool.unwrap(survived);
        pendingSurvivedHandle[roundId] = handle;
        pendingClaimedTier[roundId] = claimedTierIndex;

        emit CashOutRequested(roundId, claimedTierIndex, handle);
    }

    function settleCashOut(
        uint256 roundId,
        DecryptionAttestation memory attestation,
        bytes[] memory signatures
    ) external {
        Round storage r = rounds[roundId];
        require(!r.settled, "already settled");
        require(attestation.handle == pendingSurvivedHandle[roundId], "handle mismatch");
        require(
            inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures),
            "invalid attestation"
        );

        r.settled = true;
        bool survived = attestation.value != bytes32(0);
        uint256 ticketsWon = 0;
        PlayerStats storage stats = playerStats[r.player];

        if (survived) {
            uint8 claimedTierIndex = pendingClaimedTier[roundId];
            uint256 tierValue = tiers[claimedTierIndex];
            ticketsWon = r.stakedDollars * tierValue;
            uint256 cost = ticketsWon * TICKET_PRICE;
            bankroll += (r.reserved - cost);
            _buyTickets(ticketsWon, r.player);

            stats.currentStreak += 1;
            stats.totalCashouts += 1;
            stats.totalTicketsWon += ticketsWon;
            if (stats.currentStreak > stats.longestStreak) {
                stats.longestStreak = stats.currentStreak;
            }
            if (stats.totalCashouts == 1) {
                emit Achievement(r.player, "first_cashout", 0);
            }
            if (stats.currentStreak == 3 || stats.currentStreak == 5 || stats.currentStreak == 10) {
                emit Achievement(r.player, "streak", stats.currentStreak);
            }
            if (tierValue > stats.bestTierEverReached) {
                stats.bestTierEverReached = tierValue;
                emit Achievement(r.player, "best_tier", tierValue);
            }
        } else {
            bankroll += r.reserved;
            stats.currentStreak = 0;
            stats.totalCrashes += 1;
        }

        emit Settled(roundId, survived, ticketsWon);
    }

    function fundBankroll(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transfer failed");
        bankroll += amount;
        emit BankrollFunded(msg.sender, amount);
    }

    // ============================================================
    // Community pool - non-leveraged, always solvent by construction.
    // Payout always equals exactly potAtSnapshot / TICKET_PRICE tickets,
    // never a multiplier of it, so unlike the climb itself, this can never
    // run short of funds.
    // ============================================================

    /// @notice Permissionlessly closes the current period and seals a random
    /// winning weight in [0, totalWeight). Anyone can call this, mirroring
    /// Megapot's own permissionless runJackpot pattern. The winning weight is
    /// PUBLICLY revealed (not allow()-scoped) because settling it requires
    /// walking a public participant list on-chain anyway - there's no
    /// player-specific secrecy to protect here, unlike an individual
    /// player's climb outcome.
    function requestCommunityDraw() external returns (uint256 periodId) {
        periodId = currentPeriodId;
        CommunityPeriod storage p = periods[periodId];
        require(!p.drawRequested, "already requested");
        require(p.totalWeight > 0, "no participants this period");

        p.drawRequested = true;
        p.potAtSnapshot = communityPotBalance;
        communityPotBalance = 0;
        currentPeriodId += 1; // new stakes now accrue to the next period

        euint256 winningWeight = e.randBounded(p.totalWeight);
        e.reveal(winningWeight);
        pendingCommunityWinningWeight[periodId] = winningWeight;

        emit CommunityDrawRequested(periodId, p.potAtSnapshot, p.totalWeight);
    }

    /// @notice Anyone submits the decryption attestation for the winning
    /// weight fetched off-chain after requestCommunityDraw(). Walks the
    /// period's participant list to find whose cumulative weight range
    /// contains the winning value, then buys them exactly
    /// potAtSnapshot / TICKET_PRICE real tickets - never more than what was
    /// actually accumulated.
    function settleCommunityDraw(
        uint256 periodId,
        DecryptionAttestation memory attestation,
        bytes[] memory signatures
    ) external {
        CommunityPeriod storage p = periods[periodId];
        require(p.drawRequested && !p.settled, "not ready to settle");
        require(
            attestation.handle == euint256.unwrap(pendingCommunityWinningWeight[periodId]),
            "handle mismatch"
        );
        require(
            inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures),
            "invalid attestation"
        );

        p.settled = true;
        uint256 winningValue = uint256(attestation.value);

        address winner;
        uint256 cumulative;
        for (uint256 i = 0; i < p.participants.length; i++) {
            cumulative += p.participants[i].weight;
            if (winningValue < cumulative) {
                winner = p.participants[i].player;
                break;
            }
        }
        require(winner != address(0), "winner resolution failed");

        uint256 ticketsWon = p.potAtSnapshot / TICKET_PRICE;
        if (ticketsWon > 0) {
            _buyTickets(ticketsWon, winner);
        }

        emit Achievement(winner, "community_draw_won", ticketsWon);
        emit CommunityDrawSettled(periodId, winner, ticketsWon);
    }

    function getPeriodParticipantCount(uint256 periodId) external view returns (uint256) {
        return periods[periodId].participants.length;
    }

    /// @notice Exposes the sealed winning-weight handle for a period so an
    /// off-chain keeper (or a test) can fetch its decryption attestation.
    /// Safe to expose publicly since requestCommunityDraw() already made
    /// this value publicly revealable via e.reveal(), not e.allow().
    function pendingCommunityWinningWeightHandle(uint256 periodId) external view returns (bytes32) {
        return euint256.unwrap(pendingCommunityWinningWeight[periodId]);
    }
}
