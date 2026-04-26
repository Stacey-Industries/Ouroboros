/**
 * @vitest-environment jsdom
 *
 * Smoke tests for extensionStoreModel.helpers — pure async action functions.
 * Tests mock window.electronAPI to stay in-process.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getExtensionStoreApi,
  notifyExtensionChange,
  runExtensionDetails,
  runExtensionInstall,
  runExtensionSearch,
  runExtensionToggle,
  runExtensionUninstall,
  runRefreshInstalled,
} from './extensionStoreModel.helpers';

// ── Minimal API stub ──────────────────────────────────────────────────────────

const apiStub = {
  search: vi.fn(),
  searchMarketplace: vi.fn(),
  getDetails: vi.fn(),
  getMarketplaceDetails: vi.fn(),
  install: vi.fn(),
  installMarketplace: vi.fn(),
  uninstall: vi.fn(),
  enableContributions: vi.fn(),
  disableContributions: vi.fn(),
  getInstalled: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: { extensionStore: apiStub },
    writable: true,
    configurable: true,
  });
});

// ── getExtensionStoreApi ──────────────────────────────────────────────────────

describe('getExtensionStoreApi', () => {
  it('returns the extensionStore object from window.electronAPI', () => {
    expect(getExtensionStoreApi()).toBe(apiStub);
  });

  it('returns undefined when electronAPI is absent', () => {
    Object.defineProperty(window, 'electronAPI', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(getExtensionStoreApi()).toBeUndefined();
  });
});

// ── notifyExtensionChange ─────────────────────────────────────────────────────

describe('notifyExtensionChange', () => {
  it('dispatches four CustomEvents on window', () => {
    const dispatched: string[] = [];
    const orig = window.dispatchEvent.bind(window);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => {
      dispatched.push((e as CustomEvent).type);
      return orig(e);
    });
    notifyExtensionChange();
    expect(dispatched).toHaveLength(4);
    vi.restoreAllMocks();
  });
});

// ── runExtensionSearch ────────────────────────────────────────────────────────

describe('runExtensionSearch', () => {
  it('calls api.search for openvsx source and updates state on success', async () => {
    const ext = { id: 'a.b', name: 'b', namespace: 'a', version: '1.0.0' };
    apiStub.search.mockResolvedValue({ success: true, extensions: [ext], totalSize: 1 });
    const setExtensions = vi.fn();
    const setLoading = vi.fn();
    const setError = vi.fn();
    const setTotalSize = vi.fn();
    const setOffset = vi.fn();

    await runExtensionSearch({
      api: apiStub as never,
      source: 'openvsx',
      query: 'test',
      category: null,
      offset: 0,
      append: false,
      setLoading,
      setError,
      setExtensions,
      setTotalSize,
      setOffset,
    });

    expect(apiStub.search).toHaveBeenCalledOnce();
    expect(setExtensions).toHaveBeenCalledOnce();
    expect(setTotalSize).toHaveBeenCalledWith(1);
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(setError).toHaveBeenCalledWith(null);
  });

  it('calls api.searchMarketplace for marketplace source', async () => {
    apiStub.searchMarketplace.mockResolvedValue({ success: true, extensions: [], totalSize: 0 });
    await runExtensionSearch({
      api: apiStub as never,
      source: 'marketplace',
      query: 'q',
      category: null,
      offset: 0,
      append: false,
      setLoading: vi.fn(),
      setError: vi.fn(),
      setExtensions: vi.fn(),
      setTotalSize: vi.fn(),
      setOffset: vi.fn(),
    });
    expect(apiStub.searchMarketplace).toHaveBeenCalledOnce();
  });

  it('sets error when api is undefined', async () => {
    const setError = vi.fn();
    await runExtensionSearch({
      api: undefined,
      source: 'openvsx',
      query: '',
      category: null,
      offset: 0,
      append: false,
      setLoading: vi.fn(),
      setError,
      setExtensions: vi.fn(),
      setTotalSize: vi.fn(),
      setOffset: vi.fn(),
    });
    expect(apiStub.search).not.toHaveBeenCalled();
  });
});

// ── runExtensionDetails ───────────────────────────────────────────────────────

describe('runExtensionDetails', () => {
  it('calls setSelectedExtension on success', async () => {
    const ext = { id: 'a.b', name: 'b', namespace: 'a', version: '1.0.0' };
    apiStub.getDetails.mockResolvedValue({ success: true, extension: ext });
    const setSelectedExtension = vi.fn();
    await runExtensionDetails({
      api: apiStub as never,
      source: 'openvsx',
      namespace: 'a',
      name: 'b',
      setSelectedExtension,
      setError: vi.fn(),
    });
    expect(setSelectedExtension).toHaveBeenCalledWith(ext);
  });

  it('calls setError on failure', async () => {
    apiStub.getDetails.mockResolvedValue({ success: false, error: 'not found' });
    const setError = vi.fn();
    await runExtensionDetails({
      api: apiStub as never,
      source: 'openvsx',
      namespace: 'x',
      name: 'y',
      setSelectedExtension: vi.fn(),
      setError,
    });
    expect(setError).toHaveBeenCalledWith('not found');
  });
});

// ── runExtensionInstall ───────────────────────────────────────────────────────

describe('runExtensionInstall', () => {
  it('updates installedMap on success', async () => {
    const installed = { id: 'a.b', name: 'b', namespace: 'a', version: '1.0.0' };
    apiStub.install.mockResolvedValue({ success: true, installed });
    const setInstalledMap = vi.fn();
    await runExtensionInstall({
      api: apiStub as never,
      source: 'openvsx',
      namespace: 'a',
      name: 'b',
      setInstallInProgress: vi.fn(),
      setInstalledMap,
      setError: vi.fn(),
    });
    expect(setInstalledMap).toHaveBeenCalledOnce();
  });

  it('sets error on failure', async () => {
    apiStub.install.mockResolvedValue({ success: false, error: 'bad' });
    const setError = vi.fn();
    await runExtensionInstall({
      api: apiStub as never,
      source: 'openvsx',
      namespace: 'a',
      name: 'b',
      setInstallInProgress: vi.fn(),
      setInstalledMap: vi.fn(),
      setError,
    });
    expect(setError).toHaveBeenCalledWith('bad');
  });
});

// ── runExtensionUninstall ─────────────────────────────────────────────────────

describe('runExtensionUninstall', () => {
  it('removes id from installedMap on success', async () => {
    apiStub.uninstall.mockResolvedValue({ success: true });
    const setInstalledMap = vi.fn();
    await runExtensionUninstall({
      api: apiStub as never,
      id: 'a.b',
      setInstalledMap,
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
    });
    expect(setInstalledMap).toHaveBeenCalledOnce();
  });
});

// ── runExtensionToggle ────────────────────────────────────────────────────────

describe('runExtensionToggle', () => {
  it('calls enableContributions when isDisabled=true', async () => {
    apiStub.enableContributions.mockResolvedValue({ success: true });
    await runExtensionToggle({
      api: apiStub as never,
      id: 'a.b',
      isDisabled: true,
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
    });
    expect(apiStub.enableContributions).toHaveBeenCalledWith('a.b');
  });

  it('calls disableContributions when isDisabled=false', async () => {
    apiStub.disableContributions.mockResolvedValue({ success: true });
    await runExtensionToggle({
      api: apiStub as never,
      id: 'a.b',
      isDisabled: false,
      setDisabledIds: vi.fn(),
      setError: vi.fn(),
    });
    expect(apiStub.disableContributions).toHaveBeenCalledWith('a.b');
  });
});

// ── runRefreshInstalled ───────────────────────────────────────────────────────

describe('runRefreshInstalled', () => {
  it('populates installedMap from getInstalled response', async () => {
    const exts = [{ id: 'a.b' }, { id: 'c.d' }];
    apiStub.getInstalled.mockResolvedValue({ success: true, extensions: exts });
    const setInstalledMap = vi.fn();
    await runRefreshInstalled({ api: apiStub as never, setInstalledMap });
    expect(setInstalledMap).toHaveBeenCalledOnce();
    const mapArg: Map<string, unknown> = setInstalledMap.mock.calls[0][0];
    expect(mapArg.has('a.b')).toBe(true);
    expect(mapArg.has('c.d')).toBe(true);
  });

  it('silently ignores errors', async () => {
    apiStub.getInstalled.mockRejectedValue(new Error('network'));
    const setInstalledMap = vi.fn();
    await expect(
      runRefreshInstalled({ api: apiStub as never, setInstalledMap }),
    ).resolves.toBeUndefined();
  });
});
