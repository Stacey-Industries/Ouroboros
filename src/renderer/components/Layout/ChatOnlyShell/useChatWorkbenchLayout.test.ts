/**
 * @vitest-environment jsdom
 *
 * useChatWorkbenchLayout — tests for Wave 59 Phase B additions:
 *   - activeProject / setActiveProject
 *   - projectStates / setActiveInnerTab / getProjectState
 *
 * Core persistence tests live in useChatWorkbenchLayout.test.tsx (Wave 46).
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';

const STORAGE_KEY = 'agent-ide:chat-workbench-layout';

describe('useChatWorkbenchLayout — per-project state (Wave 59 Phase B)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('defaults activeProject to null', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    expect(result.current.activeProject).toBeNull();
  });

  it('defaults projectStates to empty object', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    expect(result.current.projectStates).toEqual({});
  });

  it('setActiveProject updates activeProject', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    act(() => {
      result.current.setActiveProject('/home/user/my-app');
    });
    expect(result.current.activeProject).toBe('/home/user/my-app');
  });

  it('getProjectState returns default for unknown project', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    const state = result.current.getProjectState('/unknown/path');
    expect(state.activeInnerTab).toBe('chats');
  });

  it('setActiveInnerTab persists tab for a specific project', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    act(() => {
      result.current.setActiveInnerTab('/home/user/my-app', 'terminals');
    });
    expect(result.current.getProjectState('/home/user/my-app').activeInnerTab).toBe('terminals');
  });

  it('different projects maintain independent inner tab state', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    act(() => {
      result.current.setActiveInnerTab('/proj/a', 'code');
      result.current.setActiveInnerTab('/proj/b', 'terminals');
    });
    expect(result.current.getProjectState('/proj/a').activeInnerTab).toBe('code');
    expect(result.current.getProjectState('/proj/b').activeInnerTab).toBe('terminals');
  });

  it('persists activeProject and projectStates to localStorage', async () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    act(() => {
      result.current.setActiveProject('/proj/a');
      result.current.setActiveInnerTab('/proj/a', 'code');
    });
    await waitFor(() => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw ?? '{}');
      expect(parsed.activeProject).toBe('/proj/a');
      expect(parsed.projectStates?.['/proj/a']?.activeInnerTab).toBe('code');
    });
  });

  it('restores activeProject and projectStates from localStorage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        railOpen: true,
        artifactOpen: false,
        utilityOpen: false,
        activeUtilityTab: 'activity',
        activeProject: '/restored/proj',
        projectStates: { '/restored/proj': { activeInnerTab: 'terminals' } },
      }),
    );
    const { result } = renderHook(() => useChatWorkbenchLayout());
    expect(result.current.activeProject).toBe('/restored/proj');
    expect(result.current.getProjectState('/restored/proj').activeInnerTab).toBe('terminals');
  });

  it('existing toggleRail API still works', () => {
    const { result } = renderHook(() => useChatWorkbenchLayout());
    expect(result.current.railOpen).toBe(true);
    act(() => {
      result.current.toggleRail();
    });
    expect(result.current.railOpen).toBe(false);
  });
});
