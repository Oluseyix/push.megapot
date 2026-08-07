/**
 * ---
 * @contract   Push.ticketPrice
 * @customize  Live $-per-ticket price, read from Push (which itself reads
 *             Jackpot.getDrawingState live - see Push.sol's ticketPrice()).
 *             The frontend never needs Jackpot's address directly.
 * ---
 */
import { useReadContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

export function usePushTicketPrice() {
  const { data, isLoading, refetch } = useReadContract({
    address: PUSH_ADDRESS,
    abi: pushAbi,
    functionName: 'ticketPrice',
    query: { enabled: PUSH_DEPLOYED },
  });

  return { ticketPrice: data, isLoading, refetch };
}
