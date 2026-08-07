/**
 * ---
 * @contract   Push.stake / Push.requestCashOut / Push.settleCashOut
 * @customize  Single continuous flow (stake → climb → cash out or crash)
 *             rather than separate pages - matches how a real crash game
 *             reads: one screen, one round at a time. `phase` drives which
 *             stage renders; `useClimbPacing` drives the animation while
 *             `phase === 'climbing'`.
 * ---
 */
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/common/Button';
import { TxStatus } from '@/components/common/TxStatus';
import { ClimbStage } from '@/components/climb/ClimbStage';
import { StakeForm } from '@/components/climb/StakeForm';
import { useClimbPacing } from '@/hooks/useClimbPacing';
import { useRequestCashOut } from '@/hooks/useRequestCashOut';
import { useSettleCashOut } from '@/hooks/useSettleCashOut';
import { usePushTiers } from '@/hooks/usePushTiers';

type Phase = 'stake' | 'climbing' | 'requesting' | 'settling' | 'result';

export function Play() {
  const { isConnected } = useAccount();
  const { tiers } = usePushTiers();

  const [phase, setPhase] = useState<Phase>('stake');
  const [roundId, setRoundId] = useState<bigint | null>(null);

  const climb = useClimbPacing(tiers, phase === 'climbing');
  const requestCashOutHook = useRequestCashOut();
  const settleHook = useSettleCashOut();

  const onStaked = (newRoundId: bigint) => {
    setRoundId(newRoundId);
    setPhase('climbing');
  };

  const onCashOut = () => {
    if (roundId === null) return;
    setPhase('requesting');
    requestCashOutHook.requestCashOut(roundId, climb.tierIndex);
  };

  // Once requestCashOut confirms on-chain, immediately move into settling:
  // fetch the decryption attestation off-chain, then submit settleCashOut.
  // biome-ignore lint/correctness/useExhaustiveDependencies: settleHook.settle is stable across renders
  useEffect(() => {
    if (phase !== 'requesting' || !requestCashOutHook.isSuccess || roundId === null) return;
    setPhase('settling');
    settleHook.settle(roundId);
  }, [phase, requestCashOutHook.isSuccess, roundId]);

  useEffect(() => {
    if (phase === 'settling' && settleHook.isSuccess) {
      setPhase('result');
    }
  }, [phase, settleHook.isSuccess]);

  const playAgain = () => {
    setPhase('stake');
    setRoundId(null);
    climb.reset();
    requestCashOutHook.reset();
    settleHook.reset();
  };

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        Connect your wallet to stake and climb.
      </div>
    );
  }

  if (phase === 'stake') {
    return <StakeForm onStaked={onStaked} />;
  }

  const stagePhase =
    phase === 'result'
      ? settleHook.result?.survived
        ? 'cashedOut'
        : 'crashed'
      : 'climbing';

  return (
    <section className="card-pad-lg space-y-4">
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

      {(phase === 'requesting' || phase === 'settling') && (
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {phase === 'requesting'
              ? 'Sealing your cash-out on-chain…'
              : settleHook.isFetchingAttestation
                ? 'Fetching decryption attestation…'
                : 'Settling…'}
          </p>
          <TxStatus
            hash={phase === 'requesting' ? requestCashOutHook.txHash : settleHook.txHash}
            isPending={phase === 'requesting' ? requestCashOutHook.isPending : settleHook.isPending}
            isSuccess={false}
            error={phase === 'requesting' ? requestCashOutHook.error : settleHook.error}
          />
        </div>
      )}

      {phase === 'result' && settleHook.result && (
        <div className="space-y-3 text-center">
          {settleHook.result.survived ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {settleHook.result.ticketsWon.toString()} real Megapot{' '}
              {settleHook.result.ticketsWon === 1n ? 'ticket' : 'tickets'} on the way - Megapot's
              batch facilitator fills the order over one or more transactions, not instantly.
            </p>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No refund, no consolation ticket - the stake stays in the bankroll.
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
