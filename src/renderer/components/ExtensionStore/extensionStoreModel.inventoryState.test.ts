/**
 * @vitest-environment jsdom
 *
 * Smoke tests for useExtensionStoreInventoryState.
 * All IPC helpers are mocked so tests run synchronously.
 */
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./extensionStoreModel.helpers', () => ({
  getExtensionStoreApi: vi.fn(() => ({})),
  runExtensionInstall: vi.fn(),
  runExtensionUninstall: vi.fn(),
  runExtensionToggle: vi.fn(),
  runRefreshInstalled: vi.fn(),
}));

import {
  getExtensionStoreApi,
  runExtensionInstall,
  runExtensionToggle,
  runExtensionUninstall,
  runRefreshInstalled,
} from './extensionStoreModel.helpers';
import { useExtensionStoreInventoryState } from './extensionStoreModel.inventoryState';

const mockInstall = vi.mocked(runExtensionInstall);
const mockUninstall = vi.mocked(runExtensionUninstall);
const mockToggle = vi.mocked(runExtensionToggle);
const mockRefresh = vi.mocked(runRefreshInstalled);
const mockGetApi = vi.mocked(getExtensionStoreApi);

function renderInventoryState() {
  const setError = vi.fn();
  return renderHook(() => {
    const sourceRef = useRef<'openvsx' | 'marketplace'>('openvsx');
    return useExtensionStoreInventoryState({ sourceRef, setError });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useExtensionStoreInventoryState', () => {
  it('initialises with empty maps and no install in progress', () => {
    const { result } = renderInventoryState();
    expect(result.current.installedMap.size).toBe(0);
    expect(result.current.disabledIds.size).toBe(0);
    expect(result.current.installInProgress).toBeNull();
  });

  it('install() calls runExtensionInstall with namespace and name', () => {
    const { result } = renderInventoryState();
    act(() => { result.current.install('ms-python', 'python'); });
    expect(mockInstall).toHaveBeenCalledOnce();
    const args = mockInstall.mock.calls[0][0];
    expect(args.namespace).toBe('ms-python');
    expect(args.name).toBe('python');
    expect(args.source).toBe('openvsx');
    expect(args.api).toBeDefined();
  });

  it('uninstall() calls runExtensionUninstall with the id', () => {
    const { result } = renderInventoryState();
    act(() => { result.current.uninstall('ms-python.python'); });
    expect(mockUninstall).toHaveBeenCalledOnce();
    expect(mockUninstall.mock.calls[0][0].id).toBe('ms-python.python');
  });

  it('toggleEnabled() calls runExtensionToggle with isDisabled=false when not in disabledIds', () => {
    const { result } = renderInventoryState();
    act(() => { result.current.toggleEnabled('some.ext'); });
    expect(mockToggle).toHaveBeenCalledOnce();
    const args = mockToggle.mock.calls[0][0];
    expect(args.id).toBe('some.ext');
    expect(args.isDisabled).toBe(false);
  });

  it('refreshInstalled() calls runRefreshInstalled with the api', () => {
    const { result } = renderInventoryState();
    act(() => { result.current.refreshInstalled(); });
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockRefresh.mock.calls[0][0].api).toBe(mockGetApi.mock.results[0].value);
  });

  it('exposes install, uninstall, toggleEnabled, refreshInstalled as functions', () => {
    const { result } = renderInventoryState();
    expect(typeof result.current.install).toBe('function');
    expect(typeof result.current.uninstall).toBe('function');
    expect(typeof result.current.toggleEnabled).toBe('function');
    expect(typeof result.current.refreshInstalled).toBe('function');
  });
});
