/**
 * ---
 * @contract   Push.requestCashOut
 * @customize  First half of the cash-out flow: seals in the tier the player
 *             is claiming and triggers Inco's confidential comparison
 *             on-chain. Pair with `useSettleCashOut` for the second half
 *             (fetch attestation off-chain, then settle).
 * ---
 */
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { INCO_FEE_TOPUP_WEI, PUSH_ADDRESS } from '@/config/contracts';

export function useRequestCashOut() {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isSuccess, isLoading } = useWaitForTransactionReceipt({ hash: txHash });

  const requestCashOut = (roundId: bigint, claimedTierIndex: number) => {
    writeContract({
      address: PUSH_ADDRESS,
      abi: pushAbi,
      functionName: 'requestCashOut',
      args: [roundId, claimedTierIndex],
      value: INCO_FEE_TOPUP_WEI,
    });
  };

  return {
    requestCashOut,
    txHash,
    isWaitingSignature: isPending,
    isMining: isLoading,
    isPending: isPending || isLoading,
    isSuccess,
    error,
    reset,
  };
}
