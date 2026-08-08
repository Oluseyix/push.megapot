/**
 * ---
 * @customize  localStorage-backed fake USDC balance for paper/demo play -
 *             no wallet, no contract, no real money. Starting balance and
 *             all state resets are purely local; nothing here ever touches
 *             the real Push contract or a real wallet. Kept entirely
 *             separate from `useStake`/`useRequestCashOut`/
 *             `useSettleCashOut` (the real wagmi flow) so there's no path
 *             by which paper state could be mistaken for a real balance.
 * ---
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'push-paper-wallet-v1';
const STARTING_BALANCE = 1000;

type PaperState = { balance: number; totalTicketsWon: number; totalCashouts: number; totalCrashes: number };

function load(): PaperState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PaperState;
  } catch {
    // localStorage unavailable or corrupt - fall through to a fresh wallet.
  }
  return { balance: STARTING_BALANCE, totalTicketsWon: 0, totalCashouts: 0, totalCrashes: 0 };
}

function save(state: PaperState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort only - paper funds not persisting across reloads isn't harmful.
  }
}

export function usePaperWallet() {
  const [state, setState] = useState<PaperState>(load);

  useEffect(() => save(state), [state]);

  const stake = useCallback((amount: number) => {
    setState((prev) => ({ ...prev, balance: prev.balance - amount }));
  }, []);

  const recordCashOut = useCallback((ticketsWon: number) => {
    setState((prev) => ({
      ...prev,
      totalTicketsWon: prev.totalTicketsWon + ticketsWon,
      totalCashouts: prev.totalCashouts + 1,
    }));
  }, []);

  const recordCrash = useCallback(() => {
    setState((prev) => ({ ...prev, totalCrashes: prev.totalCrashes + 1 }));
  }, []);

  const reset = useCallback(() => {
    const fresh = { balance: STARTING_BALANCE, totalTicketsWon: 0, totalCashouts: 0, totalCrashes: 0 };
    setState(fresh);
  }, []);

  return { ...state, stake, recordCashOut, recordCrash, reset };
}
