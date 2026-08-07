/**
 * ---
 * @contract   Push.playerStats + event Achievement
 * @customize  No enumerable on-chain player list, so this walks
 *             `Achievement` logs (indexed by `player`) from genesis to
 *             collect the set of addresses that have ever cashed out at
 *             least once (Achievement fires on every player's first
 *             cashout - see Push.sol's settleCashOut), then batch-reads
 *             playerStats for each via multicall. Fine for a fresh
 *             testnet deployment's log volume; a busy mainnet deployment
 *             would want this behind a real indexer/API instead of raw
 *             `eth_getLogs` from block 0 - same read-side tradeoff the
 *             kit itself documents for Megapot's own Data API vs RPC.
 *
 *             Sorted by totalTicketsWon descending - swap the comparator
 *             for a different ranking (e.g. bestTierEverReached, or
 *             longestStreak).
 * ---
 */
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

export type LeaderboardEntry = {
  address: `0x${string}`;
  currentStreak: bigint;
  longestStreak: bigint;
  bestTierEverReached: bigint;
  totalTicketsWon: bigint;
  totalCashouts: bigint;
  totalCrashes: bigint;
};

export function useLeaderboard() {
  const publicClient = usePublicClient();

  const query = useQuery({
    queryKey: ['push-leaderboard', PUSH_ADDRESS],
    enabled: PUSH_DEPLOYED && !!publicClient,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      if (!publicClient) return [];

      const logs = await publicClient.getContractEvents({
        address: PUSH_ADDRESS,
        abi: pushAbi,
        eventName: 'Achievement',
        fromBlock: 0n,
        toBlock: 'latest',
      });

      const addresses = new Set<`0x${string}`>();
      for (const log of logs) {
        const player = log.args.player;
        if (player) addresses.add(player);
      }
      if (addresses.size === 0) return [];

      const results = await Promise.all(
        [...addresses].map(async (address) => {
          // playerStats' 6 named outputs decode as a positional tuple, not
          // an object - index into it rather than destructuring by name.
          const stats = await publicClient.readContract({
            address: PUSH_ADDRESS,
            abi: pushAbi,
            functionName: 'playerStats',
            args: [address],
          });
          return {
            address,
            currentStreak: stats[0],
            longestStreak: stats[1],
            bestTierEverReached: stats[2],
            totalTicketsWon: stats[3],
            totalCashouts: stats[4],
            totalCrashes: stats[5],
          } satisfies LeaderboardEntry;
        }),
      );

      return results.sort((a, b) => (b.totalTicketsWon > a.totalTicketsWon ? 1 : -1));
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
