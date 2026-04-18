/**
 * marketplaceHandlers.test.ts — IPC routing tests for marketplace channels.
 *
 * ipcMain is mocked so handlers are captured and called directly without
 * a real Electron process. marketplaceClient is mocked to isolate routing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock ipcMain ──────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const handlers = new Map<string, HandlerFn>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: HandlerFn) => { handlers.set(channel, fn); },
  },
}));

// ── Mock marketplaceClient ────────────────────────────────────────────────────

const mockGetManifest = vi.fn();
const mockInstallById = vi.fn();
const mockGetRevokedIds = vi.fn();

vi.mock('../marketplace/marketplaceClient', () => ({
  getManifest: (...a: unknown[]) => mockGetManifest(...a),
  installById: (...a: unknown[]) => mockInstallById(...a),
  getRevokedIds: (...a: unknown[]) => mockGetRevokedIds(...a),
}));

import { registerMarketplaceHandlers } from './marketplaceHandlers';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTRY = {
  id: 'my-theme',
  title: 'My Theme',
  description: 'A nice theme',
  author: 'author',
  kind: 'theme' as const,
  version: '1.0.0',
  signature: 'sig==',
  downloadUrl: 'https://example.com/my-theme.json',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  registerMarketplaceHandlers();
});

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler(null, ...args);
}

// ── marketplace:listBundles ───────────────────────────────────────────────────

describe('marketplace:listBundles', () => {
  it('returns success + bundles on manifest success', async () => {
    mockGetManifest.mockResolvedValue({ bundles: [ENTRY] });
    const result = await invoke('marketplace:listBundles') as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.bundles)).toBe(true);
  });

  it('returns success: false when manifest returns error', async () => {
    mockGetManifest.mockResolvedValue({ error: 'offline' });
    const result = await invoke('marketplace:listBundles') as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('offline');
  });

  it('returns success: false when getManifest throws', async () => {
    mockGetManifest.mockRejectedValue(new Error('network failure'));
    const result = await invoke('marketplace:listBundles') as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('network failure');
  });
});

// ── marketplace:install ───────────────────────────────────────────────────────

describe('marketplace:install', () => {
  it('calls installById with the entryId and returns success', async () => {
    mockInstallById.mockResolvedValue({ success: true });
    const result = await invoke('marketplace:install', { entryId: 'my-theme' }) as Record<string, unknown>;
    expect(mockInstallById).toHaveBeenCalledWith('my-theme');
    expect(result.success).toBe(true);
  });

  it('forwards install error (e.g. invalid-signature)', async () => {
    mockInstallById.mockResolvedValue({ success: false, error: 'invalid-signature' });
    const result = await invoke('marketplace:install', { entryId: 'my-theme' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid-signature');
  });

  it('returns error for missing entryId', async () => {
    const result = await invoke('marketplace:install', { entryId: '' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('entryId');
  });

  it('returns error for non-string entryId', async () => {
    const result = await invoke('marketplace:install', { entryId: 42 }) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });

  it('returns success: false when installById throws', async () => {
    mockInstallById.mockRejectedValue(new Error('store locked'));
    const result = await invoke('marketplace:install', { entryId: 'my-theme' }) as Record<string, unknown>;
    expect(result.success).toBe(false);
  });
});

// ── marketplace:revokedIds ────────────────────────────────────────────────────

describe('marketplace:revokedIds', () => {
  it('returns ids array on success', async () => {
    mockGetRevokedIds.mockResolvedValue({ ids: ['old-bundle', 'bad-bundle'] });
    const result = await invoke('marketplace:revokedIds') as Record<string, unknown>;
    expect(Array.isArray(result.ids)).toBe(true);
    expect(result.ids).toContain('old-bundle');
  });

  it('returns empty ids on failure (best-effort)', async () => {
    mockGetRevokedIds.mockRejectedValue(new Error('offline'));
    const result = await invoke('marketplace:revokedIds') as Record<string, unknown>;
    expect(Array.isArray(result.ids)).toBe(true);
    expect((result.ids as string[]).length).toBe(0);
  });
});

// ── Channel registration ──────────────────────────────────────────────────────

describe('registerMarketplaceHandlers', () => {
  it('registers all three channels and returns their names', () => {
    handlers.clear();
    const channels = registerMarketplaceHandlers();
    expect(channels).toContain('marketplace:listBundles');
    expect(channels).toContain('marketplace:install');
    expect(channels).toContain('marketplace:revokedIds');
  });
});
