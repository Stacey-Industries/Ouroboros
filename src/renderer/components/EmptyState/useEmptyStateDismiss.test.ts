/**
 * useEmptyStateDismiss.test.ts — Wave 38 Phase C
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEmptyStateDismiss } from './useEmptyStateDismiss';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSet = vi.fn().mockResolvedValue(undefined);
let mockConfig: Record<string, unknown> | null = null;

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({ config: mockConfig, set: mockSet }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(dismissed: Record<string, boolean> = {}): Record<string, unknown> {
  return { platform: { dismissedEmptyStates: dismissed } };
}

afterEach(() => {
  vi.clearAllMocks();
  mockConfig = null;
});

// ---------------------------------------------------------------------------
// Tests — session-only dismiss (no dismissKey)
// ---------------------------------------------------------------------------

describe('useEmptyStateDismiss — session-only', () => {
  it('starts as not dismissed', () => {
    const { result } = renderHook(() => useEmptyStateDismiss({}));
    expect(result.current.isDismissed).toBe(false);
  });

  it('dismiss() sets isDismissed to true', () => {
    const { result } = renderHook(() => useEmptyStateDismiss({}));
    act(() => { result.current.dismiss(); });
    expect(result.current.isDismissed).toBe(true);
  });

  it('does not call config.set when no dismissKey', () => {
    const { result } = renderHook(() => useEmptyStateDismiss({}));
    act(() => { result.current.dismiss(); });
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — persistent dismiss (with dismissKey)
// ---------------------------------------------------------------------------

describe('useEmptyStateDismiss — persistent', () => {
  beforeEach(() => {
    mockConfig = null;
  });

  it('starts as not dismissed when config has no entry', () => {
    mockConfig = makeConfig({});
    const { result } = renderHook(() => useEmptyStateDismiss({ dismissKey: 'chat' }));
    expect(result.current.isDismissed).toBe(false);
  });

  it('starts as dismissed when config already has the key', () => {
    mockConfig = makeConfig({ chat: true });
    const { result } = renderHook(() => useEmptyStateDismiss({ dismissKey: 'chat' }));
    expect(result.current.isDismissed).toBe(true);
  });

  it('dismiss() calls config.set with the dismissKey set to true', () => {
    mockConfig = makeConfig({});
    const { result } = renderHook(() => useEmptyStateDismiss({ dismissKey: 'terminal' }));
    act(() => { result.current.dismiss(); });
    expect(mockSet).toHaveBeenCalledOnce();
    const [key, value] = mockSet.mock.calls[0] as [string, unknown];
    expect(key).toBe('platform');
    const platform = value as { dismissedEmptyStates: Record<string, boolean> };
    expect(platform.dismissedEmptyStates.terminal).toBe(true);
  });

  it('dismiss() preserves existing dismissed keys', () => {
    mockConfig = makeConfig({ fileTree: true });
    const { result } = renderHook(() => useEmptyStateDismiss({ dismissKey: 'chat' }));
    act(() => { result.current.dismiss(); });
    const [, value] = mockSet.mock.calls[0] as [string, unknown];
    const platform = value as { dismissedEmptyStates: Record<string, boolean> };
    expect(platform.dismissedEmptyStates.fileTree).toBe(true);
    expect(platform.dismissedEmptyStates.chat).toBe(true);
  });

  it('dismiss() sets local isDismissed true immediately', () => {
    mockConfig = makeConfig({});
    const { result } = renderHook(() => useEmptyStateDismiss({ dismissKey: 'chat' }));
    act(() => { result.current.dismiss(); });
    expect(result.current.isDismissed).toBe(true);
  });
});
