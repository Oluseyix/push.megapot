/**
 * ---
 * @contract   Push.playerStats + event Achievement
 * @customize  Basic ranked table - see `useLeaderboard` for how the player
 *             set is discovered (no enumerable on-chain list) and ranked
 *             (totalTicketsWon descending).
 * ---
 */
import { useAccount } from 'wagmi';
import { PUSH_DEPLOYED } from '@/config/contracts';
import { COPY } from '@/config/copy';
import { useLeaderboard } from '@/hooks/useLeaderboard';

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function Leaderboard() {
  const { address } = useAccount();
  const { entries, isLoading } = useLeaderboard();

  if (!PUSH_DEPLOYED) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {COPY.notDeployed}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Every player who has ever cashed out at least once, ranked by total real tickets won.
        </p>
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!isLoading && entries.length === 0 && (
        <p className="card-pad text-sm text-zinc-500">No cash-outs yet - be the first.</p>
      )}

      {entries.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2 text-right">Tickets won</th>
                <th className="px-4 py-2 text-right">Best tier</th>
                <th className="px-4 py-2 text-right">Streak</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.address}
                  className={
                    'border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ' +
                    (address && entry.address.toLowerCase() === address.toLowerCase()
                      ? 'bg-brand-primary-50 dark:bg-brand-primary-950/40'
                      : '')
                  }
                >
                  <td className="px-4 py-2 tabular-nums text-zinc-500">{i + 1}</td>
                  <td className="px-4 py-2 font-mono">{shortenAddress(entry.address)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {entry.totalTicketsWon.toString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {entry.bestTierEverReached.toString()}x
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {entry.currentStreak.toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
