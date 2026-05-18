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

  it('does not overwrite an already-bound claudeSessionId in the terminal-launched path', () => {
    const initialSessions = [makeSession({ id: 'pty-1', claudeSessionId: 'already-bound' })];
    const { result } = renderHook(() => {
      const [sessions, setSessions] = useState<TerminalSession[]>(initialSessions);
      const pendingRef = useRef<string[]>([]);
      useClaudeSessionCapture(pendingRef, setSessions, 'pty-1');
      return sessions;
    });

    act(() => {
      emitSessionStart('new-uuid');
    });

    expect(result.current[0].claudeSessionId).toBe('already-bound');
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

  it('ignores non-session_start events', () => {
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
});
