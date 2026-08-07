/**
 * ---
 * @customize  Top scrolling activity strip, rendered above the header in
 *             `Layout.tsx` - matches Megapot's own site chrome. Real
 *             on-chain activity via `useRecentActivity` once Push is
 *             deployed; a fixed set of taglines otherwise (or if there's
 *             no activity yet), so the strip is never empty or fake-looking.
 * ---
 */
import { useRecentActivity } from '@/hooks/useRecentActivity';

const FALLBACK_MESSAGES = [
  'Real USDC at risk - crash before cashing out and the stake stays in the bankroll',
  'Cash out any time for real Megapot tickets - same odds as buying directly',
  '2% of every stake feeds a non-leveraged community pool',
];

export function TickerBar() {
  const { items } = useRecentActivity();

  const messages = items.length > 0 ? items.map((i) => i.text) : FALLBACK_MESSAGES;
  // Duplicate the list so the CSS marquee loops seamlessly.
  const looped = [...messages, ...messages];

  return (
    <section
      aria-label="Recent activity"
      className="overflow-hidden border-b border-zinc-800 bg-zinc-950 text-zinc-300"
    >
      <div className="flex w-max animate-push-ticker gap-8 py-2 text-xs font-medium whitespace-nowrap">
        {looped.map((text, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static duplicated list, order/identity never changes within a render
          <span key={i} className="flex items-center gap-2 px-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary-500" aria-hidden="true" />
            {text}
          </span>
        ))}
      </div>
    </section>
  );
}
