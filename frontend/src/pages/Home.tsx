/**
 * ---
 * @customize  The whole game lives on one screen - no separate "Play" tab
 *             to navigate to. `PaperPlay` (the dark canvas + persistent bet
 *             panel) is embedded directly; the explainer copy below it is
 *             onboarding context, not a gate you have to click through.
 * ---
 */
import { PaperPlay } from '@/components/climb/PaperPlay';
import { PUSH_DEPLOYED } from '@/config/contracts';
import { COPY } from '@/config/copy';
import { usePaperWallet } from '@/hooks/usePaperWallet';

export function Home() {
  const wallet = usePaperWallet();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {!PUSH_DEPLOYED && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {COPY.notDeployed} Playing with paper funds for now - see below.
        </p>
      )}

      <section className="grid grid-cols-2 gap-2 sm:gap-3" aria-label="Paper wallet stats">
        <Stat label="Paper balance" value={`$${wallet.balance.toLocaleString()}`} />
        <Stat label="Paper tickets won" value={wallet.totalTicketsWon.toLocaleString()} />
      </section>

      <PaperPlay />

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-pad text-center">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 sm:text-xs">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums sm:text-xl">{value}</p>
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
