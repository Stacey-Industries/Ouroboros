/**
 * marketplaceRoundtrip.test.ts — Wave 41 Phase J
 *
 * Generates a real Ed25519 keypair, signs a bundle, stubs the marketplace
 * network calls, and exercises installById end-to-end.
 * Asserts that config is written correctly for each bundle kind.
 */

import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mutable key ref — mirrors signatureVerify.test.ts pattern ─────────

const { keyRef } = vi.hoisted(() => ({
  keyRef: { value: 'REPLACE_WITH_PRODUCTION_KEY' },
}));

vi.mock('./trustedKeys', () => ({
  get TRUSTED_PUBLIC_KEY_BASE64() { return keyRef.value; },
  MARKETPLACE_MANIFEST_URL: 'https://example.com/index.json',
  REVOKED_BUNDLES_URL: 'https://example.com/revoked.json',
}));

// ── Network stubs ─────────────────────────────────────────────────────────────

const mockFetchManifest = vi.fn();
const mockFetchBundle = vi.fn();
const mockFetchRevokedIds = vi.fn().mockResolvedValue({ ids: [] });
const mockHttpsGet = vi.fn();

vi.mock('./marketplaceFetch', () => ({
  fetchManifest: (...a: unknown[]) => mockFetchManifest(...a),
  fetchBundle: (...a: unknown[]) => mockFetchBundle(...a),
  fetchRevokedIds: (...a: unknown[]) => mockFetchRevokedIds(...a),
  // httpsGet is used directly by marketplaceClient's internal fetchRevokedIdsWithFailure.
  // Default: return empty revocation list so happy-path tests pass without extra setup.
  httpsGet: (...a: unknown[]) => mockHttpsGet(...a),
}));

// ── Config store ──────────────────────────────────────────────────────────────

const configStore: Record<string, unknown> = {};

vi.mock('../config', () => ({
  // eslint-disable-next-line security/detect-object-injection -- test-only config store; k is controlled by test code
  getConfigValue: (k: string) => configStore[k] ?? null,
  // eslint-disable-next-line security/detect-object-injection -- test-only config store; k is controlled by test code
  setConfigValue: (k: string, v: unknown) => { configStore[k] = v; },
}));

// ── Logger ────────────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { installById } from './marketplaceClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKeypair(): { spkiBase64: string; privateKey: crypto.KeyObject } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const spkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return { spkiBase64, privateKey };
}

