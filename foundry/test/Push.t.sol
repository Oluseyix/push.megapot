// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco, euint256, ebool} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";
import {Push} from "../src/Push.sol";
import {console} from "forge-std/console.sol";
import {MockUSDC, MockRandomTicketBuyer, MockBatchFacilitator} from "./mocks/Mocks.sol";

contract PushTest is IncoTest {

    Push push;
    MockUSDC usdc;
    MockRandomTicketBuyer randomBuyer;
    MockBatchFacilitator batchFacilitator;
    address referrer = address(0xBEEF);

    uint256 constant TICKET_PRICE = 1_000_000;

    function setUp() public override {
        super.setUp(); // boots the full Inco fake infra - Safe deploy, TEE bootstrap, etc.

        usdc = new MockUSDC();
        randomBuyer = new MockRandomTicketBuyer(usdc);
        batchFacilitator = new MockBatchFacilitator(usdc);

        uint256[] memory tiers = new uint256[](7);
        tiers[0] = 1;
        tiers[1] = 2;
        tiers[2] = 3;
        tiers[3] = 5;
        tiers[4] = 8;
        tiers[5] = 12;
        tiers[6] = 20;

        push = new Push(address(randomBuyer), address(batchFacilitator), address(usdc), referrer, tiers);
        vm.deal(address(push), 10 ether); // Inco charges confidential-op fees from the CONTRACT's own ETH balance

        // Fund alice and bob to stake with, and give push a starting bankroll
        // by having a backer deposit real USDC first - stake() itself checks
        // bankroll can cover worst case, so an unfunded contract should
        // reject stakes (tested explicitly below).
        usdc.mint(alice, 10_000 * TICKET_PRICE);
        usdc.mint(bob, 10_000 * TICKET_PRICE);
        usdc.mint(address(this), 10_000 * TICKET_PRICE);
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
        push.stake(1);
        vm.stopPrank();
    }

    function testStakeSucceedsAndReservesWorstCase() public {
        _fundBankroll(100); // 100 USDC bankroll

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake(1);
        vm.stopPrank();

        // worst case for $1 staked, top tier 20x = $20 reserved
        (,, uint256 reserved,,) = push.rounds(roundId);
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
        uint256 roundId = push.stake(1);
        vm.stopPrank();

        // Claiming the lowest tier (index 0) against a fresh deployment's
        // first confidential draw survives deterministically - confirmed
        // empirically, not forced. KVStore.set() cannot override this: it
        // only affects the test harness's off-chain attestation-simulation
        // cache, not the real on-chain eRandBounded/eLt computation.
        uint8 claimedTierIndex = 0;

        vm.prank(alice);
        push.requestCashOut(roundId, claimedTierIndex);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        assertEq(randomBuyer.lastRecipient(), alice, "tickets should go to alice");
        assertEq(randomBuyer.lastCount(), 1, "tier 0 = 1x on a $1 stake = 1 ticket");

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
        uint256 roundId = push.stake(1);
        vm.stopPrank();

        (,,, euint256 crashTierIndex,) = push.rounds(roundId);
        uint256 actualCrashTier = uint256(get(euint256.unwrap(crashTierIndex)));

        // Claim the top tier (index 6) - survives only if actualCrashTier > 6,
        // which never happens since indices are drawn in [0,7). This
        // deterministically busts every time, which is exactly what this
        // test needs.
        vm.assume(actualCrashTier <= 6);
        uint8 claimedTierIndex = 6;

        uint256 bankrollBefore = push.bankroll();

        vm.prank(alice);
        push.requestCashOut(roundId, claimedTierIndex);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        assertEq(randomBuyer.callCount(), 0, "no tickets should be bought on a bust");
        assertEq(batchFacilitator.callCount(), 0, "no tickets should be bought on a bust");

        (,, uint256 reserved,,) = push.rounds(roundId);
        assertEq(push.bankroll(), bankrollBefore + reserved, "full reservation should return to bankroll on bust");

        (uint256 currentStreak,,,,, uint256 totalCrashes) = push.playerStats(alice);
        assertEq(currentStreak, 0, "streak should reset on crash");
        assertEq(totalCrashes, 1);
    }

    function testCannotSettleSameRoundTwice() public {
        _fundBankroll(1000);

        vm.startPrank(alice);
        usdc.approve(address(push), 1 * TICKET_PRICE);
        uint256 roundId = push.stake(1);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut(roundId, 6); // top tier, will bust deterministically per above
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
        uint256 roundId = push.stake(1);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(bytes("not your round"));
        push.requestCashOut(roundId, 0);
    }

    // ============================================================
    // Large payout routing: this is the exact bug the pasted Megapot docs
    // caught earlier in the conversation - anything over 10 tickets MUST
    // route through the batch facilitator, not the random buyer.
    // ============================================================

    function testLargePayoutRoutesThroughBatchFacilitatorNotRandomBuyer() public {
        _fundBankroll(5000);

        // Stake $15 and claim the lowest tier (index 0, value 1x). This tier
        // is empirically confirmed to survive as the first confidential draw
        // in a fresh deployment (see testCashOutOnSurviveBuysTicketsAndUpdatesStats).
        // 15 dollars * 1x = 15 tickets - already over the 10-ticket cap
        // without needing to survive any higher tier, which sidesteps trying
        // to force a specific value into an on-chain-computed confidential
        // result (see README note: KVStore.set() only affects the test
        // harness's off-chain attestation simulation cache, not the real
        // on-chain eRandBounded/eLt computation - it looked effective in an
        // earlier draft only because that computation happened to genuinely
        // survive on its own, not because of the override).
        vm.startPrank(alice);
        usdc.approve(address(push), 15 * TICKET_PRICE);
        uint256 roundId = push.stake(15);
        vm.stopPrank();

        vm.prank(alice);
        push.requestCashOut(roundId, 0);
        processAllOperations();

        bytes32 survivedHandle = push.pendingSurvivedHandle(roundId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(alice, HandleWithProof({handle: survivedHandle, proof: _emptyAllowanceProof()}));

        push.settleCashOut(roundId, attestation, signatures);

        assertEq(randomBuyer.callCount(), 0, "15 tickets must NOT go through the 10-ticket-capped random buyer");
        assertEq(batchFacilitator.callCount(), 1, "15 tickets must route through the batch facilitator");
        assertEq(batchFacilitator.lastDynamicCount(), 15);
        assertEq(batchFacilitator.lastRecipient(), alice);
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
        push.stake(30);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(push), 30 * TICKET_PRICE);
        push.stake(30);
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
        uint256 randomBefore = usdc.balanceOf(address(randomBuyer));

        push.settleCommunityDraw(periodId, attestation, signatures);

        uint256 spent = (usdc.balanceOf(address(batchFacilitator)) - batchBefore)
            + (usdc.balanceOf(address(randomBuyer)) - randomBefore);
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
        push.stake(1);
        vm.stopPrank();

        uint256 periodId = push.requestCommunityDraw();
        bytes32 winningWeightHandle = push.pendingCommunityWinningWeightHandle(periodId);
        (DecryptionAttestation memory attestation, bytes[] memory signatures) = getDecryptionAttestation(
            address(this), HandleWithProof({handle: winningWeightHandle, proof: _emptyAllowanceProof()})
        );

        uint256 batchBefore = usdc.balanceOf(address(batchFacilitator));
        uint256 randomBefore = usdc.balanceOf(address(randomBuyer));

        push.settleCommunityDraw(periodId, attestation, signatures); // must not revert

        uint256 spent = (usdc.balanceOf(address(batchFacilitator)) - batchBefore)
            + (usdc.balanceOf(address(randomBuyer)) - randomBefore);
        assertEq(spent, 0, "a sub-$1 pot should buy nothing, not revert and not over-promise");
    }

}
