/**
 * ---
 * @contract   event RoundStarted + event Achievement
 * @customize  Feed for the top ticker bar. Merges recent RoundStarted
 *             ("X pushed $N") and Achievement ("X cashed out" / "X hit a
 *             streak" / "X reached Nx") logs into one reverse-chronological
 *             feed. Same read-side tradeoff as `useLeaderboard` - raw
 *             `eth_getLogs` over a bounded recent block window, fine for a
 *             fresh testnet deployment, would want a real indexer at
 *             volume.
 * ---
 */
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

export type ActivityItem = { key: string; text: string; blockNumber: bigint };

const RECENT_BLOCK_WINDOW = 50_000n;

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function useRecentActivity() {
  const publicClient = usePublicClient();

  const query = useQuery({
    queryKey: ['push-recent-activity', PUSH_ADDRESS],
    enabled: PUSH_DEPLOYED && !!publicClient,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!publicClient) return [];
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > RECENT_BLOCK_WINDOW ? latest - RECENT_BLOCK_WINDOW : 0n;

      const [roundLogs, achievementLogs] = await Promise.all([
        publicClient.getContractEvents({
          address: PUSH_ADDRESS,
          abi: pushAbi,
          eventName: 'RoundStarted',
          fromBlock,
          toBlock: 'latest',
        }),
        publicClient.getContractEvents({
          address: PUSH_ADDRESS,
          abi: pushAbi,
          eventName: 'Achievement',
          fromBlock,
          toBlock: 'latest',
        }),
      ]);

      const items: ActivityItem[] = [];

      for (const log of roundLogs) {
        const { player, stakedDollars } = log.args;
        if (!player || stakedDollars === undefined) continue;
        items.push({
          key: `${log.transactionHash}-${log.logIndex}`,
          text: `${shorten(player)} pushed $${stakedDollars.toString()}`,
          blockNumber: log.blockNumber,
        });
      }

      for (const log of achievementLogs) {
        const { player, kind, value } = log.args;
        if (!player || !kind) continue;
        let text: string;
        switch (kind) {
          case 'first_cashout':
            text = `${shorten(player)} cashed out for the first time`;
            break;
          case 'streak':
            text = `${shorten(player)} hit a ${value?.toString()}-win streak`;
            break;
          case 'best_tier':
            text = `${shorten(player)} reached ${value?.toString()}x`;
            break;
          case 'community_draw_won':
            text = `${shorten(player)} won the community draw - ${value?.toString()} tickets`;
            break;
          default:
            text = `${shorten(player)} - ${kind}`;
        }
        items.push({ key: `${log.transactionHash}-${log.logIndex}`, text, blockNumber: log.blockNumber });
      }

      items.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      return items.slice(0, 20);
    },
  });

  return { items: query.data ?? [], isLoading: query.isLoading };
}
