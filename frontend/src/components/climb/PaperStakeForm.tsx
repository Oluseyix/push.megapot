/**
 * ---
 * @customize  Paper-funds amount selector - same layout as `StakeForm` but
 *             against a local fake balance (`usePaperWallet`), no wallet or
 *             contract involved. Deliberately visually similar to the real
 *             `StakeForm` (so switching modes doesn't feel like a different
 *             app) but the amber "paper funds" framing stays constant so
 *             it's never mistaken for real money.
 * ---
 */
import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { DEFAULT_TIERS } from '@/config/contracts';
import { usePaperWallet } from '@/hooks/usePaperWallet';
import { usePushTiers } from '@/hooks/usePushTiers';

const PRESETS = [1, 5, 10, 25];

export function PaperStakeForm({ onStaked }: { onStaked: (amount: number) => void }) {
  const [amount, setAmount] = useState(1);
  const wallet = usePaperWallet();
  const { tiers: onChainTiers } = usePushTiers();
  const tiers = onChainTiers.length > 0 ? onChainTiers : DEFAULT_TIERS;
  const topTier = tiers[tiers.length - 1];

  const disabled = amount < 1 || amount > wallet.balance;

  return (
    <section className="card-pad-lg space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Stake (paper funds)</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Practice mode - fake balance, no wallet, no real tickets. Same odds as the real game.
          </p>
        </div>
        <button
          type="button"
          onClick={wallet.reset}
          className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Reset balance
        </button>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        Paper balance: <span className="font-semibold tabular-nums">${wallet.balance.toLocaleString()}</span>
      </div>

      <div>
        <label htmlFor="paper-stake-amount" className="text-xs font-medium text-zinc-500">
          Amount (whole USD)
        </label>
        <input
          id="paper-stake-amount"
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

      {topTier !== undefined && (
        <div className="flex items-baseline justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800/50">
          <span>Top tier</span>
          <span>{topTier}x</span>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={() => {
          wallet.stake(amount);
          onStaked(amount);
        }}
        disabled={disabled}
        className="w-full"
      >
        {amount > wallet.balance ? 'Not enough paper funds' : `Push $${amount} (paper)`}
      </Button>
    </section>
  );
}
