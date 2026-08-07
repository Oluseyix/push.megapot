# Push — frontend

- Real-stakes crash-style climb built on Megapot. See the repo root
  [`README.md`](../README.md) for the full design writeup.
- React 19 + wagmi v2 + RainbowKit + Vite 6 + Tailwind v3 — forked from
  Megapot's own [`megapot-starter-kit`](https://github.com/coordinationlabs/megapot-starter-kit),
  stripped to what Push needs (no LP, subscriptions, referral claims, or
  ticket-number picker - Push never surfaces specific Megapot ticket
  numbers to players).

## Setup

```sh
cd frontend
cp .env.example .env
pnpm install
pnpm run dev
```

Set `VITE_PUSH_ADDRESS` in `.env` once Push is deployed - every page shows
a "not deployed yet" banner until then (see the repo root README's "Deploy
target"). `VITE_CHAIN` defaults to `testnet` (Base Sepolia), matching the
deploy plan.

## Structure

- `src/pages/Home.tsx` — landing page, wallet-optional
- `src/pages/Play.tsx` — the whole stake → climb → cash-out/crash flow as
  one continuous screen (see its header comment for the phase state
  machine)
- `src/pages/Leaderboard.tsx` — ranked player stats
- `src/components/climb/` — `StakeForm` (amount selector) and `ClimbStage`
  (the animated multiplier/pot/ticket-particle presentation) + `PotIcon`
- `src/hooks/` — one hook per contract call (`useStake`,
  `useRequestCashOut`, `useSettleCashOut`, `usePushTicketPrice`,
  `usePushTiers`, `usePlayerStats`, `useLeaderboard`) plus the generic
  USDC/tx-flash helpers kept from the starter kit
- `src/abi/push.ts` — generated from `forge inspect Push abi --json`, not
  hand-written (see its header comment for the regenerate command)
- `src/lib/inco.ts` + `src/lib/attestation.ts` — the off-chain half of the
  cash-out flow: fetch a decryption attestation via `@inco/lightning-js`'s
  `Lightning.attestedDecrypt()`, convert it to the on-chain
  `DecryptionAttestation` shape `settleCashOut` expects

## What's real vs. still to verify

The climb animation (`useClimbPacing`, `ClimbStage`) is pure client-side
presentation with zero bearing on the real sealed outcome - see both
files' header comments. Everything else here is a real, direct wagmi/viem
call against Push and (for the attestation fetch) `@inco/lightning-js`.

The one part not yet exercised against live infrastructure: the exact
shape `Lightning.attestedDecrypt()` returns for a real attestation.
`src/lib/attestation.ts` converts it based on the SDK's own published type
definitions (confirmed, not guessed), but this session had no deployed
Push contract or live testnet access to run the full cash-out flow
end-to-end. Treat that conversion as the first thing to verify once Push
is deployed.

## Known rough edges

- `usePushTiers` reads `Push.tiers(i)` for `i` in `0..15` via multicall
  and keeps the contiguous successful prefix - there's no bulk getter on
  the contract. Fine for the current 7-tier deployment; raise `MAX_TIERS`
  if a future deployment configures more.
- `useLeaderboard` walks `Achievement` event logs from block 0 to find
  the set of players (no enumerable on-chain list exists). Fine for a
  fresh testnet deployment; a busy mainnet deployment would want a real
  indexer instead of raw `eth_getLogs` from genesis.
- `@inco/lightning-js` needs a `Buffer` polyfill to run in a browser
  (`src/polyfills.ts`, imported first in `main.tsx`) - it uses Node's
  `Buffer` global at module-eval time, which otherwise crashes the whole
  app immediately with "Buffer is not defined".
