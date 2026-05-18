// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useOwnedSessionIds } from './useOwnedSessionIds';

vi.mock('./useTerminalSessions', () => ({
  useTerminalSessions: vi.fn(),
}));

import { useTerminalSessions } from './useTerminalSessions';

const mockUseTerminalSessions = vi.mocked(useTerminalSessions);

describe('useOwnedSessionIds', () => {
  it('returns set of claudeSessionIds for sessions that have one', () => {
    mockUseTerminalSessions.mockReturnValue({
      sessions: [
        { id: 'pty-1', claudeSessionId: 'claude-abc' },
        { id: 'pty-2', claudeSessionId: 'claude-def' },
      ],
    } as ReturnType<typeof useTerminalSessions>);

    const { result } = renderHook(() => useOwnedSessionIds());

    expect(result.current.has('claude-abc')).toBe(true);
    expect(result.current.has('claude-def')).toBe(true);
    expect(result.current.size).toBe(2);
  });

  it('excludes sessions with no claudeSessionId', () => {
    mockUseTerminalSessions.mockReturnValue({
      sessions: [
        { id: 'pty-1', claudeSessionId: undefined },
        { id: 'pty-2', claudeSessionId: 'claude-xyz' },
      ],
    } as ReturnType<typeof useTerminalSessions>);

    const { result } = renderHook(() => useOwnedSessionIds());

    expect(result.current.has('claude-xyz')).toBe(true);
    expect(result.current.size).toBe(1);
  });

  it('returns empty set when no sessions exist', () => {
    mockUseTerminalSessions.mockReturnValue({
      sessions: [],
    } as ReturnType<typeof useTerminalSessions>);

    const { result } = renderHook(() => useOwnedSessionIds());

    expect(result.current.size).toBe(0);
  });
});
