/**
 * ---
 * @contract   Push.stake
 * @customize  Stakes `dollarAmount` whole dollars (Push multiplies by the
 *             live ticket price internally) plus the Inco ETH fee top-up.
 *             Caller is responsible for USDC approval first - see
 *             `<ApprovalButton>` in the Stake screen.
 * ---
 */
import { useEffect, useState } from 'react';
import { decodeEventLog } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { INCO_FEE_TOPUP_WEI, PUSH_ADDRESS } from '@/config/contracts';

export function useStake() {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const {
    data: receipt,
    isSuccess,
    isLoading,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const [roundId, setRoundId] = useState<bigint | null>(null);

  // Pull the new round's id out of RoundStarted rather than assuming it's
  // sequential client-side - concurrent stakers from other wallets mean
  // nextRoundId isn't reliably "one less than what I just got".
  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== PUSH_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: pushAbi, ...log });
        if (decoded.eventName === 'RoundStarted') {
          setRoundId(decoded.args.roundId);
          return;
        }
      } catch {
        // Not a RoundStarted log (or not decodable against this ABI) - skip.
      }
    }
  }, [isSuccess, receipt]);

  const stake = (dollarAmount: number) => {
    setRoundId(null);
    writeContract({
      address: PUSH_ADDRESS,
      abi: pushAbi,
      functionName: 'stake',
      args: [BigInt(dollarAmount)],
      value: INCO_FEE_TOPUP_WEI,
    });
  };

  return {
    stake,
    txHash,
    roundId,
    isWaitingSignature: isPending,
    isMining: isLoading,
    isPending: isPending || isLoading,
    isSuccess,
    error,
    reset: () => {
      reset();
      setRoundId(null);
    },
  };
}
