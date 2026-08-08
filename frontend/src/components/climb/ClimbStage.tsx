/**
 * ---
 * @customize  Pure client-side presentation - the multiplier shown here,
 *             the ascending-curve position, and the ticket-burst count
 *             are all cosmetic pacing driven by `useClimbPacing`. None of
 *             it reads or influences the real sealed crash tier, which
 *             stays encrypted on-chain until `settleCashOut` decrypts it.
 *             Never wire this component's props from anything that knows
 *             the real outcome early.
 *
 *             Structure deliberately mirrors a crash-game canvas (dark,
 *             full-bleed, glowing ascending trail, big central number)
 *             rather than a plain card - `progress` (0..1, log-scaled so
 *             it moves at a steady pace even though `multiplier` itself
 *             accelerates) positions the pot along the trail.
 *
 *             `phase`:
 *               - 'climbing'  — pot ascending, glowing, multiplier ticking up
 *               - 'cashedOut' — pot freezes in place, calmer glow
 *               - 'crashed'   — pot drops and tips over, tickets spill down
 *                                (never confetti - a crash is a loss, not
 *                                a celebration)
 * ---
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PotIcon } from './PotIcon';

type Phase = 'climbing' | 'cashedOut' | 'crashed';

type Particle = { id: number; dxStart: number; dxEnd: number; rot: number; spill: boolean };

let particleSeq = 0;

// Trail path: bottom-left origin to the pot's current position, through a
// control point that bows the curve outward (visually reads as "flight
// path" rather than a straight ramp). Coordinates are percentages of a
// 0..100 viewBox.
function trailPath(x: number, y: number): string {
  const startX = 4;
  const startY = 92;
  const controlX = startX + (x - startX) * 0.5;
  const controlY = startY;
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${x} ${y}`;
}

export function ClimbStage({
  phase,
  multiplier,
  progress,
  burstToken,
  teeterToken,
}: {
  phase: Phase;
  multiplier: number;
  /** 0..1 - how far along the ascending trail the pot has traveled. */
  progress: number;
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
    const id = setTimeout(() => setTeetering(false), 380);
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

  // Floating-point roundtrip through exp/log can leave `progress` a hair
  // below 0 right at round start - raising a negative number to a
  // fractional power (below) is NaN in JS, so clamp the floor explicitly.
  const clampedProgress = Math.max(0, phase === 'crashed' ? Math.min(progress, 0.55) : progress);
  // Ascend from bottom-left toward the upper-right, easing so early
  // movement (low multiplier) reads as gentle and later movement (near
  // the top tier) reads as a steep climb.
  const potX = 8 + clampedProgress * 78;
  const potY = 88 - clampedProgress ** 1.15 * 74;

  const numberColorClass =
    phase === 'crashed'
      ? 'text-rose-400'
      : phase === 'cashedOut'
        ? 'text-brand-primary-400'
        : 'text-white';

  const trailColorClass =
    phase === 'crashed' ? 'stroke-rose-500/70' : 'stroke-brand-primary-400/80';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-zinc-950" style={{ aspectRatio: '16 / 11' }}>
      {/* Radial glow anchored where the pot currently is - the "engine light" behind the ascent. */}
      <div
        aria-hidden="true"
        className={`absolute h-64 w-64 rounded-full blur-3xl transition-colors duration-500 ${
          phase === 'crashed' ? 'bg-rose-600/20' : 'bg-brand-primary-500/25'
        }`}
        style={{
          left: `${potX}%`,
          top: `${potY}%`,
          transform: 'translate(-50%, -50%)',
        }}
      />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          d={trailPath(potX, potY)}
          fill="none"
          className={`transition-colors duration-500 ${trailColorClass}`}
          strokeWidth="0.6"
          strokeLinecap="round"
        />
      </svg>

      <div
        className={`absolute inset-x-0 top-6 text-center font-mono text-5xl font-bold tabular-nums transition-colors sm:text-6xl ${numberColorClass}`}
        style={{ textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
        aria-live="polite"
      >
        {multiplier.toFixed(2)}x
      </div>

      <div
        className="absolute flex h-16 w-16 items-center justify-center transition-[left,top] duration-100 ease-linear sm:h-20 sm:w-20"
        style={{ left: `${potX}%`, top: `${potY}%`, transform: 'translate(-50%, -50%)' }}
      >
        {particles.map((p) => (
          <span
            key={p.id}
            aria-hidden="true"
            className={`absolute bottom-8 left-1/2 h-2.5 w-4 rounded-[2px] bg-brand-primary-400 ${
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
            'text-brand-primary-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.6)] ' +
            (phase === 'crashed'
              ? 'animate-push-pot-tip text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]'
              : phase === 'climbing'
                ? teetering
                  ? 'animate-push-teeter'
                  : ''
                : '')
          }
        >
          <PotIcon />
        </div>
      </div>

      {phase === 'crashed' && (
        <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-rose-400">
          Crashed — the stake stays in the bankroll.
        </p>
      )}
      {phase === 'cashedOut' && (
        <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-brand-primary-400">
          Cashed out.
        </p>
      )}
    </div>
  );
}
