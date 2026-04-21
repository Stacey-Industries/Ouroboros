/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useThemeActions } from './useTheme.actions';

interface MockWindow {
  electronAPI?: { config?: { set?: (key: string, value: unknown) => void } };
}

const mockSet = vi.fn();

beforeEach(() => {
  mockSet.mockReset();
  (globalThis as unknown as MockWindow).electronAPI = { config: { set: mockSet } };
});

describe('useThemeActions', () => {
  it('setTheme normalizes unknown ids to defaultThemeId and persists', async () => {
    const setRuntimeState = vi.fn();
    const writeThemeToStore = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useThemeActions({ setRuntimeState, writeThemeToStore }));
    await result.current.setTheme('not-a-real-theme');
    expect(setRuntimeState).toHaveBeenCalledWith(
      expect.objectContaining({ themeId: expect.any(String), hydrated: true }),
    );
    expect(writeThemeToStore).toHaveBeenCalledTimes(1);
  });

  it('setShowBgGradient updates state and persists', () => {
    const setRuntimeState = vi.fn();
    const { result } = renderHook(() =>
      useThemeActions({ setRuntimeState, writeThemeToStore: vi.fn() }),
    );
    result.current.setShowBgGradient(false);
    expect(setRuntimeState).toHaveBeenCalledWith({ showBgGradient: false, hydrated: true });
    expect(mockSet).toHaveBeenCalledWith('showBgGradient', false);
  });

  it('setGlassOpacity updates state and persists', () => {
    const setRuntimeState = vi.fn();
    const { result } = renderHook(() =>
      useThemeActions({ setRuntimeState, writeThemeToStore: vi.fn() }),
    );
    result.current.setGlassOpacity(42);
    expect(setRuntimeState).toHaveBeenCalledWith({ glassOpacity: 42, hydrated: true });
    expect(mockSet).toHaveBeenCalledWith('glassOpacity', 42);
  });

  it('setMaterialVariant accepts valid variants', () => {
    const setRuntimeState = vi.fn();
    const { result } = renderHook(() =>
      useThemeActions({ setRuntimeState, writeThemeToStore: vi.fn() }),
    );
    result.current.setMaterialVariant('prism');
    expect(setRuntimeState).toHaveBeenCalledWith({ materialVariant: 'prism', hydrated: true });
    expect(mockSet).toHaveBeenCalledWith('materialVariant', 'prism');
  });

  it('setMaterialVariant falls back to vapor for invalid values', () => {
    const setRuntimeState = vi.fn();
    const { result } = renderHook(() =>
      useThemeActions({ setRuntimeState, writeThemeToStore: vi.fn() }),
    );
    // @ts-expect-error — intentionally invalid
    result.current.setMaterialVariant('bogus');
    expect(setRuntimeState).toHaveBeenCalledWith({ materialVariant: 'vapor', hydrated: true });
    expect(mockSet).toHaveBeenCalledWith('materialVariant', 'vapor');
  });

  it('swallows IPC failures silently', () => {
    const setRuntimeState = vi.fn();
    mockSet.mockImplementation(() => {
      throw new Error('IPC unavailable');
    });
    const { result } = renderHook(() =>
      useThemeActions({ setRuntimeState, writeThemeToStore: vi.fn() }),
    );
    expect(() => result.current.setGlassOpacity(10)).not.toThrow();
    expect(setRuntimeState).toHaveBeenCalled();
  });
});
