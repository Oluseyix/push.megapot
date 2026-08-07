/**
 * ---
 * @contract   Push.tiers
 * @customize  Push has no bulk "getTiers()" getter - `tiers` is a public
 *             array, so each index is its own view call. Reads a bounded
 *             range (0..MAX_TIERS-1) via a single multicall and keeps only
 *             the contiguous successful prefix (a revert means "past the
 *             end of the array"). Raise MAX_TIERS if a deployment ever
 *             configures more tiers than that.
 * ---
 */
import { useReadContracts } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS, PUSH_DEPLOYED } from '@/config/contracts';

const MAX_TIERS = 16;

export function usePushTiers() {
  const { data, isLoading } = useReadContracts({
    contracts: Array.from({ length: MAX_TIERS }, (_, i) => ({
      address: PUSH_ADDRESS,
      abi: pushAbi,
      functionName: 'tiers',
      args: [BigInt(i)],
    })),
    query: { enabled: PUSH_DEPLOYED },
  });

  const tiers: number[] = [];
  if (data) {
    for (const entry of data) {
      if (entry.status !== 'success') break;
      tiers.push(Number(entry.result as bigint));
    }
  }

  return { tiers, isLoading };
}
