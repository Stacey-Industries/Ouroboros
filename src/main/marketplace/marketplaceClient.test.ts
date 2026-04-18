/**
 * marketplaceClient.test.ts — facade tests for getManifest / getBundle /
 * installById / getRevokedIds.
 *
 * All sub-module dependencies are mocked so this tests only the wiring logic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./trustedKeys', () => ({
  TRUSTED_PUBLIC_KEY_BASE64: 'REPLACE_WITH_PRODUCTION_KEY',
  MARKETPLACE_MANIFEST_URL: 'https://example.com/index.json',
  REVOKED_BUNDLES_URL: 'https://example.com/revoked-bundles.json',
}));

const mockFetchManifest = vi.fn();
const mockFetchBundle = vi.fn();
const mockFetchRevokedIds = vi.fn();

vi.mock('./marketplaceFetch', () => ({
  fetchManifest: (...a: unknown[]) => mockFetchManifest(...a),
  fetchBundle: (...a: unknown[]) => mockFetchBundle(...a),
  fetchRevokedIds: (...a: unknown[]) => mockFetchRevokedIds(...a),
}));

const mockInstallBundle = vi.fn();

vi.mock('./marketplaceInstall', () => ({
  installBundle: (...a: unknown[]) => mockInstallBundle(...a),
}));

import { getBundle, getManifest, getRevokedIds, installById } from './marketplaceClient';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTRY = {
  id: 'test-bundle',
  title: 'Test',
  description: 'desc',
  author: 'author',
  kind: 'theme' as const,
  version: '1.0.0',
  signature: 'sig==',
  downloadUrl: 'https://example.com/test-bundle.json',
};

const BUNDLE_CONTENT = { id: 'test-bundle', kind: 'theme' as const, payload: { '--accent': 'blue' } };

// ── getManifest ───────────────────────────────────────────────────────────────

describe('getManifest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to fetchManifest with the manifest URL', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [ENTRY] });
    const result = await getManifest();
    expect(mockFetchManifest).toHaveBeenCalledWith('https://example.com/index.json');
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.bundles).toHaveLength(1);
  });

  it('forwards error from fetchManifest', async () => {
    mockFetchManifest.mockResolvedValue({ error: 'timeout' });
    const result = await getManifest();
    expect('error' in result).toBe(true);
  });
});

// ── getBundle ─────────────────────────────────────────────────────────────────

describe('getBundle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns BundleContent on valid signature', async () => {
    mockFetchBundle.mockResolvedValue(BUNDLE_CONTENT);
    const result = await getBundle(ENTRY);
    expect('error' in result).toBe(false);
    if (!('error' in result)) expect(result.id).toBe('test-bundle');
  });

  it('returns invalid-signature error when verify fails', async () => {
    mockFetchBundle.mockResolvedValue({ error: 'invalid-signature' });
    const result = await getBundle(ENTRY);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('invalid-signature');
  });
});

// ── installById ───────────────────────────────────────────────────────────────

describe('installById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves entry, fetches, and installs on happy path', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [ENTRY] });
    mockFetchBundle.mockResolvedValue(BUNDLE_CONTENT);
    mockInstallBundle.mockReturnValue({ success: true });

    const result = await installById('test-bundle');
    expect(result.success).toBe(true);
    expect(mockInstallBundle).toHaveBeenCalledWith(BUNDLE_CONTENT);
  });

  it('returns error when manifest fetch fails', async () => {
    mockFetchManifest.mockResolvedValue({ error: 'offline' });
    const result = await installById('test-bundle');
    expect(result.success).toBe(false);
    expect(result.error).toContain('manifest-fetch-failed');
  });

  it('returns bundle-not-found when id is absent from manifest', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [] });
    const result = await installById('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('bundle-not-found');
  });

  it('returns error when signature check fails', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [ENTRY] });
    mockFetchBundle.mockResolvedValue({ error: 'invalid-signature' });
    const result = await installById('test-bundle');
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid-signature');
  });

  it('forwards install error from installBundle', async () => {
    mockFetchManifest.mockResolvedValue({ bundles: [ENTRY] });
    mockFetchBundle.mockResolvedValue(BUNDLE_CONTENT);
    mockInstallBundle.mockReturnValue({ success: false, error: 'rules-install-not-wired' });
    const result = await installById('test-bundle');
    expect(result.success).toBe(false);
    expect(result.error).toBe('rules-install-not-wired');
  });
});

// ── getRevokedIds ─────────────────────────────────────────────────────────────

describe('getRevokedIds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to fetchRevokedIds with the revoked URL', async () => {
    mockFetchRevokedIds.mockResolvedValue({ ids: ['old-bundle'] });
    const result = await getRevokedIds();
    expect(mockFetchRevokedIds).toHaveBeenCalledWith('https://example.com/revoked-bundles.json');
    expect(result.ids).toEqual(['old-bundle']);
  });

  it('returns empty ids when fetch fails (best-effort)', async () => {
    mockFetchRevokedIds.mockResolvedValue({ ids: [] });
    const result = await getRevokedIds();
    expect(result.ids).toEqual([]);
  });
});
