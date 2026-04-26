/**
 * @vitest-environment jsdom
 *
 * Smoke tests for CentrePaneConnected.wiring — verifies each hook registers
 * the correct DOM event listener and calls the right callback.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GRAPH_PANEL_EVENT,
  SPECIAL_VIEW_EVENTS,
  useDiffReviewEvents,
  useFileTabClicksSwitchToEditor,
  useGlobalReviewEvents,
  useGraphPanelEvent,
  useSessionReplayEvents,
  useSpecialViewEvents,
} from './CentrePaneConnected.wiring';

afterEach(() => {
  vi.clearAllMocks();
});

// ─── SPECIAL_VIEW_EVENTS constant ────────────────────────────────────────────

describe('SPECIAL_VIEW_EVENTS', () => {
  it('contains at least 7 entries', () => {
    expect(SPECIAL_VIEW_EVENTS.length).toBeGreaterThanOrEqual(7);
  });

  it('maps settings event to "settings" view', () => {
    const entry = SPECIAL_VIEW_EVENTS.find(([, view]) => view === 'settings');
    expect(entry).toBeDefined();
  });
});

// ─── useDiffReviewEvents ─────────────────────────────────────────────────────

describe('useDiffReviewEvents', () => {
  it('calls openReview when agent-ide:diff-review-open fires with detail', () => {
    const openReview = vi.fn();
    const setReplaySession = vi.fn();
    const setActiveView = vi.fn();

    renderHook(() => useDiffReviewEvents(openReview, setReplaySession, setActiveView));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:diff-review-open', {
          detail: {
            sessionId: 's1',
            snapshotHash: 'abc',
            projectRoot: '/proj',
            filePaths: ['a.ts'],
          },
        }),
      );
    });

    expect(setReplaySession).toHaveBeenCalledWith(null);
    expect(setActiveView).toHaveBeenCalledWith('editor');
    expect(openReview).toHaveBeenCalledWith('s1', 'abc', '/proj', ['a.ts']);
  });

  it('does not call openReview when detail is absent', () => {
    const openReview = vi.fn();
    renderHook(() => useDiffReviewEvents(openReview, vi.fn(), vi.fn()));
    act(() => {
      window.dispatchEvent(new CustomEvent('agent-ide:diff-review-open', { detail: null }));
    });
    expect(openReview).not.toHaveBeenCalled();
  });
});

// ─── useSessionReplayEvents ───────────────────────────────────────────────────

describe('useSessionReplayEvents', () => {
  it('calls setReplaySession when agent-ide:open-session-replay fires with session', () => {
    const closeReview = vi.fn();
    const setReplaySession = vi.fn();
    const setActiveView = vi.fn();
    const session = { id: 'sess-1' };

    renderHook(() => useSessionReplayEvents(closeReview, setReplaySession, setActiveView));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-session-replay', { detail: { session } }),
      );
    });

    expect(closeReview).toHaveBeenCalled();
    expect(setActiveView).toHaveBeenCalledWith('editor');
    expect(setReplaySession).toHaveBeenCalledWith(session);
  });

  it('does not call setReplaySession when detail has no session', () => {
    const setReplaySession = vi.fn();
    renderHook(() => useSessionReplayEvents(vi.fn(), setReplaySession, vi.fn()));
    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-session-replay', { detail: { session: null } }),
      );
    });
    expect(setReplaySession).not.toHaveBeenCalled();
  });
});

// ─── useSpecialViewEvents ─────────────────────────────────────────────────────

describe('useSpecialViewEvents', () => {
  it('calls openAndActivate with correct view when a mapped event fires', () => {
    const openAndActivate = vi.fn();
    renderHook(() => useSpecialViewEvents(openAndActivate));

    const [eventName, expectedView] = SPECIAL_VIEW_EVENTS[0];
    act(() => {
      window.dispatchEvent(new CustomEvent(eventName));
    });

    expect(openAndActivate).toHaveBeenCalledWith(expectedView);
  });

  it('removes listeners on unmount', () => {
    const openAndActivate = vi.fn();
    const { unmount } = renderHook(() => useSpecialViewEvents(openAndActivate));
    unmount();

    const [eventName] = SPECIAL_VIEW_EVENTS[0];
    act(() => {
      window.dispatchEvent(new CustomEvent(eventName));
    });
    expect(openAndActivate).not.toHaveBeenCalled();
  });
});

// ─── useGraphPanelEvent ───────────────────────────────────────────────────────

describe('useGraphPanelEvent', () => {
  it('calls openAndActivate("graph-panel") when enabled and event fires', () => {
    const openAndActivate = vi.fn();
    renderHook(() => useGraphPanelEvent(openAndActivate, true));

    act(() => {
      window.dispatchEvent(new CustomEvent(GRAPH_PANEL_EVENT));
    });

    expect(openAndActivate).toHaveBeenCalledWith('graph-panel');
  });

  it('does not attach listener when disabled', () => {
    const openAndActivate = vi.fn();
    renderHook(() => useGraphPanelEvent(openAndActivate, false));

    act(() => {
      window.dispatchEvent(new CustomEvent(GRAPH_PANEL_EVENT));
    });

    expect(openAndActivate).not.toHaveBeenCalled();
  });
});

// ─── useFileTabClicksSwitchToEditor ───────────────────────────────────────────

describe('useFileTabClicksSwitchToEditor', () => {
  it('calls setActiveView("editor") on the file-tab-clicked event', () => {
    const setActiveView = vi.fn();
    renderHook(() => useFileTabClicksSwitchToEditor(setActiveView));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:file-tab-clicked-while-special-view'),
      );
    });

    expect(setActiveView).toHaveBeenCalledWith('editor');
  });
});

// ─── useGlobalReviewEvents ────────────────────────────────────────────────────

describe('useGlobalReviewEvents', () => {
  it('calls openReview for review-all-changes with HEAD', () => {
    const openReview = vi.fn();
    const setReplaySession = vi.fn();
    const setActiveView = vi.fn();
    renderHook(() =>
      useGlobalReviewEvents(openReview, '/root', setReplaySession, setActiveView),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('agent-ide:review-all-changes'));
    });

    expect(openReview).toHaveBeenCalledWith('global-review', 'HEAD', '/root');
  });

  it('calls openReview for review-unstaged-changes with INDEX', () => {
    const openReview = vi.fn();
    renderHook(() => useGlobalReviewEvents(openReview, '/root', vi.fn(), vi.fn()));

    act(() => {
      window.dispatchEvent(new CustomEvent('agent-ide:review-unstaged-changes'));
    });

    expect(openReview).toHaveBeenCalledWith('global-review-unstaged', 'INDEX', '/root');
  });

  it('does not call openReview when projectRoot is null', () => {
    const openReview = vi.fn();
    renderHook(() => useGlobalReviewEvents(openReview, null, vi.fn(), vi.fn()));

    act(() => {
      window.dispatchEvent(new CustomEvent('agent-ide:review-all-changes'));
    });

    expect(openReview).not.toHaveBeenCalled();
  });
});
