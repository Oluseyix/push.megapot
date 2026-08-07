// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {Push} from "../src/Push.sol";

/// @notice Deploys Push to Base Sepolia using real Megapot contract
/// addresses, then seeds Push's own ETH balance so its first
/// stake()/requestCashOut() calls don't revert with
/// CallFailedAfterFeeRefresh() (see README "Two real findings" - Inco
/// charges confidential-op fees from the calling contract's own ETH
/// balance, not from msg.value).
///
/// Usage:
///   cd foundry
///   export PRIVATE_KEY=0x...            # deployer key, funded with Base Sepolia ETH
///   export REFERRER_ADDRESS=0x...       # your wallet - earns referral fees on every ticket bought through Push
///   forge script script/DeployPush.s.sol:DeployPush \
///     --rpc-url https://sepolia.base.org \
///     --broadcast
///
/// Get Base Sepolia ETH from a faucet (e.g. https://www.alchemy.com/faucets/base-sepolia)
/// before running - the deployer key needs enough to cover deployment gas
/// plus INITIAL_ETH_SEED below.
///
/// After deploying:
///   1. Set VITE_PUSH_ADDRESS in frontend/.env to the printed address.
///   2. Get Base Sepolia test USDC (Megapot's own faucet, or bridge/mint
///      one via Circle's testnet faucet) and call fundBankroll(amount) -
///      stake() rejects every stake until the bankroll can cover at least
///      a $1 stake's worst case (top tier x $1 x tiers.length - 1).
contract DeployPush is Script {
    // Base Sepolia (chain ID 84532) - confirmed against
    // megapot-starter-kit's src/config/contracts.ts, cross-checked against
    // the README's own "confirmed from llms.megapot.io" table. See
    // README "Megapot contract addresses" for the mainnet equivalents.
    address constant JACKPOT = 0x465dA3c859f193A3807386387bEE941B2A4c3279;
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant BATCH_PURCHASE_FACILITATOR = 0x62A5D60F486D01a28071652a7951Aff1EA4c5b7c;

    // Initial ETH seed for Push's own Inco confidential-op fee reserve.
    // Fee.sol's FEE constant is a fixed 0.000001 ether per op (one
    // randBounded per stake, one lt per cashout request) - 0.01 ether
    // covers thousands of calls before a top-up (via fundBankroll's
    // sibling, the receive() fallback - see gap 1) is needed. Adjust freely.
    uint256 constant INITIAL_ETH_SEED = 0.01 ether;

    // Same tier ladder as the test suite (foundry/test/Push.t.sol) -
    // survival = (1 - houseEdge) / tier, see README "Tier design".
    function _tiers() internal pure returns (uint256[] memory tiers) {
        tiers = new uint256[](7);
        tiers[0] = 1;
        tiers[1] = 2;
        tiers[2] = 3;
        tiers[3] = 5;
        tiers[4] = 8;
        tiers[5] = 12;
        tiers[6] = 20;
    }

    function run() external returns (Push push) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address referrer = vm.envAddress("REFERRER_ADDRESS");

        vm.startBroadcast(deployerKey);
        push = new Push(JACKPOT, BATCH_PURCHASE_FACILITATOR, USDC, referrer, _tiers());
        (bool ok,) = address(push).call{value: INITIAL_ETH_SEED}("");
        require(ok, "ETH seed transfer to Push failed");
        vm.stopBroadcast();

        console.log("Push deployed to:", address(push));
        console.log("Seeded Inco fee reserve with (wei):", INITIAL_ETH_SEED);
        console.log("Next: set VITE_PUSH_ADDRESS in frontend/.env to the address above.");
        console.log("Next: call fundBankroll(amount) with test USDC before real stakes can be accepted.");
    }
}
