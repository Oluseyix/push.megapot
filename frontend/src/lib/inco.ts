/**
 * ---
 * @customize  Lazily-created, cached `Lightning` client bound to the active
 *             chain (see config/contracts.ts's CHAIN). `Lightning.at*()` is
 *             async (it resolves deployment info), so this is memoized
 *             rather than created per-call.
 *
 *             `Lightning` is exported from the package's `/lite` subpath,
 *             not its root - confirmed against the installed package's
 *             `exports` map (`@inco/lightning-js/package.json`), not
 *             guessed.
 * ---
 */
import { Lightning } from '@inco/lightning-js/lite';
import { CHAIN } from '@/config/contracts';

// Let TS infer the exact (generic) return type from the two static
// constructors rather than hand-declaring `Promise<Lightning>`, which
// doesn't line up with `Lightning<Deployment>`'s type parameter.
let cached: ReturnType<typeof Lightning.baseMainnet> | ReturnType<typeof Lightning.baseSepoliaTestnet> | undefined;

export function getLightningClient() {
  cached ??= CHAIN === 'mainnet' ? Lightning.baseMainnet() : Lightning.baseSepoliaTestnet();
  return cached;
}
