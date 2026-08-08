/**
 * ---
 * @customize  Paper-funds version of the stake → climb → cash-out/crash
 *             flow in `pages/Play.tsx` - same phase machine and the exact
 *             same `ClimbStage`/`useClimbPacing` presentation components,
 *             but every outcome resolves instantly and locally
 *             (`src/lib/paperGame.ts`) instead of through
 *             requestCashOut/settleCashOut. No wallet, no contract, no
 *             transaction ever happens in this component - keep it that
 *             way so paper play can never be confused with a real
 *             settlement.
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
import { PaperStakeForm } from './PaperStakeForm';

type Phase = 'stake' | 'climbing' | 'result';
type Result = { survived: boolean; ticketsWon: number };

export function PaperPlay() {
  const { tiers: onChainTiers } = usePushTiers();
  const tiers = onChainTiers.length > 0 ? onChainTiers : DEFAULT_TIERS;
  const wallet = usePaperWallet();

  const [phase, setPhase] = useState<Phase>('stake');
  const [stakedAmount, setStakedAmount] = useState(0);
  const [crashTierIndex, setCrashTierIndex] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  const climb = useClimbPacing(tiers, phase === 'climbing');

  const onStaked = (amount: number) => {
    setStakedAmount(amount);
    setCrashTierIndex(pickCrashTierIndex(tiers.length));
    setResult(null);
    setPhase('climbing');
  };

  const onCashOut = () => {
    const survived = resolveClaim(climb.tierIndex, crashTierIndex);
    if (survived) {
      const ticketsWon = stakedAmount * tiers[climb.tierIndex];
      wallet.recordCashOut(ticketsWon);
      setResult({ survived: true, ticketsWon });
    } else {
      wallet.recordCrash();
      setResult({ survived: false, ticketsWon: 0 });
    }
    setPhase('result');
  };

  const playAgain = () => {
    setPhase('stake');
    climb.reset();
    setResult(null);
  };

  if (phase === 'stake') {
    return <PaperStakeForm onStaked={onStaked} />;
  }

  const stagePhase = phase === 'result' ? (result?.survived ? 'cashedOut' : 'crashed') : 'climbing';

  return (
    <section className="card-pad-lg space-y-4">
      <p className="text-center text-xs font-medium text-amber-700 dark:text-amber-400">
        Paper funds - practice mode, nothing real is at stake
      </p>

      <ClimbStage
        phase={stagePhase}
        multiplier={climb.multiplier}
        burstToken={climb.burstToken}
        teeterToken={climb.teeterToken}
      />

      {phase === 'climbing' && (
        <Button variant="primary" size="lg" onClick={onCashOut} className="w-full">
          Cash out at {climb.multiplier.toFixed(2)}x
        </Button>
      )}

      {phase === 'result' && result && (
        <div className="space-y-3 text-center">
          {result.survived ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {result.ticketsWon} paper tickets - practice mode, no real Megapot tickets bought.
            </p>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Crashed - the ${stakedAmount} paper stake is gone. Paper balance: $
              {wallet.balance.toLocaleString()}.
            </p>
          )}
          <Button variant="primary" size="lg" onClick={playAgain} className="w-full">
            Play again
          </Button>
        </div>
      )}
    </section>
  );
}
