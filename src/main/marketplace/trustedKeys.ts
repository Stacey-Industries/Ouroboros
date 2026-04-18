/**
 * trustedKeys.ts — Ed25519 public key for marketplace bundle signing.
 *
 * Wave 37 Phase D — signed marketplace bootstrap.
 */

/**
 * PLACEHOLDER Ed25519 public key for marketplace bundle signing.
 *
 * Replace this with the production key before shipping the marketplace.
 * The matching private key signs bundles published to the curated host.
 * Losing the private key = unable to publish new bundles.
 *
 * Key format: base64-encoded DER SPKI (SubjectPublicKeyInfo) for Ed25519.
 * Generate with:
 *   openssl genpkey -algorithm ed25519 -out private.pem
 *   openssl pkey -in private.pem -pubout -out public.pem
 *   openssl pkey -in private.pem -pubout -outform DER | base64
 */
export const TRUSTED_PUBLIC_KEY_BASE64 = 'REPLACE_WITH_PRODUCTION_KEY';

export const MARKETPLACE_MANIFEST_URL =
  'https://raw.githubusercontent.com/Stacey-Industries/Ouroboros/master/marketplace/index.json';

export const REVOKED_BUNDLES_URL =
  'https://raw.githubusercontent.com/Stacey-Industries/Ouroboros/master/marketplace/revoked-bundles.json';
