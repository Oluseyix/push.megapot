/**
 * ---
 * @customize  Drives the climb screen's presentation-only pacing. This has
 *             NO bearing on the real sealed crash tier - it's purely
 *             deciding how the animation paces itself while the player
 *             watches. When the player hits "Cash Out", `tierIndex` (the
 *             highest tier fully reached) is what gets passed to
 *             `requestCashOut(roundId, claimedTierIndex)` - that's the
 *             tier being claimed, checked against the real sealed value
 *             only at settle time.
 *
 *             `multiplier` is a SMOOTH continuous value (not a jump
 *             between the discrete tier numbers) - it grows
 *             exponentially, decelerating as it nears the top tier's
 *             value, and holds there once reached (`isMaxed`). `tierIndex`
 *             is derived from it each frame: the highest tier whose value
 *             is <= the current smooth multiplier. A tier-crossing (e.g.
 *             passing 5x on the way to 8x) fires a ticket burst; an
 *             independent, purely cosmetic "teeter" wobble fires
 *             periodically and never affects the multiplier's value.
 * ---
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// Time (seconds) for the multiplier to reach the top tier's value, before
// decelerating into a hold there. Tuned for a game that feels alive within
// a few seconds but still gives a real window to decide when to cash out.
const SECONDS_TO_TOP_TIER = 14;

function effectiveTierIndex(tiers: number[], multiplier: number): number {
  let index = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i] <= multiplier) index = i;
  }
  return index;
}

export function useClimbPacing(tiers: number[], running: boolean) {
  const [multiplier, setMultiplier] = useState(1);
  const [burstToken, setBurstToken] = useState(0);
  const [teeterToken, setTeeterToken] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const lastTierIndexRef = useRef(0);
  const nextTeeterAtRef = useRef(0);

  useEffect(() => {
    if (!running || tiers.length === 0) return;

    const topTierValue = tiers[tiers.length - 1];
    const growthRate = Math.log(topTierValue) / SECONDS_TO_TOP_TIER;
    startRef.current = performance.now();
    lastTierIndexRef.current = 0;
    nextTeeterAtRef.current = 1500 + Math.random() * 1500;

    const tick = (now: number) => {
      const elapsedMs = now - (startRef.current ?? now);
      const elapsedSec = elapsedMs / 1000;
      const raw = Math.exp(growthRate * elapsedSec);
      const next = Math.min(raw, topTierValue);
      setMultiplier(next);

      const newTierIndex = effectiveTierIndex(tiers, next);
      if (newTierIndex > lastTierIndexRef.current) {
        lastTierIndexRef.current = newTierIndex;
        setBurstToken((b) => b + 1);
      }

      if (elapsedMs >= nextTeeterAtRef.current) {
        nextTeeterAtRef.current = elapsedMs + 1800 + Math.random() * 2200;
        setTeeterToken((t) => t + 1);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running, tiers]);

  const reset = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setMultiplier(1);
    setBurstToken(0);
    setTeeterToken(0);
    lastTierIndexRef.current = 0;
  }, []);

  const tierIndex = tiers.length > 0 ? effectiveTierIndex(tiers, multiplier) : 0;
  const topTierValue = tiers.length > 0 ? tiers[tiers.length - 1] : undefined;
  const isMaxed = topTierValue !== undefined && multiplier >= topTierValue;
  // Log-scaled 0..1 flight-path progress. multiplier grows as
  // exp(growthRate * t), so log(multiplier) grows linearly with elapsed
  // time - this gives the ascending curve a steady visual pace even
  // though the displayed number itself is accelerating.
  const progress =
    topTierValue !== undefined && topTierValue > 1
      ? Math.min(1, Math.log(multiplier) / Math.log(topTierValue))
      : 0;

  return {
    multiplier,
    tierIndex,
    isMaxed,
    progress,
    burstToken,
    teeterToken,
    reset,
  };
}
