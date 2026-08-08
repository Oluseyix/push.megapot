/**
 * ---
 * @customize  Pure client-side simulation for paper/demo play - no wallet,
 *             no contract, no real funds. Mirrors Push.sol's own survival
 *             check exactly (`claimedTierIndex < crashTierIndex`) so the
 *             practice experience has the same odds shape as the real
 *             game, just resolved with `Math.random()` instead of Inco's
 *             sealed confidential draw. Never wire this into the real
 *             money flow - paper outcomes must never be presented as, or
 *             confused with, a real settlement.
 * ---
 */
export function pickCrashTierIndex(tierCount: number): number {
  return Math.floor(Math.random() * tierCount);
}

export function resolveClaim(claimedTierIndex: number, crashTierIndex: number): boolean {
  return claimedTierIndex < crashTierIndex;
}
