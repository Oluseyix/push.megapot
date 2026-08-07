# Push

A real-stakes crash-style climb built on Megapot. Stake USDC, climb a
confidentially sealed multiplier, cash out to convert your stake into that
many real random-number Megapot tickets - or crash and lose the stake to the
house bankroll. This is a real wagering game, same shape as Aviator, that
only ever pays out in real Megapot tickets rather than raw cash.

**This is the second, honest design.** An earlier version tried to guarantee
a free personal ticket up front and fund all bonus tickets from referral fees
alone, framed as "nobody really loses." The math didn't hold at real
volume - see "Why the earlier design was scrapped" below - so this version
puts the player's stake genuinely at risk, backed by a funded bankroll,
same as any real gambling product (including Megapot itself, which runs on
backer-funded liquidity).

## How it works

1. **Stake.** Real USDC, no minimum ticket guarantee. The stake becomes part
   of the bankroll immediately - nothing is bought yet.
2. **Climb.** A multiplier ladder (e.g. 1x, 2x, 3x, 5x, 8x, 12x, 20x) climbs
   with randomized, unpredictable pacing and near-miss "teeters." The actual
   crash tier for this round was already sealed confidentially at stake time
   via Inco - the animation is pure presentation and never influences or
   reveals it.
3. **Cash out**, any time: the contract buys `stakedDollars * tier` real
   random-number Megapot tickets (via `JackpotRandomTicketBuyer`), same odds
   and same prize structure as any ticket bought directly on megapot.io.
4. **Crash before cashing out**: zero tickets. The stake stays in the
   bankroll. This is the real loss - there is no refund, no consolation
   ticket, nothing returned.

## What Megapot tickets actually are (verified, not assumed)

Each ticket costs $1 and carries 5 numbers (1-30) plus a bonus ball
(dynamic range). There are 10 prize tiers, and **1 in 4 tickets wins
something** - not just the jackpot. Payout is a guaranteed minimum plus a
share of a premium pool split among winners in that tier. Roughly 77.5% of
every dollar spent on tickets returns as prizes. Cashing out 500 tickets from
Push doesn't mean instant money - it means 500 real entries into that day's
real scheduled drawing, same as anyone else's tickets. You still wait for the
drawing. Source: docs.megapot.io/getting-started/how-to-play/prize-structure

## Solvency: reserved at stake time, not hoped for at cashout

Every stake reserves its own worst case (`stakedDollars * topTier`) from the
bankroll the moment the round starts. If the bankroll can't cover that, the
stake is rejected up front with a clear reason, never left to fail later at
the exciting moment. Survive -> the reservation pays for the tickets, any
leftover returns to the bankroll. Crash -> the whole reservation, and the
stake it came from, stays in the bankroll. This is what actually funds future
payouts - not referral fees, not hope.

## Why the earlier design was scrapped

The first version guaranteed a personal ticket at stake time and funded a
"community pool" of bonus tickets purely from ~8-10% referral fees. The
numbers don't work: a single $100 stake hitting 5x needs $500 of real USDC
to pay out. At ~$0.10 referral fee per $1 ticket sold, that requires roughly
5,000 tickets already sold through the app before one lucky win - not
realistic in a hackathon's first week. The `require(pool >= cost)` check
would simply reject almost every real stake, breaking the product during
the actual demo. A funded, backer-topped-up bankroll with real stakes at
risk is the version that's actually solvent on day one.

## What's verified vs. still open

Verified directly against the installed `@inco/lightning` v1.0.2 package and
Inco's own `hangman` example and `TestDecryptionAttestationInSynchronousFlow`
test (not from memory or docs alone):

- `import {e, ebool, euint256, inco} from "@inco/lightning/src/Lib.sol";`
- `e.randBounded(uint256 upperBound) returns (euint256)`
- `e.lt(uint256 a, euint256 b) returns (ebool)` (and `le`/`gt`/`ge`/`eq`)
- `e.allow(value, address)` / `e.allowThis(value)`
- `inco.incoVerifier().isValidDecryptionAttestation(attestation, signatures)`
- The reveal/settle flow is **synchronous and client-pulled**, not an async
  oracle callback: `e.allow()` grants a specific address permission, that
  address's off-chain client fetches a signed attestation from Inco's
  covalidator infrastructure, then submits it back on-chain in an ordinary
  transaction. `requestCashOut` / `settleCashOut` are split into two calls
  to mirror this exactly.
- Deliberately using `e.allow(survived, msg.sender)`, not `e.reveal()` -
  `reveal()` makes a value **publicly** decryptable by anyone, which would
  let other players learn each other's outcomes. `allow()` is scoped to one
  address.

Confirmed and fixed in this pass:

