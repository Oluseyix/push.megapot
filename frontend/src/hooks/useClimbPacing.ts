/**
 * ---
 * @customize  Drives the climb screen's presentation-only pacing: which
 *             tier index is "currently showing", when to fire a ticket
 *             burst, when to trigger a teeter wobble. This has NO bearing
 *             on the real sealed crash tier - it's just deciding how the
 *             animation paces itself while the player watches. When the
 *             player hits "Cash Out", whatever tier index this hook is
 *             currently sitting on is what gets passed to
 *             `requestCashOut(roundId, claimedTierIndex)` - that's the
 *             tier being claimed, checked against the real sealed value
 *             only at settle time.
 *
 *             Pacing: each tier holds for a randomized 700–1700ms before
 *             advancing; every advance fires a ticket burst; a teeter
 *             (dip that recovers) fires randomly about 1-in-3 tier holds.
 *             Holds at the top tier once reached rather than resetting -
 *             the player can still cash out there, they just don't
 *             "grow" further.
 * ---
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useClimbPacing(tiers: number[], running: boolean) {
  const [tierIndex, setTierIndex] = useState(0);
  const [burstToken, setBurstToken] = useState(0);
  const [teeterToken, setTeeterToken] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!running || tiers.length === 0) return;

    const scheduleNext = (fromIndex: number) => {
      const delay = 700 + Math.random() * 1000;
      timeoutRef.current = setTimeout(() => {
        if (Math.random() < 0.32) {
          setTeeterToken((t) => t + 1);
        }
        const next = Math.min(fromIndex + 1, tiers.length - 1);
        setTierIndex(next);
        setBurstToken((b) => b + 1);
        if (next < tiers.length - 1) {
          scheduleNext(next);
        }
      }, delay);
    };

    scheduleNext(0);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [running, tiers.length]);

  const reset = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTierIndex(0);
    setBurstToken(0);
    setTeeterToken(0);
  }, []);

  return {
    tierIndex,
    multiplier: tiers[tierIndex] ?? 1,
    burstToken,
    teeterToken,
    reset,
  };
}
