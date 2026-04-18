/**
 * signatureVerify.ts — Ed25519 bundle signature verification.
 *
 * Wave 37 Phase D — signed marketplace. Uses Node's built-in `crypto` module;
 * no new npm dependencies.
 *
 * The placeholder key in trustedKeys.ts will always cause verification to
 * return false — this is intentional until the production key is substituted.
 */

import crypto from 'node:crypto';

import { TRUSTED_PUBLIC_KEY_BASE64 } from './trustedKeys';

/**
 * Attempt to import a base64-encoded public key.
 * Tries DER SPKI first; if that fails, wraps the raw 32-byte Ed25519 key in
 * a minimal SPKI envelope (RFC 8410) and retries.
 */
function importPublicKey(base64: string): crypto.KeyObject | null {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) return null;

  // First attempt: treat as DER SPKI (the documented format).
  try {
    return crypto.createPublicKey({ key: buf, format: 'der', type: 'spki' });
  } catch {
    // Fall through to raw key wrapping.
  }

  // Second attempt: wrap raw 32-byte Ed25519 key in a minimal SPKI envelope.
  // RFC 8410 SPKI header for Ed25519: 12 bytes.
  // OID 1.3.101.112 (id-EdDSA / Ed25519) encoded as SPKI.
  if (buf.length !== 32) return null;

  try {
    const spkiHeader = Buffer.from(
      '302a300506032b6570032100',
      'hex',
    );
    const spkiDer = Buffer.concat([spkiHeader, buf]);
    return crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/**
 * Verify an Ed25519 bundle signature.
 *
 * @param content       - The raw bundle content JSON string that was signed.
 * @param signatureBase64 - The base64-encoded Ed25519 signature from the manifest.
 * @returns true if the signature is valid; false for any failure (bad key,
 *          bad signature, crypto error, placeholder key, etc.).
 */
export function verifyBundleSignature(content: string, signatureBase64: string): boolean {
  try {
    const pubKey = importPublicKey(TRUSTED_PUBLIC_KEY_BASE64);
    if (!pubKey) return false;

    const sigBuf = Buffer.from(signatureBase64, 'base64');
    const contentBuf = Buffer.from(content);

    // Ed25519 is a one-shot signature scheme — no separate digest step.
    // Pass null as the algorithm; Node derives it from the KeyObject type.
    return crypto.verify(null, contentBuf, pubKey, sigBuf);
  } catch {
    return false;
  }
}
