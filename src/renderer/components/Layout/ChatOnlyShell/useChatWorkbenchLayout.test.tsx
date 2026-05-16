/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';

const STORAGE_KEY = 'agent-ide:chat-workbench-layout';

describe('useChatWorkbenchLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('returns the default layout state with rail open', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());

    expect(result.current.railOpen).toBe(true);
    expect(result.current.artifactOpen).toBe(false);
    expect(result.current.utilityOpen).toBe(false);
    expect(result.current.activeUtilityTab).toBe('activity');
    expect('terminalOpen' in result.current).toBe(false);
  });

  it('restores a persisted layout snapshot from localStorage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        railOpen: true,
        artifactOpen: true,
        utilityOpen: true,
        activeUtilityTab: 'review',
      }),
    );

    const { result } = renderHook(() => useChatWorkbenchLayout());

    expect(result.current.railOpen).toBe(true);
    expect(result.current.artifactOpen).toBe(true);
    expect(result.current.utilityOpen).toBe(true);
    expect(result.current.activeUtilityTab).toBe('review');
  });

  it('falls back to defaults when persisted state is corrupted', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json');

    const { result } = renderHook(() => useChatWorkbenchLayout());

    expect(result.current.railOpen).toBe(true);
    expect(result.current.artifactOpen).toBe(false);
    expect(result.current.utilityOpen).toBe(false);
    expect(result.current.activeUtilityTab).toBe('activity');
  });

  it('persists updates after toggle and setter changes', async () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());

    act(() => {
      result.current.toggleRail();
      // Wave 89 Phase 3: overlays are no longer mutually exclusive — both can be
      // open simultaneously (tile layout). Opening utility after artifact leaves
      // artifact open too.
      result.current.setArtifactOpen(true);
      result.current.setUtilityOpen(true);
      result.current.setActiveUtilityTab('monitor');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      railOpen: false,
      artifactOpen: true,
      utilityOpen: true,
      activeUtilityTab: 'monitor',
      lastRightPaneView: 'utility',
    });
  });

  it('opens the last-used right pane view via toggleRightPane', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    // Default lastRightPaneView is 'utility'
    act(() => result.current.toggleRightPane());
    expect(result.current.utilityOpen).toBe(true);
    expect(result.current.artifactOpen).toBe(false);
    expect(result.current.rightPaneOpen).toBe(true);
    expect(result.current.rightPaneView).toBe('utility');

    // Wave 89 Phase 3: setRightPaneView no longer closes the other pane.
    // It opens the requested pane and updates lastRightPaneView.
    act(() => result.current.setRightPaneView('artifact'));
    expect(result.current.artifactOpen).toBe(true);
    expect(result.current.rightPaneOpen).toBe(true);
    expect(result.current.rightPaneView).toBe('utility'); // utility still open, so still 'utility'

    // Close both explicitly, then toggle should re-open last view ('artifact').
    act(() => {
      result.current.setArtifactOpen(false);
      result.current.setUtilityOpen(false);
    });
    expect(result.current.rightPaneOpen).toBe(false);

    act(() => result.current.toggleRightPane());
    // lastRightPaneView is 'artifact', so toggle re-opens artifact
    expect(result.current.artifactOpen).toBe(true);
    expect(result.current.rightPaneView).toBe('artifact');
  });
});
