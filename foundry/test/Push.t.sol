// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco, euint256, ebool} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import {Push} from "../src/Push.sol";
import {console} from "forge-std/console.sol";
import {MockUSDC, MockJackpot, MockBatchFacilitator} from "./mocks/Mocks.sol";

contract PushTest is IncoTest {

    Push push;
    MockUSDC usdc;
    MockJackpot jackpot;
    MockBatchFacilitator batchFacilitator;
    address referrer = address(0xBEEF);

    // Matches MockJackpot's default ticketPrice - Push.sol no longer has its
    // own TICKET_PRICE constant, it reads this live via ticketPrice().
    uint256 constant TICKET_PRICE = 1_000_000;
    // Cached once here rather than called inline as `{value: incoFee}`
    // at each call site: inco.getFee() is itself an external call, and
    // evaluating it inline as part of a call's value expression is the
    // "next call" that vm.prank/vm.expectRevert's single-shot cheatcodes
    // attach to - not the push.stake()/requestCashOut() call after it.
    uint256 incoFee;

    function setUp() public override {
        super.setUp(); // boots the full Inco fake infra - Safe deploy, TEE bootstrap, etc.
        incoFee = inco.getFee();

        usdc = new MockUSDC();
        jackpot = new MockJackpot();
        batchFacilitator = new MockBatchFacilitator(usdc);

        uint256[] memory tiers = new uint256[](7);
        tiers[0] = 1;
        tiers[1] = 2;
        tiers[2] = 3;
        tiers[3] = 5;
        tiers[4] = 8;
        tiers[5] = 12;
        tiers[6] = 20;

        push = new Push(address(jackpot), address(batchFacilitator), address(usdc), referrer, tiers);
        // Deployer's own initial top-up of Push's Inco confidential-op fee
        // reserve (see Push.stake()'s docs) - a manual backstop via
        // receive(), on top of the self-sustaining per-call top-ups tested
        // separately below.
        vm.deal(address(push), 10 ether);

        // Fund alice and bob to stake with, and give push a starting bankroll
        // by having a backer deposit real USDC first - stake() itself checks
        // bankroll can cover worst case, so an unfunded contract should
        // reject stakes (tested explicitly below).
        usdc.mint(alice, 10_000 * TICKET_PRICE);
        usdc.mint(bob, 10_000 * TICKET_PRICE);
        usdc.mint(address(this), 10_000 * TICKET_PRICE);

        // ETH for alice/bob to pay Push's per-call Inco fee top-up with.
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
    }

    function _fundBankroll(uint256 dollars) internal {
        usdc.approve(address(push), dollars * TICKET_PRICE);
        push.fundBankroll(dollars * TICKET_PRICE);
    }

    // ============================================================
    // Solvency
    // ============================================================

    function testStakeRevertsWhenBankrollCannotCoverWorstCase() public {
        // No bankroll funded yet - even a $1 stake needs 1*20*$1 = $20
        // reserved, which an empty bankroll can't cover.
        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        vm.expectRevert(bytes("bankroll can't cover this stake right now - try a smaller amount"));
        push.stake{value: incoFee}(1);
        vm.stopPrank();
    }

    function testStakeRevertsWithoutEthFeeReserveTopUp() public {
        // Inco charges e.randBounded's fee from Push's own ETH balance, not
        // from msg.value forwarded to Inco directly - so stake() requires
        // its own msg.value floor to keep that reserve self-sustaining,
        // independent of and checked before the USDC bankroll check above.
        _fundBankroll(100);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        vm.expectRevert(bytes("send enough ETH to cover the Inco confidential-op fee"));
        push.stake(1); // no {value: ...} at all
        vm.stopPrank();
    }

    function testStakeSucceedsAndReservesWorstCase() public {
        _fundBankroll(100); // 100 USDC bankroll

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        // worst case for $1 staked, top tier 20x = $20 reserved
        (,, uint256 reserved,,,) = push.rounds(roundId);
        assertEq(reserved, 20 * TICKET_PRICE, "should reserve top-tier worst case");

        // bankroll should be original 100 - 20 reserved - 2% skim on the $1 stake
        uint256 skim = (TICKET_PRICE * push.COMMUNITY_SKIM_BPS()) / 10_000;
        uint256 expectedBankroll = 100 * TICKET_PRICE + (TICKET_PRICE - skim) - 20 * TICKET_PRICE;
        assertEq(push.bankroll(), expectedBankroll, "bankroll should reflect stake minus skim minus reservation");
        assertEq(push.communityPotBalance(), skim, "community pot should receive the skim");
    }

    // ============================================================
    // Core climb: survive and crash outcomes, using the harness's
    // ability to peek at the real (sealed) value for deterministic tests -
    // production code never gets this visibility, only the test harness does.
    // ============================================================

    function testCashOutOnSurviveBuysTicketsAndUpdatesStats() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        // Claiming the lowest tier (index 0) against a fresh deployment's
        // first confidential draw survives deterministically - confirmed
        // empirically, not forced. KVStore.set() cannot override this: it
        // only affects the test harness's off-chain attestation-simulation
        // cache, not the real on-chain eRandBounded/eLt computation.
        uint8 claimedTierIndex = 0;

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(roundId, claimedTierIndex);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        // All purchases route through the batch facilitator now - there is
        // no real on-chain "buy N random tickets" contract to route small
        // orders through instead (see Push.sol's BatchOrderInfo comment).
        assertEq(batchFacilitator.lastRecipient(), alice, "tickets should go to alice");
        assertEq(batchFacilitator.lastDynamicCount(), 1, "tier 0 = 1x on a $1 stake = 1 ticket");

        (uint256 currentStreak, uint256 longestStreak, uint256 bestTier, uint256 totalTicketsWon, uint256 totalCashouts,) =
            push.playerStats(alice);
        assertEq(currentStreak, 1, "streak should increment on survive");
        assertEq(longestStreak, 1);
        assertEq(bestTier, 1);
        assertEq(totalTicketsWon, 1);
        assertEq(totalCashouts, 1);
    }

    function testCashOutOnCrashReturnsReservationAndResetsStreak() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        (,,, euint256 crashTierIndex,,) = push.rounds(roundId);
        uint256 actualCrashTier = uint256(get(euint256.unwrap(crashTierIndex)));

        // Claim the top tier (index 6) - survives only if actualCrashTier > 6,
        // which never happens since indices are drawn in [0,7). This
        // deterministically busts every time, which is exactly what this
        // test needs.
        vm.assume(actualCrashTier <= 6);
        uint8 claimedTierIndex = 6;

        uint256 bankrollBefore = push.bankroll();

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(roundId, claimedTierIndex);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        assertEq(batchFacilitator.callCount(), 0, "no tickets should be bought on a bust");

        (,, uint256 reserved,,,) = push.rounds(roundId);
        assertEq(push.bankroll(), bankrollBefore + reserved, "full reservation should return to bankroll on bust");

        (uint256 currentStreak,,,,, uint256 totalCrashes) = push.playerStats(alice);
        assertEq(currentStreak, 0, "streak should reset on crash");
        assertEq(totalCrashes, 1);
    }

    function testCannotSettleSameRoundTwice() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(roundId, 6); // top tier, will bust deterministically per above
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        vm.expectRevert(bytes("already settled"));
        push.settleCashOut(roundId, attestation, signatures);
    }

    function testOnlyRoundOwnerCanRequestCashOut() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(bytes("not your round"));
        push.requestCashOut{value: incoFee}(roundId, 0);
    }

    // ============================================================
    // Ticket purchase routing: every purchase (whether 1 ticket or many)
    // routes through BatchPurchaseFacilitator.createBatchOrder - there is
    // no separate on-chain "random ticket buyer" contract for small orders
    // (see Push.sol's BatchOrderInfo comment for the real ABI this was
    // confirmed against). One active order per recipient at a time is
    // enforced via remainingTickets, not a dedicated boolean getter.
    // ============================================================

    function testLargePayoutRoutesThroughBatchFacilitator() public {
        _fundBankroll(5000);

        // Stake $15 and claim the lowest tier (index 0, value 1x). This tier
        // is empirically confirmed to survive as the first confidential draw
        // in a fresh deployment (see testCashOutOnSurviveBuysTicketsAndUpdatesStats).
        // 15 dollars * 1x = 15 tickets, sidestepping the need to force a
        // specific value into an on-chain-computed confidential result (see
        // README note: KVStore.set() only affects the test harness's
        // off-chain attestation simulation cache, not the real on-chain
        // eRandBounded/eLt computation - it looked effective in an earlier
        // draft only because that computation happened to genuinely survive
        // on its own, not because of the override).
        vm.startPrank(alice);
        usdc.approve(address(push), 15 * TICKET_PRICE);
        uint256 roundId = push.stake{value: incoFee}(15);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(roundId, 0);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        assertEq(batchFacilitator.callCount(), 1, "15 tickets must route through the batch facilitator");
        assertEq(batchFacilitator.lastDynamicCount(), 15);
        assertEq(batchFacilitator.lastRecipient(), alice);
    }

    function testCashOutRevertsWhenRecipientHasPendingBatchOrder() public {
        _fundBankroll(5000);

        // First round: survive at the lowest tier, creating a batch order
        // for alice that the mock keeper never completes.
        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 firstRoundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(firstRoundId, 0);
        processAllOperations();

        bytes32 firstHandle = push.pendingSurvivedHandle(firstRoundId);
        (DecryptionAttestation memory firstAttestation, bytes[] memory firstSignatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: firstHandle, proof: _emptyAllowanceProof()}));
        push.settleCashOut(firstRoundId, firstAttestation, firstSignatures);
        assertEq(batchFacilitator.callCount(), 1, "first win should have created a batch order");

        // Second round, same player: also survives, but the first order is
        // still pending (mock keeper hasn't filled it) - settling should
        // revert rather than silently create a second order Megapot itself
        // would reject.
        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 secondRoundId = push.stake{value: incoFee}(1);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut{value: incoFee}(secondRoundId, 0);
        processAllOperations();

        bytes32 secondHandle = push.pendingSurvivedHandle(secondRoundId);
        (DecryptionAttestation memory secondAttestation, bytes[] memory secondSignatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: secondHandle, proof: _emptyAllowanceProof()}));

        vm.expectRevert(bytes("recipient already has tickets pending from a previous win"));
        push.settleCashOut(secondRoundId, secondAttestation, secondSignatures);

        // Once the mock keeper "completes" the first order, the same
        // settlement should succeed.
        batchFacilitator.simulateKeeperCompletion(alice);
        push.settleCashOut(secondRoundId, secondAttestation, secondSignatures);
        assertEq(batchFacilitator.callCount(), 2, "second win should go through once the first order clears");
    }

    // ============================================================
    // Community pool: non-leveraged, always solvent by construction
    // ============================================================

    function testCommunityDrawPaysOutExactlyTheAccumulatedPot() public {
        _fundBankroll(10_000);

        // Large enough stakes that the 2% skim clears $1 (one ticket) -
        // $30 + $30 = $60 total, 2% = $1.20, enough for exactly 1 ticket
        // with $0.20 left un-spendable (division rounds down, tested below).
        vm.startPrank(alice);
        usdc.approve(address(push), 30 * TICKET_PRICE);
        push.stake{value: incoFee}(30);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(push), 30 * TICKET_PRICE);
        push.stake{value: incoFee}(30);
        vm.stopPrank();

        uint256 expectedPot = push.communityPotBalance();
        assertEq(expectedPot, 1_200_000, "2% of $60 should be $1.20");

        uint256 periodId = push.requestCommunityDraw();
        assertEq(push.getPeriodParticipantCount(periodId), 2, "both stakes should be recorded as participants");

        bytes32 winningWeightHandle = push.pendingCommunityWinningWeightHandle(periodId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) = getDecryptionAttestation(
            address(this), HandleWithProof({handle: winningWeightHandle, proof: _emptyAllowanceProof()})
        );

        uint256 batchBefore = usdc.balanceOf(address(batchFacilitator));

        push.settleCommunityDraw(periodId, attestation, signatures);

        uint256 spent = usdc.balanceOf(address(batchFacilitator)) - batchBefore;
        // $1.20 pot only buys 1 whole ticket (integer division) - the extra
        // $0.20 is real, intentional rounding dust, not spent or lost.
        assertEq(spent, 1 * TICKET_PRICE, "payout must be exactly 1 ticket - never more than the pot allows");
    }

    /// @dev Documents real, correct behavior discovered while testing: a
    /// community pot too small to afford even one $1 ticket should NOT
    /// revert and should NOT over-promise - it should simply buy zero
    /// tickets. This was initially a test-authoring mistake (the first
    /// version of this test assumed any pot would produce a payout), which
    /// is itself a useful signal: the community pool needs real volume
    /// before it can pay out anything, a smaller-scale echo of the exact
    /// problem that killed the original leveraged design.
    function testCommunityDrawWithTinyPotBuysNothingWithoutReverting() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE); // 2% of $1 = $0.02, nowhere near $1
        push.stake{value: incoFee}(1);
        vm.stopPrank();

        uint256 periodId = push.requestCommunityDraw();
        bytes32 winningWeightHandle = push.pendingCommunityWinningWeightHandle(periodId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) = getDecryptionAttestation(
            address(this), HandleWithProof({handle: winningWeightHandle, proof: _emptyAllowanceProof()})
        );

        uint256 batchBefore = usdc.balanceOf(address(batchFacilitator));

        push.settleCommunityDraw(periodId, attestation, signatures); // must not revert

        uint256 spent = usdc.balanceOf(address(batchFacilitator)) - batchBefore;
        assertEq(spent, 0, "a sub-$1 pot should buy nothing, not revert and not over-promise");
    }

}
