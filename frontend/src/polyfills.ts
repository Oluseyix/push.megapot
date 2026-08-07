/**
 * ---
 * @customize  Node global polyfills required by `@inco/lightning-js`, which
 *             uses `Buffer` at module-eval time (not just inside functions)
 *             - it crashes the whole app with "Buffer is not defined" the
 *             moment it's imported in a browser without this. Must be
 *             imported FIRST in `main.tsx`, before anything that might
 *             transitively import `@inco/lightning-js`.
 * ---
 */
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
