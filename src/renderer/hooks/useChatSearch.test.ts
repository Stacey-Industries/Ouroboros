/**
 * @vitest-environment jsdom
 *
 * useChatSearch — unit tests.
 *
 * Covers:
 *  - Returns empty matches when query is blank.
 *  - Matches by title.
 *  - Matches by message content with snippet extraction.
 *  - Matches by model name.
 *  - Matches by workspaceRoot.
 *  - Scope 'project' filters to active root only.
 *  - Scope 'all' includes all threads.
 *  - setQuery / setScope update results reactively.
 *  - selectThread delegates to onSelectThread from store.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../types/electron';

// ── Store mock ────────────────────────────────────────────────────────────────

let mockThreads: AgentChatThreadRecord[] = [];
const mockOnSelectThread = vi.fn();

vi.mock('../components/AgentChat/agentChatStore', () => ({
  useAgentChatStoreContext: (selector: (s: unknown) => unknown) =>
    selector({ threads: mockThreads, onSelectThread: mockOnSelectThread }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import { useChatSearch } from './useChatSearch';

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/workspace/alpha',
    createdAt: 1,
    updatedAt: 10,
    title: 'Default title',
    status: 'complete',
    messages: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useChatSearch', () => {
  it('returns empty matches when query is blank', () => {
    mockThreads = [makeThread({ title: 'Hello world' })];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    expect(result.current.matches).toHaveLength(0);
  });

  it('matches by title', () => {
    mockThreads = [makeThread({ title: 'Fix the login bug' })];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.setQuery('login'));
    expect(result.current.matches).toHaveLength(1);
    expect(result.current.matches[0].title).toBe('Fix the login bug');
  });

  it('matches by message content and returns a snippet', () => {
    mockThreads = [
      makeThread({
        title: 'Unrelated title',
        messages: [
          {
            id: 'msg-1',
            threadId: 'thread-1',
            role: 'assistant',
            content: 'You should refactor the authentication service',
            createdAt: 1,
          },
        ],
      }),
    ];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.setQuery('authentication'));
    expect(result.current.matches).toHaveLength(1);
    expect(result.current.matches[0].snippet).toContain('authentication');
  });

  it('matches by model name', () => {
    mockThreads = [
      makeThread({
        title: 'Some chat',
        latestOrchestration: { model: 'claude-opus-4-7' },
      }),
    ];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.setQuery('opus'));
    expect(result.current.matches).toHaveLength(1);
    expect(result.current.matches[0].model).toBe('claude-opus-4-7');
  });

  it('matches by workspaceRoot', () => {
    mockThreads = [makeThread({ workspaceRoot: '/workspace/special-project' })];
    const { result } = renderHook(() => useChatSearch(null));
    act(() => result.current.setQuery('special-project'));
    expect(result.current.matches).toHaveLength(1);
  });

  it('scope project filters to active projectRoot only', () => {
    mockThreads = [
      makeThread({ id: 'thread-a', title: 'Alpha chat', workspaceRoot: '/workspace/alpha' }),
      makeThread({ id: 'thread-b', title: 'Alpha chat', workspaceRoot: '/workspace/beta' }),
    ];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.setQuery('Alpha chat'));
    // default scope is 'project', so only the alpha root thread should match
    expect(result.current.matches.map((m) => m.threadId)).toEqual(['thread-a']);
  });

  it('scope all includes threads from all projects', () => {
    mockThreads = [
      makeThread({ id: 'thread-a', title: 'Shared title', workspaceRoot: '/workspace/alpha' }),
      makeThread({ id: 'thread-b', title: 'Shared title', workspaceRoot: '/workspace/beta' }),
    ];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => {
      result.current.setScope('all');
      result.current.setQuery('Shared title');
    });
    expect(result.current.matches).toHaveLength(2);
  });

  it('selectThread calls onSelectThread from the store', () => {
    mockThreads = [makeThread({ id: 'thread-x' })];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.selectThread('thread-x'));
    expect(mockOnSelectThread).toHaveBeenCalledWith('thread-x');
  });

  it('returns no matches for a query that does not match anything', () => {
    mockThreads = [makeThread({ title: 'Completely unrelated' })];
    const { result } = renderHook(() => useChatSearch('/workspace/alpha'));
    act(() => result.current.setQuery('xyzzy-no-match'));
    expect(result.current.matches).toHaveLength(0);
  });
});
