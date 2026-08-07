/**
 * ---
 * @contract   Push.bankroll
 * @customize  The pool backing every player's worst-case reservation - the
 *             closest Push analog to a jackpot's "prize pool" headline
 *             number. Refetches on a short interval since it moves with
 *             every stake/settle.
 * ---
 */
import { useReadContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

export function useBankroll() {
  const { data, isLoading } = useReadContract({
    address: PUSH_ADDRESS,
    abi: pushAbi,
    functionName: 'bankroll',
    query: { enabled: PUSH_DEPLOYED, refetchInterval: 15_000 },
  });

  return { bankroll: data, isLoading };
}
