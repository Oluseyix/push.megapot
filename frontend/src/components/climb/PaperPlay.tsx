/**
 * ---
 * @customize  The whole game, one persistent panel - dark canvas up top,
 *             bet controls below that never leave the screen (the CTA
 *             button swaps between "Push $X" and "Cash out at Nx" rather
 *             than replacing the whole layout, same pattern Aviator and
 *             Megapot's own ticket widget both use). Paper/demo only: a
 *             localStorage fake balance, no wallet, no contract, no
 *             transaction ever happens here - `src/lib/paperGame.ts`
 *             resolves every round instantly and locally. Keep it that
 *             way; wiring the real wagmi flow back in is a separate,
 *             explicit mode swap for later (see `useStake` /
 *             `useRequestCashOut` / `useSettleCashOut`), not something to
 *             blend into this component.
 * ---
 */
import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { DEFAULT_TIERS } from '@/config/contracts';
import { useClimbPacing } from '@/hooks/useClimbPacing';
import { usePaperWallet } from '@/hooks/usePaperWallet';
import { usePushTiers } from '@/hooks/usePushTiers';
import { pickCrashTierIndex, resolveClaim } from '@/lib/paperGame';
import { ClimbStage } from './ClimbStage';
import { RecentResultsStrip } from './RecentResultsStrip';

type Phase = 'idle' | 'climbing' | 'result';
type Result = { survived: boolean; ticketsWon: number; multiplier: number };

const PRESETS = [1, 5, 10, 25];

export function PaperPlay() {
  const { tiers: onChainTiers } = usePushTiers();
  const tiers = onChainTiers.length > 0 ? onChainTiers : DEFAULT_TIERS;
  const wallet = usePaperWallet();

  const [phase, setPhase] = useState<Phase>('idle');
  const [amount, setAmount] = useState(1);
  const [stakedAmount, setStakedAmount] = useState(0);
  const [crashTierIndex, setCrashTierIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const climb = useClimbPacing(tiers, phase === 'climbing');

  const canBet = phase === 'idle' && amount >= 1 && amount <= wallet.balance;

  const onBet = () => {
    wallet.stake(amount);
    setStakedAmount(amount);
    setCrashTierIndex(pickCrashTierIndex(tiers.length));
    setResult(null);
    climb.reset();
    setPhase('climbing');
  };

  const onCashOut = () => {
    const survived = resolveClaim(climb.tierIndex, crashTierIndex);
    if (survived) {
      const ticketsWon = stakedAmount * tiers[climb.tierIndex];
      wallet.recordCashOut(ticketsWon, climb.multiplier);
      setResult({ survived: true, ticketsWon, multiplier: climb.multiplier });
    } else {
      wallet.recordCrash(climb.multiplier);
      setResult({ survived: false, ticketsWon: 0, multiplier: climb.multiplier });
    }
    setPhase('result');
  };

  const playAgain = () => {
    setPhase('idle');
    setResult(null);
    climb.reset();
  };

  const stagePhase =
    phase === 'climbing' ? 'climbing' : result ? (result.survived ? 'cashedOut' : 'crashed') : 'climbing';

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="p-2 sm:p-3">
        <ClimbStage
          phase={stagePhase}
          multiplier={phase === 'idle' ? 1 : climb.multiplier}
          progress={phase === 'idle' ? 0 : climb.progress}
          burstToken={climb.burstToken}
          teeterToken={climb.teeterToken}
        />
      </div>

      <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
        <RecentResultsStrip results={wallet.recentResults} />

        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span>
            Paper balance: <span className="font-semibold tabular-nums">${wallet.balance.toLocaleString()}</span>
          </span>
          <button
            type="button"
            onClick={wallet.reset}
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            Reset
          </button>
        </div>

        {phase === 'idle' && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setAmount((a) => Math.max(1, a - 1))}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              aria-label="Decrease amount"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-center text-xl font-bold tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              aria-label="Stake amount in dollars"
            />
            <button
              type="button"
              onClick={() => setAmount((a) => a + 1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              aria-label="Increase amount"
            >
              +
            </button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="flex justify-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                  (amount === p
                    ? 'bg-brand-primary-600 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700')
                }
              >
                ${p}
              </button>
            ))}
          </div>
        )}

        {phase === 'result' && result && (
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            {result.survived
              ? `${result.ticketsWon} paper tickets at ${result.multiplier.toFixed(2)}x - practice mode, no real Megapot tickets.`
              : `Crashed at ${result.multiplier.toFixed(2)}x - the $${stakedAmount} paper stake is gone.`}
          </p>
        )}

        {phase === 'idle' && (
          <Button variant="primary" size="lg" onClick={onBet} disabled={!canBet} className="w-full">
            {amount > wallet.balance ? 'Not enough paper funds' : `Push $${amount} (paper)`}
          </Button>
        )}
        {phase === 'climbing' && (
          <Button variant="primary" size="lg" onClick={onCashOut} className="w-full">
            Cash out at {climb.multiplier.toFixed(2)}x
          </Button>
        )}
        {phase === 'result' && (
          <Button variant="primary" size="lg" onClick={playAgain} className="w-full">
            Play again
          </Button>
        )}
      </div>
    </section>
  );
}
