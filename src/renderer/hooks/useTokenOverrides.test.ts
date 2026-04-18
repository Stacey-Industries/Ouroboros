/**
 * @vitest-environment jsdom
 *
 * useTokenOverrides — unit tests.
 * Mocks useConfig to inject controllable theming slices.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useConfig before importing the hook under test
vi.mock('./useConfig');

import { useConfig } from './useConfig';
import { useTokenOverrides } from './useTokenOverrides';

const mockUseConfig = vi.mocked(useConfig);

function makeConfig(theming: Record<string, unknown> | undefined) {
  return {
    config: theming !== undefined ? ({ theming } as never) : ({ theming: undefined } as never),
    isLoading: false,
    error: null,
    set: vi.fn(),
    refresh: vi.fn(),
  };
}

function getProp(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

describe('useTokenOverrides', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('sets accentOverride as --interactive-accent', () => {
    mockUseConfig.mockReturnValue(makeConfig({ accentOverride: '#5ab9ff' })); // hardcoded: test data — user-supplied accent color exercising override path
    renderHook(() => useTokenOverrides());
    expect(getProp('--interactive-accent')).toBe('#5ab9ff'); // hardcoded: test data — asserting the exact value written above
  });

  it('sets font overrides', () => {
    mockUseConfig.mockReturnValue(makeConfig({
      fonts: { editor: 'JetBrains Mono', chat: 'Inter', terminal: 'Fira Code' },
    }));
    renderHook(() => useTokenOverrides());
    expect(getProp('--font-editor')).toBe('JetBrains Mono');
    expect(getProp('--font-chat')).toBe('Inter');
    expect(getProp('--font-terminal')).toBe('Fira Code');
  });

  it('sets customTokens as CSS custom properties', () => {
    mockUseConfig.mockReturnValue(makeConfig({
      customTokens: { '--surface-base': '#1a1a2e', '--text-primary': '#eee' }, // hardcoded: test data — arbitrary hex to verify customTokens passthrough
    }));
    renderHook(() => useTokenOverrides());
    expect(getProp('--surface-base')).toBe('#1a1a2e'); // hardcoded: test data — asserting stored value
    expect(getProp('--text-primary')).toBe('#eee'); // hardcoded: test data — asserting stored value
  });

  it('removes a property when its override is removed from config', () => {
    mockUseConfig.mockReturnValue(makeConfig({ accentOverride: '#ff0000' })); // hardcoded: test data — arbitrary accent to verify removal
    const { rerender } = renderHook(() => useTokenOverrides());
    expect(getProp('--interactive-accent')).toBe('#ff0000'); // hardcoded: test data — asserting stored value
    mockUseConfig.mockReturnValue(makeConfig({}));
    rerender();
    expect(getProp('--interactive-accent')).toBe('');
  });

  it('updates when config changes', () => {
    mockUseConfig.mockReturnValue(makeConfig({ accentOverride: '#aaaaaa' })); // hardcoded: test data — first accent for reactivity check
    const { rerender } = renderHook(() => useTokenOverrides());
    expect(getProp('--interactive-accent')).toBe('#aaaaaa'); // hardcoded: test data — asserting stored value
    mockUseConfig.mockReturnValue(makeConfig({ accentOverride: '#bbbbbb' })); // hardcoded: test data — second accent for reactivity check
    rerender();
    expect(getProp('--interactive-accent')).toBe('#bbbbbb'); // hardcoded: test data — asserting stored value
  });

  it('does not set any properties when theming is absent', () => {
    mockUseConfig.mockReturnValue(makeConfig(undefined));
    renderHook(() => useTokenOverrides());
    expect(document.documentElement.getAttribute('style')).toBeFalsy();
  });

  it('removes all properties on unmount', () => {
    mockUseConfig.mockReturnValue(makeConfig({ accentOverride: '#123456' })); // hardcoded: test data — accent to verify cleanup on unmount
    const { unmount } = renderHook(() => useTokenOverrides());
    expect(getProp('--interactive-accent')).toBe('#123456'); // hardcoded: test data — asserting stored value
    unmount();
    expect(getProp('--interactive-accent')).toBe('');
  });
});
