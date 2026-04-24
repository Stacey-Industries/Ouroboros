/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_SUBAGENT_PANEL_EVENT } from '../../../hooks/appEventNames';
import { useWorkbenchSurfacePolicy } from './useWorkbenchSurfacePolicy';

describe('useWorkbenchSurfacePolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens artifact surfaces for new keys and suppresses same-key reopen after close', () => {
    const setArtifactOpen = vi.fn();
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();

    const { result, rerender } = renderHook(
      (props: { artifactKey: string | null; artifactKind: 'empty' | 'file' | 'diff' }) =>
        useWorkbenchSurfacePolicy({
          approvalCount: 0,
          diffKey: null,
          artifactKey: props.artifactKey,
          artifactKind: props.artifactKind,
          setArtifactOpen,
          setUtilityOpen,
          setActiveUtilityTab,
        }),
      {
        initialProps: { artifactKey: null, artifactKind: 'empty' as const },
      },
    );

    rerender({ artifactKey: 'file:/tmp/a.ts', artifactKind: 'file' });
    expect(setArtifactOpen).toHaveBeenCalledWith(true);

    act(() => {
      result.current.closeArtifact();
    });
    expect(setArtifactOpen).toHaveBeenLastCalledWith(false);
    setArtifactOpen.mockClear();

    rerender({ artifactKey: null, artifactKind: 'empty' });
    rerender({ artifactKey: 'file:/tmp/a.ts', artifactKind: 'file' });
    expect(setArtifactOpen).not.toHaveBeenCalled();

    rerender({ artifactKey: 'file:/tmp/b.ts', artifactKind: 'file' });
    expect(setArtifactOpen).toHaveBeenCalledWith(true);
  });

  it('opens approvals and only reopens when a new approval key arrives after dismissal', () => {
    const setArtifactOpen = vi.fn();
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();

    const { result, rerender } = renderHook(
      (approvalCount: number) =>
        useWorkbenchSurfacePolicy({
          approvalCount,
          diffKey: null,
          artifactKey: null,
          artifactKind: 'empty',
          setArtifactOpen,
          setUtilityOpen,
          setActiveUtilityTab,
        }),
      {
        initialProps: 0,
      },
    );

    rerender(1);
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('approvals');

    act(() => {
      result.current.closeUtility();
    });
    expect(setUtilityOpen).toHaveBeenLastCalledWith(false);
    setUtilityOpen.mockClear();
    setActiveUtilityTab.mockClear();

    rerender(0);
    rerender(1);
    expect(setUtilityOpen).not.toHaveBeenCalled();

    rerender(2);
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('approvals');
  });

  it('opens review on new diff keys', () => {
    const setArtifactOpen = vi.fn();
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();

    const { rerender } = renderHook(
      (diffKey: string | null) =>
        useWorkbenchSurfacePolicy({
          approvalCount: 0,
          diffKey,
          artifactKey: null,
          artifactKind: 'empty',
          setArtifactOpen,
          setUtilityOpen,
          setActiveUtilityTab,
        }),
      {
        initialProps: null,
      },
    );

    rerender('session-1:hash-a');
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('review');
  });

  it('opens subagents on event and suppresses the same tool call after close', () => {
    const setArtifactOpen = vi.fn();
    const setUtilityOpen = vi.fn();
    const setActiveUtilityTab = vi.fn();

    const { result } = renderHook(() =>
      useWorkbenchSurfacePolicy({
        approvalCount: 0,
        diffKey: null,
        artifactKey: null,
        artifactKind: 'empty',
        setArtifactOpen,
        setUtilityOpen,
        setActiveUtilityTab,
      }),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-1' } }),
      );
    });
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('subagents');

    act(() => {
      result.current.closeUtility();
    });
    setUtilityOpen.mockClear();
    setActiveUtilityTab.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-1' } }),
      );
    });
    expect(setUtilityOpen).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(OPEN_SUBAGENT_PANEL_EVENT, { detail: { toolCallId: 'tool-2' } }),
      );
    });
    expect(setUtilityOpen).toHaveBeenCalledWith(true);
    expect(setActiveUtilityTab).toHaveBeenCalledWith('subagents');
  });
});
