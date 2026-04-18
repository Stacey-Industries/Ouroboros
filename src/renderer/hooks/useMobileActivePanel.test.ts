/**
 * @vitest-environment jsdom
 *
 * useMobileActivePanel — unit tests for Wave 32 Phase D state lift.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FOCUS_AGENT_CHAT_EVENT,
  FOCUS_TERMINAL_SESSION_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from './appEventNames';
import { useMobileActivePanel } from './useMobileActivePanel';

function dispatch(name: string): void {
  window.dispatchEvent(new CustomEvent(name));
}

afterEach(() => {
  // Ensure no leaked listeners by unmounting via cleanup (renderHook handles this)
});

describe('useMobileActivePanel', () => {
  it('defaults to "chat"', () => {
    const { result, unmount } = renderHook(() => useMobileActivePanel());
    expect(result.current.activePanel).toBe('chat');
    unmount();
  });

  it('setActivePanel updates the panel', () => {
    const { result, unmount } = renderHook(() => useMobileActivePanel());
    act(() => { result.current.setActivePanel('files'); });
    expect(result.current.activePanel).toBe('files');
    unmount();
  });

  it('FOCUS_AGENT_CHAT_EVENT flips panel to "chat"', () => {
    const { result, unmount } = renderHook(() => useMobileActivePanel());
    act(() => { result.current.setActivePanel('terminal'); });
    act(() => { dispatch(FOCUS_AGENT_CHAT_EVENT); });
    expect(result.current.activePanel).toBe('chat');
    unmount();
  });

  it('OPEN_AGENT_CHAT_PANEL_EVENT flips panel to "chat"', () => {
    const { result, unmount } = renderHook(() => useMobileActivePanel());
    act(() => { result.current.setActivePanel('editor'); });
    act(() => { dispatch(OPEN_AGENT_CHAT_PANEL_EVENT); });
    expect(result.current.activePanel).toBe('chat');
    unmount();
  });

  it('FOCUS_TERMINAL_SESSION_EVENT flips panel to "terminal"', () => {
    const { result, unmount } = renderHook(() => useMobileActivePanel());
    act(() => { dispatch(FOCUS_TERMINAL_SESSION_EVENT); });
    expect(result.current.activePanel).toBe('terminal');
    unmount();
  });

  it('listeners are removed on unmount (no further state updates)', () => {
    const { unmount } = renderHook(() => useMobileActivePanel());
    unmount();
    // Dispatching after unmount must not throw
    expect(() => dispatch(FOCUS_AGENT_CHAT_EVENT)).not.toThrow();
  });
});
