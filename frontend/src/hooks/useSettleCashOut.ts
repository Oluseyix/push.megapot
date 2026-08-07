/**
 * ---
 * @contract   Push.settleCashOut
 * @customize  Second half of the cash-out flow. Fetches the pending
 *             handle's decryption attestation off-chain via
 *             `Lightning.attestedDecrypt()` (see src/lib/inco.ts,
 *             src/lib/attestation.ts), then submits `settleCashOut`.
 *             Call only after `useRequestCashOut`'s tx has confirmed.
 * ---
 */
import { useEffect, useState } from 'react';
import { decodeEventLog } from 'viem';
import { usePublicClient, useWaitForTransactionReceipt, useWalletClient, useWriteContract } from 'wagmi';
import { pushAbi } from '@/abi/push';
import { PUSH_ADDRESS } from '@/config/contracts';
import { getLightningClient } from '@/lib/inco';
import { toOnChainAttestation } from '@/lib/attestation';

export type SettleResult = { survived: boolean; ticketsWon: bigint };

export function useSettleCashOut() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { writeContract, data: txHash, isPending, error: writeError, reset: resetWrite } = useWriteContract();
  const {
    data: receipt,
    isSuccess,
    isLoading: isMining,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const [isFetchingAttestation, setIsFetchingAttestation] = useState(false);
  const [attestationError, setAttestationError] = useState<Error | null>(null);
  const [result, setResult] = useState<SettleResult | null>(null);

  useEffect(() => {
    if (!isSuccess || !receipt) return;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== PUSH_ADDRESS.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: pushAbi, ...log });
        if (decoded.eventName === 'Settled') {
          setResult({ survived: decoded.args.survived, ticketsWon: decoded.args.ticketsWon });
          return;
        }
      } catch {
        // Not a Settled log - skip.
      }
    }
  }, [isSuccess, receipt]);

  const settle = async (roundId: bigint) => {
    if (!publicClient || !walletClient) return;
    setAttestationError(null);
    setIsFetchingAttestation(true);
    try {
      const handle = await publicClient.readContract({
        address: PUSH_ADDRESS,
        abi: pushAbi,
        functionName: 'pendingSurvivedHandle',
        args: [roundId],
      });

      const lightning = await getLightningClient();
      const [sdkAttestation] = await lightning.attestedDecrypt(walletClient, [handle]);
      const { attestation, signatures } = toOnChainAttestation(sdkAttestation);

      writeContract({
        address: PUSH_ADDRESS,
        abi: pushAbi,
        functionName: 'settleCashOut',
        args: [roundId, attestation, signatures],
      });
    } catch (err) {
      setAttestationError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsFetchingAttestation(false);
    }
  };

  return {
    settle,
    txHash,
    result,
    isFetchingAttestation,
    isWaitingSignature: isPending,
    isMining,
    isPending: isFetchingAttestation || isPending || isMining,
    isSuccess,
    error: attestationError ?? writeError,
    reset: () => {
      setAttestationError(null);
      setResult(null);
      resetWrite();
    },
  };
}
