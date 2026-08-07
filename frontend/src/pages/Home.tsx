/**
 * ---
 * @customize  Landing page. Wallet-optional. The desktop "Push it →" CTA is
 *             `md+` only because the mobile bottom-nav surfaces the Play
 *             tab natively - a redundant in-page button on mobile would
 *             just duplicate the tab bar.
 * ---
 */
import { Button } from '@/components/common/Button';
import type { NavKey } from '@/components/layout/Nav';
import { PotIcon } from '@/components/climb/PotIcon';
import { PUSH_DEPLOYED } from '@/config/contracts';
import { COPY } from '@/config/copy';

export function Home({ onNavigate }: { onNavigate: (k: NavKey) => void }) {
  return (
    <div className="space-y-6">
      {!PUSH_DEPLOYED && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {COPY.notDeployed}
        </p>
      )}

      <section className="card-pad-lg space-y-4 text-center">
        <div className="mx-auto w-fit text-brand-primary-600 dark:text-brand-primary-400">
          <PotIcon />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Push</h1>
        <p className="mx-auto max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Stake real USDC. Climb a confidentially sealed multiplier. Cash out any time to convert
          your stake into that many real Megapot tickets - same odds, same prize structure as
          anyone buying on megapot.io. Crash before cashing out and the stake stays in the
          bankroll. No refund, no consolation ticket.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => onNavigate('play')}
          className="hidden w-full md:block"
        >
          Push it →
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Stake" body="Real USDC, no minimum ticket guarantee." />
        <Step
          n={2}
          title="Climb"
          body="A multiplier ladder climbs unpredictably. The crash tier is already sealed - the animation is pure presentation."
        />
        <Step
          n={3}
          title="Cash out or crash"
          body="Cash out any time for real tickets. Crash first and the stake stays in the bankroll."
        />
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card-pad space-y-1">
      <span className="text-xs font-semibold text-brand-primary-600 dark:text-brand-primary-400">
        {n}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-zinc-500">{body}</p>
    </div>
  );
}
