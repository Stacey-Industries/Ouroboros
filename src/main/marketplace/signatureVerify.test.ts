/**
 * signatureVerify.test.ts — Ed25519 signature verification tests.
 *
 * Strategy: signatureVerify.ts reads TRUSTED_PUBLIC_KEY_BASE64 at call time
 * via the imported binding. We use vi.mock with a hoisted mutable ref so each
 * test can set a different public key without reloading the module.
 */

import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mutable key ref ───────────────────────────────────────────────────

const { keyRef } = vi.hoisted(() => ({ keyRef: { value: 'REPLACE_WITH_PRODUCTION_KEY' } }));

vi.mock('./trustedKeys', () => ({
  get TRUSTED_PUBLIC_KEY_BASE64() { return keyRef.value; },
  MARKETPLACE_MANIFEST_URL: 'https://example.com/index.json',
  REVOKED_BUNDLES_URL: 'https://example.com/revoked-bundles.json',
}));

// ── Subject (imported after mock) ─────────────────────────────────────────────

import { verifyBundleSignature } from './signatureVerify';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKeypair(): { spkiBase64: string; privateKey: crypto.KeyObject } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const spkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return { spkiBase64, privateKey };
}

function sign(content: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(content), privateKey).toString('base64');
}

// ── Placeholder key tests ─────────────────────────────────────────────────────

describe('verifyBundleSignature — placeholder key', () => {
  beforeEach(() => { keyRef.value = 'REPLACE_WITH_PRODUCTION_KEY'; });

  it('returns false with the placeholder key', () => {
    expect(verifyBundleSignature('{"id":"x"}', 'c29tZXNpZ25hdHVyZQ==')).toBe(false);
  });

  it('never throws on any input', () => {
    expect(() => verifyBundleSignature('', '')).not.toThrow();
    expect(() => verifyBundleSignature('x', 'not-base64!!!')).not.toThrow();
    expect(() => verifyBundleSignature('', 'AAAA')).not.toThrow();
  });
});

// ── Real SPKI keypair tests ───────────────────────────────────────────────────

describe('verifyBundleSignature — real Ed25519 keypair (SPKI DER)', () => {
  let privateKey: crypto.KeyObject;

  beforeEach(() => {
    const kp = makeKeypair();
    keyRef.value = kp.spkiBase64;
    privateKey = kp.privateKey;
  });

  it('returns true for a correctly signed payload', () => {
    const content = JSON.stringify({ id: 'test', kind: 'theme' });
    expect(verifyBundleSignature(content, sign(content, privateKey))).toBe(true);
  });

  it('returns false when content is tampered', () => {
    const content = JSON.stringify({ id: 'test', kind: 'theme' });
    const sig = sign(content, privateKey);
    expect(verifyBundleSignature(content.replace('theme', 'prompt'), sig)).toBe(false);
  });

  it('returns false for an all-zero signature', () => {
    const content = '{"id":"test"}';
    expect(verifyBundleSignature(content, Buffer.alloc(64).toString('base64'))).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyBundleSignature('{"id":"test"}', '')).toBe(false);
  });
});

// ── Raw 32-byte key fallback ──────────────────────────────────────────────────

describe('verifyBundleSignature — raw 32-byte key fallback', () => {
  it('accepts a raw 32-byte key with the SPKI header stripped', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    // Strip the 12-byte SPKI header to get the raw 32-byte key.
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    keyRef.value = spkiDer.slice(12).toString('base64'); // raw 32 bytes

    const content = '{"id":"raw-key-test"}';
    expect(verifyBundleSignature(content, sign(content, privateKey))).toBe(true);
  });
});
