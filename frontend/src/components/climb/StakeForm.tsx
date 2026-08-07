/**
 * ---
 * @contract   Push.stake
 * @customize  Amount selector - whole-dollar stake input (Push's
 *             `dollarAmount` param), live ticket-price-derived cost
 *             preview, USDC approve-then-stake flow via `<ApprovalButton>`.
 * ---
 */
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { ApprovalButton } from '@/components/common/ApprovalButton';
import { Button } from '@/components/common/Button';
import { TxStatus } from '@/components/common/TxStatus';
import { UsdcAmount } from '@/components/common/UsdcAmount';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';
import { COPY } from '@/config/copy';
import { useStake } from '@/hooks/useStake';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { usePushTicketPrice } from '@/hooks/usePushTicketPrice';
import { usePushTiers } from '@/hooks/usePushTiers';

const PRESETS = [1, 5, 10, 25];

export function StakeForm({ onStaked }: { onStaked: (roundId: bigint) => void }) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState(1);

  const { balance } = useUsdcBalance(address);
  const { ticketPrice } = usePushTicketPrice();
  const { tiers } = usePushTiers();
  const stakeHook = useStake();

  const cost = useMemo(
    () => (ticketPrice !== undefined ? BigInt(Math.max(1, Math.floor(amount))) * ticketPrice : undefined),
    [ticketPrice, amount],
  );

  const topTier = tiers.length > 0 ? tiers[tiers.length - 1] : undefined;

  const disabled = !isConnected || !PUSH_DEPLOYED || amount < 1 || stakeHook.isPending;

  // biome-ignore lint/correctness/useExhaustiveDependencies: onStaked is a stable callback prop, not a re-run trigger
  useEffect(() => {
    if (stakeHook.roundId !== null) onStaked(stakeHook.roundId);
  }, [stakeHook.roundId]);

  return (
    <section className="card-pad-lg space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Stake</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Real USDC. Climb a sealed multiplier - cash out any time to convert your stake into that
          many Megapot tickets, or crash and lose it to the bankroll.
        </p>
      </div>

      {!PUSH_DEPLOYED && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {COPY.notDeployed}
        </p>
      )}

      <div>
        <label htmlFor="stake-amount" className="text-xs font-medium text-zinc-500">
          Amount (whole USD)
        </label>
        <input
          id="stake-amount"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="mt-2 flex gap-2">
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
      </div>

      <div className="space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/50">
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-600 dark:text-zinc-400">Cost</span>
          <span className="font-semibold tabular-nums">
            <UsdcAmount value={cost} precision={2} />
          </span>
        </div>
        <div className="flex items-baseline justify-between text-xs text-zinc-500">
          <span>Your USDC balance</span>
          <UsdcAmount value={balance} precision={2} />
        </div>
        {topTier !== undefined && (
          <div className="flex items-baseline justify-between text-xs text-zinc-500">
            <span>Top tier</span>
            <span>{topTier}x</span>
          </div>
        )}
      </div>

      <ApprovalButton spender={PUSH_ADDRESS} amount={cost ?? 0n}>
        <Button
          variant="primary"
          size="lg"
          onClick={() => stakeHook.stake(amount)}
          disabled={disabled}
          className="w-full"
        >
          {stakeHook.isWaitingSignature
            ? 'Sign in your wallet…'
            : stakeHook.isMining
              ? 'Starting round…'
              : !isConnected
                ? COPY.connectToPlay
                : `Push $${amount}`}
        </Button>
      </ApprovalButton>

      <TxStatus
        hash={stakeHook.txHash}
        isPending={stakeHook.isPending}
        isSuccess={false}
        error={stakeHook.error}
      />
    </section>
  );
}
