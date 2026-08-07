/**
 * ---
 * @customize  Dev-mode boot diagnostics.
 *
 *             Houses two unrelated boot-time concerns:
 *               1. `BigInt.prototype.toJSON` polyfill — global, runs in all
 *                  environments. Push reads return uint256 → bigint
 *                  everywhere; the polyfill catches any rogue
 *                  `JSON.stringify` in dev tooling, wallet SES shims, error
 *                  reporters, or observer notify paths.
 *               2. Placeholder + config warnings — gated on
 *                  `import.meta.env.DEV` so production stays silent.
 *
 *             Imported once from `main.tsx`; no exports — pure side effects.
 * ---
 */
import { PUSH_DEPLOYED } from './contracts';

// Belt + suspenders for bigint JSON serialization. See `main.tsx` for the
// rationale — keep alongside `hashFn` from wagmi/query so nothing in the
// React tree can blow up on a bigint serialization.
// biome-ignore lint/suspicious/noExplicitAny: BigInt.prototype.toJSON is non-standard
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

if (import.meta.env.DEV) {
  if (!PUSH_DEPLOYED) {
    // biome-ignore lint/suspicious/noConsole: deliberate dev-mode diagnostic
    console.warn(
      '[push] VITE_PUSH_ADDRESS is unset — every read/write against Push will fail until it is deployed and configured. See README "Deploy target".',
    );
  }
  if (!import.meta.env.VITE_WALLETCONNECT_PROJECT_ID) {
    // biome-ignore lint/suspicious/noConsole: deliberate dev-mode diagnostic
    console.warn(
      '[push] VITE_WALLETCONNECT_PROJECT_ID is empty — degraded wallet picker. Only injected wallets (MetaMask extension, Rabby, Brave, Phantom, etc.) and Coinbase Wallet are available. Get a free projectId at https://cloud.walletconnect.com to enable the full RainbowKit modal.',
    );
  }
}
