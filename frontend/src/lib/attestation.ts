/**
 * ---
 * @customize  Converts an `@inco/lightning-js` `DecryptionAttestation` (the
 *             off-chain SDK's shape) into the on-chain `DecryptionAttestation
 *             { handle, value }` struct + `bytes[] signatures` that
 *             `Push.settleCashOut` / `settleCommunityDraw` expect.
 *
 *             Confirmed against the published package's
 *             `dist/types/encryption/encryption.d.ts` (`Plaintext` schema,
 *             v1.0.2): for an `ebool` handle, `plaintext` is
 *             `{ scheme: 2, type: 0, value: boolean }`; for a `euint*`
 *             handle it's `{ scheme: 2, type: 5|7|8, value: bigint }`. Push
 *             only ever seals `ebool` (survived/busted) and `euint256`
 *             (community draw winning weight) handles, both covered below.
 *             NOT yet exercised against a live attestation response (no
 *             deployed Push / live testnet access in this session) - the
 *             encoding follows directly from the SDK's own type
 *             definitions, but treat this as the first thing to verify
 *             against a real attestation once Push is deployed.
 * ---
 */
import { bytesToHex, type Hex, numberToHex, pad } from 'viem';

type SdkAttestation = {
  handle: Hex;
  plaintext: { value: boolean | bigint };
  covalidatorSignatures: Uint8Array[];
};

export function toOnChainAttestation(attestation: SdkAttestation): {
  attestation: { handle: Hex; value: Hex };
  signatures: Hex[];
} {
  const raw = attestation.plaintext.value;
  const asUint = typeof raw === 'boolean' ? (raw ? 1n : 0n) : raw;

  return {
    attestation: {
      handle: attestation.handle,
      value: pad(numberToHex(asUint), { size: 32 }),
    },
    signatures: attestation.covalidatorSignatures.map((sig) => bytesToHex(sig)),
  };
}
