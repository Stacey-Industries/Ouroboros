/**
 * @vitest-environment jsdom
 *
 * useChatSessionRegistration.test.ts — Wave 64 smoke tests.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useChatSessionRegistration } from './useChatSessionRegistration';

describe('useChatSessionRegistration', () => {
  it('returns a stable callback that dispatches SESSION_REGISTER with kind=chat', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useChatSessionRegistration(dispatch));

    result.current({ sessionId: 'sess-1', cwd: 'C:\\foo', taskLabel: 'turn 1' });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('SESSION_REGISTER');
    expect(action.kind).toBe('chat');
    expect(action.sessionId).toBe('sess-1');
    expect(action.cwd).toBe('C:\\foo');
    expect(action.taskLabel).toBe('turn 1');
    expect(typeof action.timestamp).toBe('number');
  });

  it('keeps the callback identity stable across renders when dispatch is stable', () => {
    const dispatch = vi.fn();
    const { result, rerender } = renderHook(() => useChatSessionRegistration(dispatch));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('omits cwd and taskLabel cleanly when not provided', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useChatSessionRegistration(dispatch));
    result.current({ sessionId: 'sess-2' });
    const action = dispatch.mock.calls[0][0];
    expect(action.cwd).toBeUndefined();
    expect(action.taskLabel).toBeUndefined();
  });
});