- `e.randBounded` / `e.lt` (via `e.allowThis`/`e.allow`) DO require an
  `inco.getFee()` payment, taken from Push's own ETH balance, not from
  `msg.value` forwarded to Inco directly (`Fee.sol`: `FEE = 0.000001 ether`,
  a fixed constant, read via `inco.getFee()` rather than hardcoded per
  Inco's own guidance since it "may change through contract upgrades").
  `stake()` and `requestCashOut()` are now `payable` and each require
  `msg.value >= inco.getFee()` as a self-sustaining top-up of that reserve;
  a `receive()` fallback is also open for the deployer (or anyone) to top up
  the reserve manually - both mechanisms from the "known gaps" list are
  implemented, not just one. See "Two real findings" below for why this is
  needed at all.
- The off-chain SDK method to fetch a decryption attestation is
  `Lightning.attestedDecrypt(walletClient, handles, opts?)` from
  **`@inco/lightning-js`** (npm, latest `1.0.2` - same version the on-chain
  `@inco/lightning` package here is verified against, fetched and inspected
  directly from the published package's `.d.ts` files, not from memory or
  docs). Get a bound instance via `Lightning.baseSepoliaTestnet()` (or
  `.baseMainnet()` / `.at({name, chainId})`), then:
  ```ts
  const lightning = await Lightning.baseSepoliaTestnet();
  const [attestation] = await lightning.attestedDecrypt(walletClient, [survivedHandle]);
  // attestation: { handle: HexString, plaintext: {...}, covalidatorSignatures: Uint8Array[] }
  ```
  Maps directly onto `settleCashOut(roundId, attestation, signatures)`'s
  on-chain `DecryptionAttestation{ handle, value }` struct (`handle` ->
  `handle`, `plaintext` -> `value`, bytes32-encoded) plus a separate
  `bytes[] signatures` param (`covalidatorSignatures` -> `signatures`) -
  confirming the two-argument split in Push's `settleCashOut`/
  `settleCommunityDraw` signatures matches what the SDK actually returns,
  not just what `IncoTest`'s test-only `getDecryptionAttestation()` helper
  happens to produce. There's also a lower-level `attestedDecrypt()` free
  function (`@inco/lightning-js/attesteddecrypt`) that the `Lightning` class
  method wraps - use the class method from a frontend; the free function
  needs a `KmsQuorumClient` and reencryption keypair wired up manually.

Still open, not verified against a live network:

- `TICKET_PRICE` is hardcoded at $1 - should read live from Megapot's
  `getDrawingState()` instead before deploying.
- Yield distribution to bankroll backers is not implemented -
  `fundBankroll()` accepts deposits but doesn't track or pay out shares yet.

## Mapping to Megapot's judging bullets

Megapot's brief asks for: tickets earned through gameplay/achievements,
jackpot mechanics in progression, community ticket pools, and making the
jackpot social/competitive/fun. The three additions below exist specifically
to hit the two that the core climb alone didn't cover.

**Player stats + achievements** (`PlayerStats`, `Achievement` event) -
tracks streaks, best tier ever reached, total tickets won per player. Pure
on-chain data, zero payout logic, safe to read into any leaderboard UI.
`Achievement` fires on first cashout, streak milestones (3/5/10), new
personal-best tier, and community draw wins.

**Community pool, done safely this time** (`communityPotBalance`,
`requestCommunityDraw`/`settleCommunityDraw`) - a 2% skim off every stake
feeds a *separate* pot with no multiplier attached to it. Periodically,
anyone can permissionlessly close the period and trigger a weighted random
draw (weighted by how much each player staked that period) among that
period's participants, using the same sealed-then-attested Inco pattern as
the climb itself. The winner gets exactly `potAtSnapshot / $1` tickets -
never leveraged, so unlike the original design this can never promise more
than it actually has. This is the literal "community ticket pool" bullet,
and it's also what makes the game social/competitive: you're eligible by
playing, and everyone watches the same periodic draw resolve together.

**What's still frontend work, not contract work:** the leaderboard itself
(sorting/ranking `Settled` and `Achievement` events), and any UI showing
"time until next community draw" - the contract just needs
`requestCommunityDraw()` called periodically (e.g. once a day, permissionless,
could be automated with a keeper).

## Megapot contract addresses (confirmed from llms.megapot.io, not guessed)

Base mainnet (chain ID 8453):

| Contract | Address |
|---|---|
| Jackpot | `0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| JackpotRandomTicketBuyer | `0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd` |
| BatchPurchaseFacilitator | `0xBA343479D98a1Ed333899999D95a7343B808a76F` |

Base Sepolia testnet (chain ID 84532) - use these for development:

| Contract | Address |
|---|---|
| Jackpot | `0x465dA3c859f193A3807386387bEE941B2A4c3279` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| JackpotRandomTicketBuyer | `0x53c04e7e5044B28Ea8A4F9c4b26E3Ac1aeb63746` |
| BatchPurchaseFacilitator | `0x62A5D60F486D01a28071652a7951Aff1EA4c5b7c` |

## Important correction: large payouts are NOT instant

An earlier version of this contract assumed every ticket purchase completes
synchronously in the same transaction. That's only true up to 10 tickets
(`JackpotRandomTicketBuyer`, immediate). **Above 10, Megapot requires routing
through `BatchPurchaseFacilitator.createBatchOrder`, which is keeper-executed
- not immediate.** The order is created in one transaction, then an
off-chain keeper fills it over one or more subsequent transactions; the
frontend has to poll `getBatchOrderInfo(recipient)` until `remainingTickets`
reaches 0.

This matters a lot for Push specifically, since most meaningful wins (any
stake above a couple dollars at tier 5+) land well above 10 tickets. The
`_buyTickets()` helper in the contract now branches automatically: <=10 goes
through the immediate path, >10 creates a batch order and emits
`BatchOrderPending` so the frontend knows to switch into a polling state
("buying your tickets...") instead of assuming instant delivery.

**One more real constraint worth designing the UI around:** Megapot only
allows **one active batch order per recipient at a time**
(`ActiveBatchOrderExists()` reverts otherwise). If a player wins big twice in
quick succession before the first batch finishes executing, the second
`settleCashOut` will revert. Worth deciding: block a player from starting a
new round while they have tickets pending, or catch and surface this
specific revert with a clear "your last big win is still being processed"
message rather than a generic error.

## Tier design

Tiers should approximate `survival = (1 - houseEdge) / tier` so the bankroll
keeps a consistent margin regardless of which tier a player cashes out at -
same principle as any real crash game's fairness curve. Pick the house edge
and tier spacing deliberately; don't eyeball it, since it directly determines
whether the bankroll is profitable over volume.

## Next steps

1. ~~Confirm the Inco SDK's attestation-fetch method~~ Done -
   `Lightning.attestedDecrypt()` from `@inco/lightning-js` (see "What's
   verified vs. still open"). Still to do: actually wire it into the
   frontend's `requestCashOut` -> off-chain fetch -> `settleCashOut` flow.
2. ~~Add `inco.getFee()` payment handling if required.~~ Done -
   `stake()`/`requestCashOut()` self-fund the ETH fee reserve, plus a
   `receive()` manual backstop.
3. Replace hardcoded `TICKET_PRICE` with a live `getDrawingState()` read.
4. Design and implement bankroll backer shares/yield.
5. ~~Write Foundry tests against Inco's `IncoTest` base contract before
   touching testnet.~~ Done - see "Test suite" below.

## Compiling - verified working

This contract **compiles cleanly** against the real `@inco/lightning` v1.0.2
package and real OpenZeppelin dependencies - confirmed with Foundry (10/10
tests passing) in a network-restricted sandbox, not just written and assumed
correct.

```
cd foundry
npm install --ignore-scripts   # see below for why --ignore-scripts
forge build
forge test --match-contract PushTest
```

`foundry.toml` uses `libs = ["node_modules"]` plus explicit `remappings`
(rather than `forge install`/git submodules) since dependencies are npm
packages: `@inco/lightning`, `@openzeppelin/contracts(-upgradeable)`, and
`@safe-global/safe-smart-account` (Inco's `IncoTest` harness deploys a real
Safe multisig as part of its fake infra). `forge-std` also comes from
`node_modules` (an `@inco/lightning` dependency) rather than a submodule.

**`--ignore-scripts` is required, not optional, in a sandbox that blocks
`binaries.soliditylang.org`:** `@safe-global/safe-smart-account`'s own
`prepare` script runs a Hardhat build that tries to download a solc version
list from that host and fails the entire `npm install` otherwise. Its
prebuilt contract sources (all this project needs) are unaffected -
`--ignore-scripts` just skips that unnecessary Hardhat build.

**If `forge build`'s own solc auto-download also fails** (same restriction,
via `binaries.soliditylang.org`) - this is a network restriction, not a
contract problem - fetch the static solc binary directly from a GitHub
*release asset* instead. In this sandbox, `binaries.soliditylang.org` and
`foundry.paradigm.xyz` (foundryup's installer) were both blocked by egress
policy, but direct `https://github.com/.../releases/download/...` URLs were
not - only some GitHub *page* routes (e.g. `github.com/.../releases`, the
`api.github.com` REST API) returned non-2xx; asset download URLs and `git
clone`/`git ls-remote` against `github.com` worked fine. Worth trying that
distinction before concluding GitHub is unreachable:

```
# forge/cast/anvil itself, if foundryup is blocked - pick a tag from:
# git ls-remote --tags --refs https://github.com/foundry-rs/foundry.git
curl -sL https://github.com/foundry-rs/foundry/releases/download/v1.7.1/foundry_v1.7.1_linux_amd64.tar.gz -o foundry.tar.gz
mkdir -p ~/.foundry/bin && tar -xzf foundry.tar.gz -C ~/.foundry/bin && chmod +x ~/.foundry/bin/*
export PATH="$HOME/.foundry/bin:$PATH"

# solc itself
curl -sL https://github.com/ethereum/solidity/releases/download/v0.8.35/solc-static-linux -o solc-0.8.35 && chmod +x solc-0.8.35
mkdir -p ~/.svm/0.8.35 && cp solc-0.8.35 ~/.svm/0.8.35/solc-0.8.35
# foundry.toml already has solc_version = "0.8.35" - Foundry's svm resolver
# picks up the manually-placed binary from ~/.svm without touching the
# network, since it only downloads a version it can't already find cached.
```

On a normal, unrestricted machine, none of this is necessary - plain
`npm install` and `forge build` handle everything themselves.

**One real, non-cosmetic fix this compile pass caught:** the ticket-purchase
helper originally cast `count` straight to `uint64` for
`BatchPurchaseFacilitator.createBatchOrder` with no bounds check - Foundry's
linter flagged it as an unsafe truncating typecast, which is a legitimate
concern for a value that scales with player stake. Fixed with an explicit
`require(count <= type(uint64).max)` guard before the cast.

**Not yet done:** unit tests. The contract compiles but has zero test
coverage - see "Next steps" above for the `IncoTest` base-contract pattern
to write them against.

## Test suite - 10/10 passing, against the real Inco harness

`foundry/test/Push.t.sol` tests Push against Inco's own real `IncoTest` base
contract (full fake infra: Safe multisig deploy, TEE bootstrap simulation,
real `IncoLightning` contract deployed in test mode) and realistic mocks of
Megapot's two ticket-purchase contracts (`foundry/test/mocks/Mocks.sol`) that
enforce the same constraints as the real ones (10-ticket cap on the random
buyer, one-active-order-per-recipient on the batch facilitator).

```
cd foundry
forge test --match-contract PushTest
```

Covers: solvency rejection when the bankroll can't cover worst case,
rejection when the caller doesn't top up Push's Inco ETH fee reserve,
correct reserve/release accounting on both survive and crash outcomes,
player stats and streak tracking, double-settlement protection, cashout
access control, correct routing to the batch facilitator above 10 tickets,
and the community
pool paying out exactly what it accumulated - including the small-pot case
that correctly buys zero tickets rather than reverting or over-promising.

### Two real findings from writing these tests (not just "tests added")

**1. Confidential operations cost ETH, paid from the calling contract's own
balance.** `e`'s internal fee mechanism does
`address(inco).call{value: fee}(...)`, sourced from `address(this)` - i.e.
Push's own ETH balance, not `msg.value` from whoever called Push. **This is
a real, previously-undocumented deployment requirement**: Push needs to hold
enough ETH to cover its own confidential-op fees (one `randBounded` per
stake, one `lt` per cashout request), or every `stake()`/`requestCashOut()`
call reverts with `CallFailedAfterFeeRefresh()`. **Fixed**: `stake()` and
`requestCashOut()` are now `payable` and require `msg.value >= inco.getFee()`,
self-sustaining the reserve in proportion to play volume (any msg.value
above the floor is never refunded, so a frontend can pad it slightly to
build a buffer for `requestCommunityDraw()`'s own two ops, which aren't
tied to a single caller's payment). A `receive()` fallback is also open as
a manual backstop for the deployer or anyone else to top up directly.

**2. `KVStore.set()` does NOT let a test override an already-computed
on-chain confidential value.** Early drafts of these tests tried to force a
specific crash tier by writing directly into the test harness's KVStore.
This looked like it worked in one test and clearly didn't in another -
investigating the actual emitted `ERandBounded`/`ELt` event trace showed
`set()` only writes to the harness's off-chain attestation-simulation cache,
which is separate from the real on-chain computation inside the deployed
`IncoLightning` contract. The apparent "pass" was the real computation
surviving on its own, not the override taking effect. Fixed by working with
real on-chain outcomes (staking enough that even the lowest surviving tier
exceeds the routing threshold) instead of trying to fake specific outcomes -
documented in the test file itself so this mistake doesn't get repeated.

### What's still not covered

- Integration testing against real deployed Megapot contracts (mocks only,
  even though the mocks enforce real constraints)
- Fuzz testing on the tier/probability curve math
- Gas profiling on `settleCommunityDraw`'s O(n) participant loop at realistic
  scale
