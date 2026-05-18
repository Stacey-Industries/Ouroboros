/**
 * @vitest-environment jsdom
 *
 * useProjectTerminals.test.tsx — Wave 94 Phase B
 *
 * Contracts verified:
 *  (a) null activeProjectPath → both slot handles are EMPTY_SLOT_HANDLE shape.
 *  (b) Valid activeProjectPath → primary/secondary have session lists from
 *      the global terminal pool filtered to slot membership.
 *  (c) Project switch swaps slot contents atomically — sessions for project A
 *      are hidden when project B is active.
 *  (d) Cold-boot restore: persisted sessions reappear on mount.
 *  (e) setActiveSessionId on a slot updates the activeSessionPerSlot patch.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectTerminals } from './useProjectTerminals';

// ---------------------------------------------------------------------------
// Mock useTerminalSessions
// ---------------------------------------------------------------------------

const mockTerminal = {
  sessions: [] as Array<{ id: string; title: string; isClaude?: boolean; status: string }>,
  activeSessionId: null as string | null,
  setActiveSessionId: vi.fn(),
  recordingSessions: new Set<string>(),
  spawnSession: vi.fn().mockResolvedValue(undefined),
  spawnClaudeSession: vi.fn().mockResolvedValue(undefined),
  spawnCodexSession: vi.fn().mockResolvedValue(undefined),
  handleTerminalClose: vi.fn(),
  handleTerminalRestart: vi.fn().mockResolvedValue(undefined),
  handleTerminalTitleChange: vi.fn(),
  handleToggleRecording: vi.fn().mockResolvedValue(undefined),
  handleSplit: vi.fn().mockResolvedValue(undefined),
  handleCloseSplit: vi.fn(),
  handleTerminalReorder: vi.fn(),
  focusOrCreateSession: vi.fn(),
};

vi.mock('./useTerminalSessions', () => ({
  useTerminalSessions: () => mockTerminal,
}));

// ---------------------------------------------------------------------------
// Mock electronAPI
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockSet = vi.fn();

beforeEach(() => {
  mockGet.mockResolvedValue({});
  mockSet.mockResolvedValue(undefined);
  Object.defineProperty(window, 'electronAPI', {
    value: { config: { get: mockGet, set: mockSet } },
    writable: true,
    configurable: true,
  });
  mockTerminal.sessions = [];
  mockTerminal.activeSessionId = null;
  vi.clearAllMocks();
  mockGet.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProjectTerminals', () => {
  it('(a) returns empty slot handles when activeProjectPath is null', () => {
    const { result } = renderHook(() => useProjectTerminals(null));
    expect(result.current.primary.sessions).toEqual([]);
    expect(result.current.primary.activeSessionId).toBeNull();
    expect(result.current.secondary.sessions).toEqual([]);
    expect(result.current.secondary.activeSessionId).toBeNull();
  });

  it('(b) primary slot shows sessions assigned to primary; secondary shows its own', async () => {
    mockTerminal.sessions = [
      { id: 's1', title: 'bash', isClaude: false, status: 'running' },
      { id: 's2', title: 'node', isClaude: false, status: 'running' },
    ];
    mockGet.mockResolvedValue({
      '/proj/a': {
        primary: [{ id: 's1', title: 'bash', isClaude: false }],
        secondary: [{ id: 's2', title: 'node', isClaude: false }],
        activeSessionPerSlot: { primary: 's1', secondary: 's2' },
      },
    });

    const { result } = renderHook(() => useProjectTerminals('/proj/a'));
    await waitFor(() => {
      expect(result.current.primary.sessions).toHaveLength(1);
    });
    expect(result.current.primary.sessions[0].id).toBe('s1');
    expect(result.current.secondary.sessions[0].id).toBe('s2');
    expect(result.current.primary.activeSessionId).toBe('s1');
    expect(result.current.secondary.activeSessionId).toBe('s2');
  });

  it('(c) project switch hides project-A sessions when project-B is active', async () => {
    mockTerminal.sessions = [
      { id: 'a1', title: 'bash-a', isClaude: false, status: 'running' },
      { id: 'b1', title: 'bash-b', isClaude: false, status: 'running' },
    ];
    mockGet.mockResolvedValue({
      '/proj/a': {
        primary: [{ id: 'a1', title: 'bash-a', isClaude: false }],
        secondary: [],
        activeSessionPerSlot: { primary: 'a1', secondary: null },
      },
      '/proj/b': {
        primary: [{ id: 'b1', title: 'bash-b', isClaude: false }],
        secondary: [],
        activeSessionPerSlot: { primary: 'b1', secondary: null },
      },
    });

    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useProjectTerminals(path),
      { initialProps: { path: '/proj/a' } },
    );
    await waitFor(() => expect(result.current.primary.sessions).toHaveLength(1));
    expect(result.current.primary.sessions[0].id).toBe('a1');

    rerender({ path: '/proj/b' });
    await waitFor(() => expect(result.current.primary.sessions[0].id).toBe('b1'));
    // Project A's session is not in the primary slot for project B.
    expect(result.current.primary.sessions.find((s) => s.id === 'a1')).toBeUndefined();
  });

  it('(d) cold-boot restore: persisted sessions appear on initial render', async () => {
    mockTerminal.sessions = [{ id: 'r1', title: 'restored', isClaude: false, status: 'running' }];
    mockGet.mockResolvedValue({
      '/proj/restore': {
        primary: [{ id: 'r1', title: 'restored', isClaude: false }],
        secondary: [],
        activeSessionPerSlot: { primary: 'r1', secondary: null },
      },
    });

    const { result } = renderHook(() => useProjectTerminals('/proj/restore'));
    await waitFor(() => expect(result.current.primary.sessions).toHaveLength(1));
    expect(result.current.primary.sessions[0].id).toBe('r1');
    expect(result.current.primary.activeSessionId).toBe('r1');
  });

  it('(e) setActiveSessionId on primary slot updates the active session', async () => {
    mockTerminal.sessions = [
      { id: 'x1', title: 'bash', isClaude: false, status: 'running' },
      { id: 'x2', title: 'node', isClaude: false, status: 'running' },
    ];
    mockGet.mockResolvedValue({
      '/proj/e': {
        primary: [
          { id: 'x1', title: 'bash', isClaude: false },
          { id: 'x2', title: 'node', isClaude: false },
        ],
        secondary: [],
        activeSessionPerSlot: { primary: 'x1', secondary: null },
      },
    });

    const { result } = renderHook(() => useProjectTerminals('/proj/e'));
    await waitFor(() => expect(result.current.primary.activeSessionId).toBe('x1'));

    act(() => {
      result.current.primary.setActiveSessionId('x2');
    });

    expect(result.current.primary.activeSessionId).toBe('x2');
    expect(mockTerminal.setActiveSessionId).toHaveBeenCalledWith('x2');
  });

  it('activeSessionId is null when stored active ID is not in slot membership', async () => {
    mockTerminal.sessions = [{ id: 'y1', title: 'bash', isClaude: false, status: 'running' }];
    mockGet.mockResolvedValue({
      '/proj/f': {
        primary: [{ id: 'y1', title: 'bash', isClaude: false }],
        secondary: [],
        // 'gone' is not in the primary session list
        activeSessionPerSlot: { primary: 'gone', secondary: null },
      },
    });

    const { result } = renderHook(() => useProjectTerminals('/proj/f'));
    await waitFor(() => expect(result.current.primary.sessions).toHaveLength(1));
    expect(result.current.primary.activeSessionId).toBeNull();
  });
});
