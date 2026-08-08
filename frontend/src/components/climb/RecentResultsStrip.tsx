/**
 * ---
 * @customize  Row of small chips showing this player's last few paper
 *             rounds - green/tiered for a cash-out, muted red for a
 *             crash. Push has no single shared "the round crashed at X"
 *             moment like a pooled crash game (each player's crash tier
 *             is sealed independently at their own stake time), so this
 *             is deliberately scoped to "your recent rounds," not a
 *             site-wide feed.
 * ---
 */
import type { PaperResult } from '@/hooks/usePaperWallet';

function chipClass(result: PaperResult): string {
  if (!result.survived) {
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  }
  if (result.multiplier >= 10) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (result.multiplier >= 3) return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  return 'bg-brand-primary-500/10 text-brand-primary-400 border-brand-primary-500/20';
}

export function RecentResultsStrip({ results }: { results: PaperResult[] }) {
  if (results.length === 0) return null;

  return (
    <ul className="flex list-none gap-1.5 overflow-x-auto pb-1" aria-label="Your recent rounds">
      {results.map((r, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length recent-history list, prepended in place
          key={i}
          className={`shrink-0 rounded-md border px-2 py-1 font-mono text-xs font-semibold tabular-nums ${chipClass(r)}`}
        >
          {r.survived ? `${r.multiplier.toFixed(2)}x` : '✕'}
        </li>
      ))}
    </ul>
  );
}
