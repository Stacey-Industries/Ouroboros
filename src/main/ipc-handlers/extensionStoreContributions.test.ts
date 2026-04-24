/**
 * extensionStoreContributions.test.ts — Smoke tests for contribution loaders.
 *
 * Verifies that getThemeContributions, getIconThemeContributions, and
 * getProductIconThemeContributions filter disabled extensions and delegate
 * to the correct loader functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockLoadExtensionThemes = vi.fn().mockResolvedValue([]);
const mockLoadExtensionIconThemes = vi.fn().mockResolvedValue([]);
const mockLoadExtensionProductIconThemes = vi.fn().mockResolvedValue([]);

vi.mock('../contributions/themeLoader', () => ({
  loadExtensionThemes: (...args: unknown[]) => mockLoadExtensionThemes(...args),
}));

vi.mock('../contributions/iconThemeLoader', () => ({
  loadExtensionIconThemes: (...args: unknown[]) => mockLoadExtensionIconThemes(...args),
  loadExtensionProductIconThemes: (...args: unknown[]) =>
    mockLoadExtensionProductIconThemes(...args),
}));

const mockRefreshInstalledListFromDisk = vi.fn();
const mockGetDisabledList = vi.fn();

vi.mock('./extensionStoreHelpers', () => ({
  refreshInstalledListFromDisk: () => mockRefreshInstalledListFromDisk(),
  getDisabledList: () => mockGetDisabledList(),
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import {
  getIconThemeContributions,
  getProductIconThemeContributions,
  getThemeContributions,
} from './extensionStoreContributions';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeExtension(id: string, overrides = {}) {
  return {
    id,
    namespace: 'test',
    name: id,
    displayName: id,
    version: '1.0.0',
    description: '',
    installPath: `/ext/${id}`,
    installedAt: new Date().toISOString(),
    contributes: {
      themes: [{ label: 'Dark', uiTheme: 'vs-dark', path: '/ext/theme.json' }],
      iconThemes: [{ id: `${id}-icons`, label: 'Icons', path: '/ext/icons.json' }],
      productIconThemes: [{ id: `${id}-product`, label: 'Product', path: '/ext/product.json' }],
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getThemeContributions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDisabledList.mockReturnValue([]);
  });

  it('returns empty themes when no extensions are installed', async () => {
    mockRefreshInstalledListFromDisk.mockResolvedValue([]);
    const result = await getThemeContributions();
    expect(result).toEqual({ themes: [] });
    expect(mockLoadExtensionThemes).not.toHaveBeenCalled();
  });

  it('skips disabled extensions', async () => {
    const ext = makeExtension('disabled-ext');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockGetDisabledList.mockReturnValue(['disabled-ext']);
    const result = await getThemeContributions();
    expect(result).toEqual({ themes: [] });
    expect(mockLoadExtensionThemes).not.toHaveBeenCalled();
  });

  it('loads themes from enabled extensions', async () => {
    const ext = makeExtension('my-theme');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockLoadExtensionThemes.mockResolvedValue([{ label: 'Dark', uiTheme: 'vs-dark' }]);
    const result = await getThemeContributions();
    expect(mockLoadExtensionThemes).toHaveBeenCalledWith('my-theme', ext.contributes.themes);
    expect(result.themes).toHaveLength(1);
  });
});

describe('getIconThemeContributions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDisabledList.mockReturnValue([]);
  });

  it('returns empty iconThemes when no extensions installed', async () => {
    mockRefreshInstalledListFromDisk.mockResolvedValue([]);
    const result = await getIconThemeContributions();
    expect(result).toEqual({ iconThemes: [] });
  });

  it('skips disabled extensions', async () => {
    const ext = makeExtension('dis-icons');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockGetDisabledList.mockReturnValue(['dis-icons']);
    const result = await getIconThemeContributions();
    expect(result).toEqual({ iconThemes: [] });
  });

  it('loads iconThemes from enabled extensions', async () => {
    const ext = makeExtension('icon-ext');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockLoadExtensionIconThemes.mockResolvedValue([{ id: 'icon-ext-icons', label: 'Icons' }]);
    const result = await getIconThemeContributions();
    expect(mockLoadExtensionIconThemes).toHaveBeenCalledWith(
      'icon-ext',
      ext.contributes.iconThemes,
    );
    expect(result.iconThemes).toHaveLength(1);
  });
});

describe('getProductIconThemeContributions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDisabledList.mockReturnValue([]);
  });

  it('returns empty productIconThemes when no extensions installed', async () => {
    mockRefreshInstalledListFromDisk.mockResolvedValue([]);
    const result = await getProductIconThemeContributions();
    expect(result).toEqual({ productIconThemes: [] });
  });

  it('skips disabled extensions', async () => {
    const ext = makeExtension('dis-product');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockGetDisabledList.mockReturnValue(['dis-product']);
    const result = await getProductIconThemeContributions();
    expect(result).toEqual({ productIconThemes: [] });
  });

  it('loads productIconThemes from enabled extensions', async () => {
    const ext = makeExtension('product-ext');
    mockRefreshInstalledListFromDisk.mockResolvedValue([ext]);
    mockLoadExtensionProductIconThemes.mockResolvedValue([{ id: 'product-ext-product' }]);
    const result = await getProductIconThemeContributions();
    expect(mockLoadExtensionProductIconThemes).toHaveBeenCalledWith(
      'product-ext',
      ext.contributes.productIconThemes,
    );
    expect(result.productIconThemes).toHaveLength(1);
  });
});
