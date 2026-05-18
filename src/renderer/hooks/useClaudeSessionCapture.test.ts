// @vitest-environment jsdom
/**
 * useClaudeSessionCapture.test.ts — unit tests for the claudeSessionId binding logic
 * inside useClaudeSessionCapture (useTerminalSessions.sync.ts).
 *
 * Uses renderHook + a fake electronAPI to exercise the onAgentEvent callback
 * without importing the real preload bridge.
 */

import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';

// ── Mock electronAPI ──────────────────────────────────────────────────────────

type AgentEventCallback = (event: unknown) => void;
let capturedCallback: AgentEventCallback | null = null;

vi.mock('./useTerminalSessions.effects', () => ({
  hasElectronAPI: () => true,
  serializeSavedSessionSnapshots: vi.fn(() => '[]'),
}));

// Patch window.electronAPI before the hook module loads
const cleanupFn = vi.fn(() => undefined);
Object.defineProperty(globalThis, 'window', {
  value: {
    electronAPI: {
      hooks: {
        onAgentEvent: (cb: AgentEventCallback) => {
          capturedCallback = cb;
          return cleanupFn;
        },
      },
    },
  },
  writable: true,
});

import { useClaudeSessionCapture } from './useTerminalSessions.sync';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'pty-1',
    title: 'Terminal 1',
    status: 'running',
    isClaude: false,
    claudeSessionId: undefined,
    ...overrides,
  } as TerminalSession;
}

function emitSessionStart(sessionId: string): void {
  capturedCallback?.({ type: 'session_start', sessionId });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useClaudeSessionCapture', () => {
  beforeEach(() => {
    capturedCallback = null;
    cleanupFn.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('binds claudeSessionId to the pending PTY when pendingRef has an entry', () => {
    const initialSessions = [makeSession({ id: 'pty-1' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>(['pty-1']);
      useClaudeSessionCapture(pendingRef, setSessions, null);
      return sessions;
    });

    act(() => {
      emitSessionStart('claude-uuid-111');
    });

    expect(result.current[0].claudeSessionId).toBe('claude-uuid-111');
  });

  it('binds claudeSessionId to the active terminal when pendingRef is empty (terminal-launched fallback)', () => {
    const initialSessions = [makeSession({ id: 'pty-active' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]); // empty — no IDE-spawned association
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-active');
      return sessions;
    });

    act(() => {
      emitSessionStart('claude-uuid-terminal');
    });

    expect(result.current[0].claudeSessionId).toBe('claude-uuid-terminal');
  });

  it('does not bind when pendingRef is empty and activeSessionId is null', () => {
    const initialSessions = [makeSession({ id: 'pty-1' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, null);
      return sessions;
    });

    act(() => {
      emitSessionStart('claude-uuid-orphan');
    });

    expect(result.current[0].claudeSessionId).toBeUndefined();
  });

  it('rebinds the active terminal when a different claudeSessionId arrives (Bug D)', () => {
    // Bug D fix: when a NEW Claude UUID arrives in an already-bound active
    // terminal (because the previous Claude session ended and a new one was
    // launched), the binding must follow reality and replace the stale UUID.
    // Bind-once-per-UUID is preserved (see SKIP_SAME_ID test below); the
    // rebind path opens only when the incoming UUID differs.
    const initialSessions = [makeSession({ id: 'pty-1', claudeSessionId: 'stale-uuid' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-1');
      return sessions;
    });

    act(() => {
      emitSessionStart('new-uuid');
    });

    expect(result.current[0].claudeSessionId).toBe('new-uuid');
  });

  it('prefers pending association over active-terminal fallback when both are present', () => {
    const initialSessions = [makeSession({ id: 'pty-pending' }), makeSession({ id: 'pty-active' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>(['pty-pending']);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-active');
      return sessions;
    });

    act(() => {
      emitSessionStart('claude-uuid-for-pending');
    });

    const pending = result.current.find((s) => s.id === 'pty-pending');
    const active = result.current.find((s) => s.id === 'pty-active');
    expect(pending?.claudeSessionId).toBe('claude-uuid-for-pending');
    expect(active?.claudeSessionId).toBeUndefined();
  });

  it('ignores events not in the bind-trigger set (e.g. tool_use)', () => {
    const initialSessions = [makeSession({ id: 'pty-1' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-1');
      return sessions;
    });

    act(() => {
      capturedCallback?.({ type: 'tool_use', sessionId: 'some-uuid' });
    });

    expect(result.current[0].claudeSessionId).toBeUndefined();
  });

  it('binds on pre_tool_use when no session_start arrived first (terminal-launched fallback)', () => {
    // Bug B regression: terminal-launched claude may emit pre_tool_use before
    // session_start, or session_start may not fire at all. The heuristic must
    // bind on the first recognised trigger event, not only session_start.
    const initialSessions = [makeSession({ id: 'pty-active' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-active');
      return sessions;
    });

    act(() => {
      capturedCallback?.({ type: 'pre_tool_use', sessionId: 'claude-uuid-terminal-edit' });
    });

    expect(result.current[0].claudeSessionId).toBe('claude-uuid-terminal-edit');
  });

  it('does not re-bind when multiple events arrive for the SAME claudeSessionId', () => {
    // Bug D contract: bind-once-per-UUID. Same-UUID events are idempotent
    // (SKIP_SAME_ID) and do not re-fire setState. Replacement only happens
    // when the incoming UUID differs from the existing binding.
    const initialSessions = [makeSession({ id: 'pty-active' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-active');
      return sessions;
    });

    act(() => {
      capturedCallback?.({ type: 'pre_tool_use', sessionId: 'uuid-stable' });
    });
    expect(result.current[0].claudeSessionId).toBe('uuid-stable');

    act(() => {
      capturedCallback?.({ type: 'post_tool_use', sessionId: 'uuid-stable' });
    });
    expect(result.current[0].claudeSessionId).toBe('uuid-stable');
  });
});
