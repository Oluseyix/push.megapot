/**
 * ---
 * @customize  Pure client-side presentation - the multiplier shown here,
 *             the "teeter" dips, and the ticket-burst count are all
 *             cosmetic pacing decided in `usePushClimb` (or wherever the
 *             caller drives `burstToken`/`teeterToken` from). None of it
 *             reads or influences the real sealed crash tier, which stays
 *             encrypted on-chain until `settleCashOut` decrypts it. Never
 *             wire this component's props from anything that knows the
 *             real outcome early.
 *
 *             `phase`:
 *               - 'climbing'  — pot upright, glowing, multiplier ticking up
 *               - 'cashedOut' — pot stays upright, calmer glow, frozen at
 *                                the claimed multiplier
 *               - 'crashed'   — pot tips over and drops, tickets spill down
 *                                (never confetti - a crash is a loss, not
 *                                a celebration)
 * ---
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PotIcon } from './PotIcon';

type Phase = 'climbing' | 'cashedOut' | 'crashed';

type Particle = { id: number; dxStart: number; dxEnd: number; rot: number; spill: boolean };

let particleSeq = 0;

export function ClimbStage({
  phase,
  multiplier,
  burstToken,
  teeterToken,
}: {
  phase: Phase;
  multiplier: number;
  /** Bump this (e.g. a counter) whenever a new tier fires ticket particles. */
  burstToken: number;
  /** Bump this to trigger a one-off teeter wobble on the pot. */
  teeterToken: number;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [teetering, setTeetering] = useState(false);
  const crashedSpillFired = useRef(false);

  const spawn = useCallback((count: number, spill: boolean) => {
    const fresh: Particle[] = Array.from({ length: count }, () => ({
      id: particleSeq++,
      dxStart: (Math.random() - 0.5) * 16,
      dxEnd: (Math.random() - 0.5) * 90,
      rot: (Math.random() - 0.5) * 360,
      spill,
    }));
    setParticles((prev) => [...prev, ...fresh]);
    const ids = new Set(fresh.map((p) => p.id));
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 950);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: burstToken is the trigger, not a value read inside
  useEffect(() => {
    if (burstToken === 0) return;
    spawn(3 + Math.floor(Math.random() * 3), false);
  }, [burstToken]);

  useEffect(() => {
    if (teeterToken === 0) return;
    setTeetering(true);
    const id = setTimeout(() => setTeetering(false), 430);
    return () => clearTimeout(id);
  }, [teeterToken]);

  useEffect(() => {
    if (phase === 'crashed' && !crashedSpillFired.current) {
      crashedSpillFired.current = true;
      spawn(8, true);
    }
    if (phase !== 'crashed') {
      crashedSpillFired.current = false;
    }
  }, [phase, spawn]);

  const colorClass =
    phase === 'crashed'
      ? 'text-rose-600 dark:text-rose-400'
      : phase === 'cashedOut'
        ? 'text-brand-primary-600 dark:text-brand-primary-400'
        : 'text-zinc-900 dark:text-zinc-50';

  return (
    <div className="relative flex flex-col items-center gap-4 overflow-hidden py-8">
      <div
        className={`font-mono text-5xl font-bold tabular-nums transition-colors sm:text-6xl ${colorClass}`}
        aria-live="polite"
      >
        {multiplier.toFixed(2)}x
      </div>

      <div className="relative flex h-28 w-28 items-center justify-center">
        {particles.map((p) => (
          <span
            key={p.id}
            aria-hidden="true"
            className={`absolute bottom-10 left-1/2 h-2.5 w-4 rounded-[2px] bg-brand-primary-500 dark:bg-brand-primary-400 ${
              p.spill ? 'animate-push-ticket-spill' : 'animate-push-ticket-up'
            }`}
            style={
              {
                '--dx-start': `${p.dxStart}px`,
                '--dx-end': `${p.dxEnd}px`,
                '--rot': `${p.rot}deg`,
              } as React.CSSProperties
            }
          />
        ))}

        <div
          className={
            'text-zinc-800 dark:text-zinc-100 ' +
            (phase === 'crashed'
              ? 'animate-push-pot-tip text-rose-600 dark:text-rose-400'
              : phase === 'climbing'
                ? `animate-push-pot-glow ${teetering ? 'animate-push-teeter' : ''}`
                : 'text-brand-primary-600 dark:text-brand-primary-400')
          }
        >
          <PotIcon />
        </div>
      </div>

      {phase === 'crashed' && (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
          Crashed — the stake stays in the bankroll.
        </p>
      )}
      {phase === 'cashedOut' && (
        <p className="text-sm font-medium text-brand-primary-600 dark:text-brand-primary-400">
          Cashed out.
        </p>
      )}
    </div>
  );
}
