/**
 * ---
 * @customize  Set VITE_PUSH_ADDRESS in .env once Push is deployed - the kit
 *             ships with a zero-address placeholder so it's obvious in dev
 *             that nothing is wired up yet (see the diagnostics warning in
 *             config/diagnostics.ts). Switch chains by changing VITE_CHAIN
 *             in .env (mainnet | testnet - testnet/Base Sepolia is the
 *             deploy target for now, see README).
 * ---
 *
 * Push + USDC addresses and chain-aware helpers. Single source of truth -
 * every hook reads from here so a chain switch is one env var.
 *
 * Push itself is the only contract this app talks to directly for game
 * actions (stake/requestCashOut/settleCashOut) - it wraps Megapot's Jackpot
 * and BatchPurchaseFacilitator contracts internally. The frontend never
 * calls those directly for ticket purchases; it only reads
 * `push.batchFacilitator()` (a public immutable getter) when it needs to
 * poll `getBatchOrderInfo` for in-flight ticket delivery status.
 */
import type { Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';

export type ChainName = 'mainnet' | 'testnet';

// Base Sepolia testnet first, per the project's deploy plan - flip to
// mainnet once Push is deployed there and the Megapot track confirms
// testnet vs mainnet submission requirements.
export const CHAIN: ChainName = (import.meta.env.VITE_CHAIN as ChainName | undefined) ?? 'testnet';

export const VIEM_CHAIN = CHAIN === 'mainnet' ? base : baseSepolia;

const EXPLORER_BASE: Record<ChainName, string> = {
  mainnet: 'https://basescan.org/',
  testnet: 'https://sepolia.basescan.org/',
};

export const EXPLORER_ADDRESS_URL = `${EXPLORER_BASE[CHAIN]}address/`;
export const EXPLORER_TX_URL = `${EXPLORER_BASE[CHAIN]}tx/`;

/** USDC has 6 decimals on every chain Megapot deploys to. */
export const USDC_DECIMALS = 6;

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

const USDC: Record<ChainName, Address> = {
  mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  testnet: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

export const USDC_ADDRESS = USDC[CHAIN];

/**
 * Push's own deployed address. Not deployed yet as of this session (see
 * README "Deploy target") - set VITE_PUSH_ADDRESS once it is. The zero
 * address is a deliberately obvious placeholder rather than a guess.
 */
export const PUSH_ADDRESS: Address =
  ((import.meta.env.VITE_PUSH_ADDRESS as string | undefined)?.trim() as Address | undefined) ||
  ZERO_ADDRESS;

export const PUSH_DEPLOYED = PUSH_ADDRESS !== ZERO_ADDRESS;

/**
 * ETH sent alongside `stake()` / `requestCashOut()` to top up Push's Inco
 * confidential-op fee reserve (see foundry/README.md "Two real findings" +
 * "Fund Push's Inco confidential-op ETH fee reserve"). Push only requires
 * `msg.value >= inco.getFee()`; `inco.getFee()` is `Fee.sol`'s fixed
 * `FEE = 0.000001 ether` constant (read directly from the real
 * `@inco/lightning` v1.0.2 package source, not guessed). Padded to 2x here
 * so repeated play also builds the buffer `requestCommunityDraw()`'s two
 * ops draw from - see Push.stake()'s doc comment for why that's safe
 * (excess is never refunded, just stays in the reserve).
 */
export const INCO_FEE_TOPUP_WEI = 2_000_000_000_000n; // 2 * 0.000001 ether
