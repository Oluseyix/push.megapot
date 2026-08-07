/**
 * ---
 * @contract   Push.playerStats
 * @customize  Pure stats read for one address. Pair with `useLeaderboard`
 *             for the ranked multi-player view.
 * ---
 */
import { useReadContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

export function usePlayerStats(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: PUSH_ADDRESS,
    abi: pushAbi,
    functionName: 'playerStats',
    args: address ? [address] : undefined,
    query: { enabled: PUSH_DEPLOYED && !!address },
  });

  return { stats: data, isLoading, refetch };
}
