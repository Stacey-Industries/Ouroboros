/**
 * DensityContext.test.tsx — Unit tests for DensityProvider + useDensity.
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DensityProvider, useDensity } from './DensityContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSet = vi.fn();
let mockConfig: { chat?: { density?: string } } | null = { chat: { density: 'comfortable' } };

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({ config: mockConfig, set: mockSet }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return <DensityProvider>{children}</DensityProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DensityProvider + useDensity', () => {
  it('returns comfortable density by default', () => {
    const { result } = renderHook(() => useDensity(), { wrapper });
    expect(result.current.density).toBe('comfortable');
  });

  it('returns compact when config has compact', () => {
    mockConfig = { chat: { density: 'compact' } };
    const { result } = renderHook(() => useDensity(), { wrapper });
    expect(result.current.density).toBe('compact');
  });

  it('falls back to comfortable when config is null', () => {
    mockConfig = null;
    const { result } = renderHook(() => useDensity(), { wrapper });
    expect(result.current.density).toBe('comfortable');
  });

  it('calls set with updated density', () => {
    mockConfig = { chat: { density: 'comfortable' } };
    const { result } = renderHook(() => useDensity(), { wrapper });
    act(() => {
      result.current.setDensity('compact');
    });
    expect(mockSet).toHaveBeenCalledWith('chat', { density: 'compact' });
  });

  it('throws when used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useDensity())).toThrow(
      'useDensity must be used inside <DensityProvider>',
    );
    consoleSpy.mockRestore();
  });
});
