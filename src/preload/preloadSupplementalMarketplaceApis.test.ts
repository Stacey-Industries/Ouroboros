/**
 * preloadSupplementalMarketplaceApis.test.ts
 *
 * Verifies each marketplaceApi method invokes the correct IPC channel
 * with the correct arguments.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Electron mock ─────────────────────────────────────────────────────────────

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
  },
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { marketplaceApi } from './preloadSupplementalMarketplaceApis';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockInvoke.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('marketplaceApi', () => {
  describe('listBundles()', () => {
    it('invokes marketplace:listBundles with no args', async () => {
      await marketplaceApi.listBundles();
      expect(mockInvoke).toHaveBeenCalledWith('marketplace:listBundles');
    });

    it('returns the IPC result', async () => {
      mockInvoke.mockResolvedValue({ success: true, bundles: [] });
      const result = await marketplaceApi.listBundles();
      expect(result).toEqual({ success: true, bundles: [] });
    });
  });

  describe('install()', () => {
    it('invokes marketplace:install with the args object', async () => {
      await marketplaceApi.install({ entryId: 'my-theme' });
      expect(mockInvoke).toHaveBeenCalledWith('marketplace:install', { entryId: 'my-theme' });
    });

    it('forwards install failure result', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'invalid-signature' });
      const result = await marketplaceApi.install({ entryId: 'bad-bundle' });
      expect(result.success).toBe(false);
    });
  });

  describe('revokedIds()', () => {
    it('invokes marketplace:revokedIds with no args', async () => {
      mockInvoke.mockResolvedValue({ ids: ['old-bundle'] });
      await marketplaceApi.revokedIds();
      expect(mockInvoke).toHaveBeenCalledWith('marketplace:revokedIds');
    });

    it('returns ids array', async () => {
      mockInvoke.mockResolvedValue({ ids: ['a', 'b'] });
      const result = await marketplaceApi.revokedIds();
      expect(result.ids).toEqual(['a', 'b']);
    });

    it('returns empty ids on failure (best-effort)', async () => {
      mockInvoke.mockResolvedValue({ ids: [] });
      const result = await marketplaceApi.revokedIds();
      expect(result.ids).toEqual([]);
    });
  });
});
