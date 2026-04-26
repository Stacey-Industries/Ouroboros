/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebFolderBrowser } from './WebFolderBrowserHook';

vi.mock('./WebFolderBrowserSupport', () => ({
  resolveFolderSelection: vi.fn(),
}));

import { resolveFolderSelection } from './WebFolderBrowserSupport';

const mockReadDir = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: { files: { readDir: mockReadDir } },
    writable: true,
    configurable: true,
  });
});

describe('useWebFolderBrowser', () => {
  it('initializes closed with root path', () => {
    const { result } = renderHook(() => useWebFolderBrowser());
    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.currentPath).toBe('/');
    expect(result.current.state.entries).toHaveLength(0);
    expect(result.current.state.error).toBeNull();
  });

  it('open() sets isOpen and triggers navigate to current path', async () => {
    mockReadDir.mockResolvedValue({ success: true, items: [] });
    const { result } = renderHook(() => useWebFolderBrowser());
    await act(async () => {
      result.current.open();
    });
    expect(result.current.state.isOpen).toBe(true);
    expect(mockReadDir).toHaveBeenCalledWith('/');
  });

  it('navigate() populates entries on success', async () => {
    const entries = [
      { name: 'src', path: '/src', isDirectory: true },
      { name: 'README.md', path: '/README.md', isDirectory: false },
    ];
    mockReadDir.mockResolvedValue({ success: true, items: entries });
    const { result } = renderHook(() => useWebFolderBrowser());
    await act(async () => {
      await result.current.navigate('/');
    });
    expect(result.current.state.entries).toEqual(entries);
    expect(result.current.state.loading).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it('navigate() sets error on API failure', async () => {
    mockReadDir.mockResolvedValue({ success: false, error: 'Permission denied' });
    const { result } = renderHook(() => useWebFolderBrowser());
    await act(async () => {
      await result.current.navigate('/protected');
    });
    expect(result.current.state.error).toBe('Permission denied');
    expect(result.current.state.loading).toBe(false);
  });

  it('navigate() sets error when API throws', async () => {
    mockReadDir.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useWebFolderBrowser());
    await act(async () => {
      await result.current.navigate('/bad');
    });
    expect(result.current.state.error).toContain('network error');
  });

  it('cancel() closes browser and resolves with cancelled=true', () => {
    const { result } = renderHook(() => useWebFolderBrowser());
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.isOpen).toBe(false);
    expect(resolveFolderSelection).toHaveBeenCalledWith({ cancelled: true, path: null });
  });

  it('select() closes browser and resolves with the current path', async () => {
    mockReadDir.mockResolvedValue({ success: true, items: [] });
    const { result } = renderHook(() => useWebFolderBrowser());
    await act(async () => {
      await result.current.navigate('/projects');
    });
    act(() => {
      result.current.select();
    });
    expect(result.current.state.isOpen).toBe(false);
    expect(resolveFolderSelection).toHaveBeenCalledWith({ cancelled: false, path: '/projects' });
  });
});
