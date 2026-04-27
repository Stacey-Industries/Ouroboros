/**
 * @vitest-environment jsdom
 *
 * Tests that approvalCount correctly drives utility-drawer auto-open and that
 * dismissal-keying prevents re-open on the same count value.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkbenchSurfacePolicy } from './useWorkbenchSurfacePolicy';

function makeOpts(overrides: Partial<Parameters<typeof useWorkbenchSurfacePolicy>[0]> = {}) {
  return {
    approvalCount: 0,
    diffKey: null,
    artifactKey: null,
    artifactKind: 'empty' as const,
    setArtifactOpen: vi.fn(),
    setUtilityOpen: vi.fn(),
    setActiveUtilityTab: vi.fn(),
    ...overrides,
  };
}

describe('useWorkbenchSurfacePolicy — approvalCount wiring', () => {
  beforeEach(() => {
    // Silence jsdom window.addEventListener noise from other effects
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens utility drawer to approvals tab when count transitions 0 → 1', () => {
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();
    const opts = makeOpts({ setUtilityOpen, setActiveUtilityTab });

    const { rerender } = renderHook((props) => useWorkbenchSurfacePolicy(props), {
      initialProps: opts,
    });

    // Count 0 — no call
    expect(setUtilityOpen).not.toHaveBeenCalled();

    // Transition to 1 — should open
    act(() => {
      rerender(makeOpts({ approvalCount: 1, setUtilityOpen, setActiveUtilityTab }));
    });

    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('approvals');
  });

  it('does not re-open after user dismisses with same approval count', () => {
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();
    const opts = makeOpts({ approvalCount: 1, setUtilityOpen, setActiveUtilityTab });

    const { result, rerender } = renderHook((props) => useWorkbenchSurfacePolicy(props), {
      initialProps: opts,
    });

    // First open fires
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    setUtilityOpen.mockClear();
    setActiveUtilityTab.mockClear();

    // User dismisses
    act(() => {
      result.current.closeUtility();
    });

    // Count stays the same — no re-open
    act(() => {
      rerender(makeOpts({ approvalCount: 1, setUtilityOpen, setActiveUtilityTab }));
    });

    expect(setUtilityOpen).not.toHaveBeenCalledWith(true);
  });

  it('re-opens when approval count increases to a new value after dismiss', () => {
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();

    const { result, rerender } = renderHook((props) => useWorkbenchSurfacePolicy(props), {
      initialProps: makeOpts({ approvalCount: 1, setUtilityOpen, setActiveUtilityTab }),
    });

    // Initial open
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    setUtilityOpen.mockClear();

    // User dismisses
    act(() => {
      result.current.closeUtility();
    });

    // New approval arrives — count changes to 2, key changes, should re-open
    act(() => {
      rerender(makeOpts({ approvalCount: 2, setUtilityOpen, setActiveUtilityTab }));
    });

    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('approvals');
  });
});
