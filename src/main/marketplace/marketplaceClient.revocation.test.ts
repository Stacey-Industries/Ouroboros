/**
 * marketplaceClient.revocation.test.ts — revocation-check behaviour inside
 * installById.
 *
 * Verifies:
 *   - Revoked bundle ID → rejected with 'bundle-revoked'.
 *   - Revocation fetch failure → rejected with 'revocation-check-failed' by default.
 *   - Revocation fetch failure + allowInstallOnRevocationFetchFailure flag →
 *     install proceeds.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// trustedKeys — supply deterministic test URLs.
vi.mock('./trustedKeys', () => ({
  TRUSTED_PUBLIC_KEY_BASE64: 'REPLACE_WITH_PRODUCTION_KEY',
  MARKETPLACE_MANIFEST_URL: 'https://example.com/index.json',
  REVOKED_BUNDLES_URL: 'https://example.com/revoked-bundles.json',
}));

// marketplaceFetch — capture httpsGet so we can simulate network failures.
const mockHttpsGet = vi.fn();
const mockFetchManifestFn = vi.fn();
const mockFetchBundleFn = vi.fn();

vi.mock('./marketplaceFetch', () => ({
  fetchManifest: (...a: unknown[]) => mockFetchManifestFn(...a),
  fetchBundle: (...a: unknown[]) => mockFetchBundleFn(...a),
  fetchRevokedIds: vi.fn(),
  httpsGet: (...a: unknown[]) => mockHttpsGet(...a),
}));

// marketplaceInstall — capture installBundle calls.
const mockInstallBundle = vi.fn();

vi.mock('./marketplaceInstall', () => ({
  installBundle: (...a: unknown[]) => mockInstallBundle(...a),
}));

// config — prevent electron-store initialisation.
const mockGetConfigValue = vi.fn();

vi.mock('../config', () => ({
  getConfigValue: (...a: unknown[]) => mockGetConfigValue(...a),
}));

import { installById } from './marketplaceClient';

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

const BUNDLE_CONTENT = {
  id: 'test-bundle',
  kind: 'theme' as const,
  payload: { '--accent': 'blue' },
};

const REVOKED_LIST_JSON = JSON.stringify({ ids: ['test-bundle', 'other-bundle'] });
const EMPTY_REVOKED_LIST_JSON = JSON.stringify({ ids: [] });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('installById — revocation check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: manifest returns the entry; bundle fetch succeeds; install ok.
    mockFetchManifestFn.mockResolvedValue({ bundles: [ENTRY] });
    mockFetchBundleFn.mockResolvedValue(BUNDLE_CONTENT);
    mockInstallBundle.mockReturnValue({ success: true });
    // Default: flag is off.
    mockGetConfigValue.mockReturnValue({ allowInstallOnRevocationFetchFailure: false });
  });

  it('rejects a revoked bundle ID with bundle-revoked', async () => {
    // Revocation list contains the target bundle.
    mockHttpsGet.mockResolvedValue(REVOKED_LIST_JSON);

    const result = await installById('test-bundle');

    expect(result.success).toBe(false);
    expect(result.error).toBe('bundle-revoked');
    expect(mockInstallBundle).not.toHaveBeenCalled();
  });

  it('allows a non-revoked bundle when revocation list is fetched', async () => {
    mockHttpsGet.mockResolvedValue(EMPTY_REVOKED_LIST_JSON);

    const result = await installById('test-bundle');

    expect(result.success).toBe(true);
    expect(mockInstallBundle).toHaveBeenCalledOnce();
  });

  it('rejects when revocation fetch fails and flag is off (fail-closed default)', async () => {
    // Simulate network failure.
    mockHttpsGet.mockRejectedValue(new Error('network unreachable'));
    mockGetConfigValue.mockReturnValue({ allowInstallOnRevocationFetchFailure: false });

    const result = await installById('test-bundle');

    expect(result.success).toBe(false);
    expect(result.error).toBe('revocation-check-failed');
    expect(mockInstallBundle).not.toHaveBeenCalled();
  });

  it('rejects when revocation response is malformed and flag is off', async () => {
    // Returns invalid JSON shape.
    mockHttpsGet.mockResolvedValue('{"broken":true}');
    mockGetConfigValue.mockReturnValue({ allowInstallOnRevocationFetchFailure: false });

    const result = await installById('test-bundle');

    expect(result.success).toBe(false);
    expect(result.error).toBe('revocation-check-failed');
  });

  it('allows install when revocation fetch fails and flag is on', async () => {
    mockHttpsGet.mockRejectedValue(new Error('network unreachable'));
    // Override marketplace config to allow on failure.
    mockGetConfigValue.mockReturnValue({ allowInstallOnRevocationFetchFailure: true });

    const result = await installById('test-bundle');

    expect(result.success).toBe(true);
    expect(mockInstallBundle).toHaveBeenCalledOnce();
  });
});
