/**
 * @vitest-environment jsdom
 *
 * chatHistorySidebarCompletions — useCompletionIndicators smoke tests.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { useCompletionIndicators } from './chatHistorySidebarCompletions';

const STORAGE_KEY = 'agent-chat:thread-completion-seen';

function thread(
  id: string,
  status: AgentChatThreadRecord['status'],
  updatedAt: number,
): AgentChatThreadRecord {
  return {
    id,
    title: id,
    workspaceRoot: '/tmp',
    status,
    createdAt: 0,
    updatedAt,
  } as unknown as AgentChatThreadRecord;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useCompletionIndicators', () => {
  it('returns "none" for non-completed threads', () => {
    const threads = [thread('a', 'running', 100)];
    const { result } = renderHook(() => useCompletionIndicators(threads, null));
    expect(result.current.a).toBe('none');
  });

  it('returns "unseen" for completed threads not yet activated', () => {
    const threads = [thread('a', 'complete', 100)];
    const { result } = renderHook(() => useCompletionIndicators(threads, null));
    expect(result.current.a).toBe('unseen');
  });

  it('marks completed thread as "seen" once it becomes active', () => {
    const threads = [thread('a', 'complete', 100)];
    const { result, rerender } = renderHook(
      ({ activeId }: { activeId: string | null }) => useCompletionIndicators(threads, activeId),
      { initialProps: { activeId: null as string | null } },
    );
    expect(result.current.a).toBe('unseen');
    act(() => {
      rerender({ activeId: 'a' });
    });
    expect(result.current.a).toBe('seen');
  });

  it('persists seen completions across mount cycles', () => {
    const threads = [thread('a', 'complete', 100)];
    const first = renderHook(() => useCompletionIndicators(threads, 'a'));
    expect(first.result.current.a).toBe('seen');
    first.unmount();

    const second = renderHook(() => useCompletionIndicators(threads, null));
    expect(second.result.current.a).toBe('seen');
  });

  it('re-marks as "unseen" when thread updates after last seen', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 50 }));
    const threads = [thread('a', 'complete', 100)];
    const { result } = renderHook(() => useCompletionIndicators(threads, null));
    expect(result.current.a).toBe('unseen');
  });

  it('treats cancelled / failed / needs_review as completed', () => {
    const threads = [
      thread('a', 'cancelled', 100),
      thread('b', 'failed', 100),
      thread('c', 'needs_review', 100),
    ];
    const { result } = renderHook(() => useCompletionIndicators(threads, null));
    expect(result.current.a).toBe('unseen');
    expect(result.current.b).toBe('unseen');
    expect(result.current.c).toBe('unseen');
  });

  it('survives malformed localStorage payload', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    const threads = [thread('a', 'complete', 100)];
    const { result } = renderHook(() => useCompletionIndicators(threads, null));
    expect(result.current.a).toBe('unseen');
  });
});