function sign(content: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(content), privateKey).toString('base64');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('marketplace round-trip — theme bundle', () => {
  let privateKey: crypto.KeyObject;

  beforeEach(() => {
    const kp = makeKeypair();
    keyRef.value = kp.spkiBase64;
    privateKey = kp.privateKey;
    vi.clearAllMocks();
    mockFetchRevokedIds.mockResolvedValue({ ids: [] });
    // Default: httpsGet returns empty revocation list (used by fetchRevokedIdsWithFailure)
    mockHttpsGet.mockResolvedValue(JSON.stringify({ ids: [] }));
    // Reset config
    // eslint-disable-next-line security/detect-object-injection -- test-only cleanup; k is from Object.keys
    for (const k of Object.keys(configStore)) delete configStore[k];
  });

  it('installs a signed theme bundle and writes customTokens to config', async () => {
    const bundleContent = {
      id: 'test-theme-001',
      kind: 'theme' as const,
      payload: { '--primary-color': '#3b82f6', '--bg-surface': '#1e1e2e' },
    };
    const contentJson = JSON.stringify(bundleContent);
    const signature = sign(contentJson, privateKey);

    const entry = {
      id: 'test-theme-001',
      title: 'Test Theme',
      description: 'A test theme',
      author: 'tester',
      kind: 'theme' as const,
      version: '1.0.0',
      signature,
      downloadUrl: 'https://example.com/test-theme-001.json',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });
    mockFetchBundle.mockResolvedValue(bundleContent);

    const result = await installById('test-theme-001');

    expect(result.success).toBe(true);

    const theming = configStore['theming'] as Record<string, unknown> | undefined;
    expect(theming).toBeDefined();
    const tokens = theming?.customTokens as Record<string, string>;
    expect(tokens['--primary-color']).toBe('#3b82f6');
    expect(tokens['--bg-surface']).toBe('#1e1e2e');
  });

  it('installs a signed prompt bundle and writes systemPrompt to config', async () => {
    const bundleContent = {
      id: 'test-prompt-001',
      kind: 'prompt' as const,
      payload: 'You are a helpful assistant.',
    };
    const contentJson = JSON.stringify(bundleContent);
    const signature = sign(contentJson, privateKey);

    const entry = {
      id: 'test-prompt-001',
      title: 'Test Prompt',
      description: 'A test prompt',
      author: 'tester',
      kind: 'prompt' as const,
      version: '1.0.0',
      signature,
      downloadUrl: 'https://example.com/test-prompt-001.json',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });
    mockFetchBundle.mockResolvedValue(bundleContent);

    const result = await installById('test-prompt-001');

    expect(result.success).toBe(true);

    const ecosystem = configStore['ecosystem'] as Record<string, unknown> | undefined;
    expect(ecosystem?.systemPrompt).toBe('You are a helpful assistant.');
  });

  it('rejects when bundle is in the revocation list', async () => {
    const bundleContent = {
      id: 'revoked-bundle',
      kind: 'theme' as const,
      payload: { '--color': '#000' },
    };
    const contentJson = JSON.stringify(bundleContent);
    const signature = sign(contentJson, privateKey);

    const entry = {
      id: 'revoked-bundle',
      title: 'Revoked',
      description: '',
      author: 'tester',
      kind: 'theme' as const,
      version: '1.0.0',
      signature,
      downloadUrl: 'https://example.com/revoked.json',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });

    // Stub httpsGet to return a revocation list that contains this ID
    mockHttpsGet.mockResolvedValueOnce(
      JSON.stringify({ ids: ['revoked-bundle'] }),
    );

    const result = await installById('revoked-bundle');

    expect(result.success).toBe(false);
    expect(result.error).toBe('bundle-revoked');
    // Config should NOT have been written
    expect(configStore['theming']).toBeUndefined();
  });

  it('rejects when revocation check fails (fail-closed by default)', async () => {
    const entry = {
      id: 'any-bundle',
      title: '',
      description: '',
      author: '',
      kind: 'theme' as const,
      version: '1.0.0',
      signature: '',
      downloadUrl: '',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });
    // httpsGet throws → revocation check fails
    mockHttpsGet.mockRejectedValueOnce(new Error('network-error'));
    // No allowInstallOnRevocationFetchFailure flag in config
    configStore['marketplace'] = {};

    const result = await installById('any-bundle');

    expect(result.success).toBe(false);
    expect(result.error).toBe('revocation-check-failed');
  });

  it('installs when revocation fetch fails and allowInstallOnRevocationFetchFailure is true', async () => {
    const bundleContent = {
      id: 'offline-bundle',
      kind: 'theme' as const,
      payload: { '--c': '#fff' },
    };
    const contentJson = JSON.stringify(bundleContent);
    const signature = sign(contentJson, privateKey);

    const entry = {
      id: 'offline-bundle',
      title: '',
      description: '',
      author: '',
      kind: 'theme' as const,
      version: '1.0.0',
      signature,
      downloadUrl: 'https://example.com/offline-bundle.json',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });
    // Simulate revocation fetch failure
    mockHttpsGet.mockRejectedValueOnce(new Error('offline'));
    mockFetchBundle.mockResolvedValue(bundleContent);

    configStore['marketplace'] = { allowInstallOnRevocationFetchFailure: true };

    const result = await installById('offline-bundle');

    expect(result.success).toBe(true);
  });

  it('rejects a theme bundle with invalid key shapes', async () => {
    const bundleContent = {
      id: 'bad-keys',
      kind: 'theme' as const,
      payload: { '--valid-key': '#fff', 'not-a-custom-property': 'evil' },
    };
    const contentJson = JSON.stringify(bundleContent);
    const signature = sign(contentJson, privateKey);

    const entry = {
      id: 'bad-keys',
      title: '',
      description: '',
      author: '',
      kind: 'theme' as const,
      version: '1.0.0',
      signature,
      downloadUrl: 'https://example.com/bad-keys.json',
    };

    mockFetchManifest.mockResolvedValue({ bundles: [entry] });
    mockFetchBundle.mockResolvedValue(bundleContent);

    const result = await installById('bad-keys') as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe('theme-key-invalid');
  });

  it('returns bundle-not-found when id is absent from manifest', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [] });

    const result = await installById('does-not-exist');

    expect(result.success).toBe(false);
    expect(result.error).toContain('bundle-not-found');
  });
});
