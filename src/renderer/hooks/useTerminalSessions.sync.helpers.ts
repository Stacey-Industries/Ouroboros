import type { MutableRefObject } from 'react';

import type { TerminalSession } from '../components/Terminal/TerminalTabs';

type SessionSetter = import('react').Dispatch<import('react').SetStateAction<TerminalSession[]>>;

export interface SavedSessionSnapshot {
  cwd: string;
  title: string;
  isClaude?: boolean;
  isCodex?: boolean;
  claudeSessionId?: string;
  codexThreadId?: string;
}

export interface PendingCodexCapture {
  ptyId: string;
  cwd: string;
  spawnedAt: number;
  retries: number;
}

const CODEX_CAPTURE_MAX_RETRIES = 3;

// ── Claude session capture helpers ────────────────────────────────────────────

// Events that indicate a Claude session is active in a terminal and should
// trigger the terminal-launched fallback bind. session_start is included but
// pre_tool_use / post_tool_use are the primary triggers when session_start is
// unreliable for terminal-launched claude.
export const TERMINAL_BIND_TRIGGER_TYPES = new Set([
  'session_start',
  'pre_tool_use',
  'post_tool_use',
  'user_prompt_submit',
  'session_stop',
]);

export function applyPendingBind(
  ptyId: string,
  claudeSessionId: string,
  setSessions: SessionSetter,
): void {
  setSessions((prev) =>
    prev.map((session) => (session.id === ptyId ? { ...session, claudeSessionId } : session)),
  );
}

export function applyTerminalFallbackBind(
  activeSessionId: string,
  claudeSessionId: string,
  setSessions: SessionSetter,
): void {
  setSessions((prev) => {
    const active = prev.find((s) => s.id === activeSessionId);
    const existingId = active?.claudeSessionId;
    // Same UUID already bound — idempotent, no state change.
    const alreadySameId = existingId === claudeSessionId;
    // Different UUID bound — rebind: the running Claude is whoever last sent a hook
    // event from this terminal context. The binding must follow reality.
    const decision = !active ? 'SKIP_NO_TERMINAL' : alreadySameId ? 'SKIP_SAME_ID' : 'BIND';
    if (decision !== 'BIND') return prev;
    return prev.map((s) => (s.id === activeSessionId ? { ...s, claudeSessionId } : s));
  });
}

export function createSessionSnapshot(session: TerminalSession, cwd: string): SavedSessionSnapshot {
  return {
    cwd,
    title: session.title,
    isClaude: session.isClaude === true,
    isCodex: session.isCodex === true,
    claudeSessionId: session.claudeSessionId,
    codexThreadId: session.codexThreadId,
  };
}

export async function readSessionSnapshot(session: TerminalSession): Promise<SavedSessionSnapshot> {
  try {
    const result = await window.electronAPI.pty.getCwd(session.id);
    return createSessionSnapshot(session, result.cwd ?? '');
  } catch {
    return createSessionSnapshot(session, '');
  }
}

export async function attemptCodexCapture(
  entry: PendingCodexCapture,
  pendingRef: MutableRefObject<PendingCodexCapture[]>,
  setSessions: SessionSetter,
): Promise<void> {
  try {
    const result = await window.electronAPI.codex.resolveThreadId({
      cwd: entry.cwd,
      spawnedAfter: entry.spawnedAt,
    });
    if (result.success && result.threadId) {
      pendingRef.current = pendingRef.current.filter((e) => e.ptyId !== entry.ptyId);
      setSessions((prev) =>
        prev.map((s) => (s.id === entry.ptyId ? { ...s, codexThreadId: result.threadId } : s)),
      );
      return;
    }
  } catch {
    // IPC error — treat as retry
  }
  const retries = entry.retries + 1;
  if (retries >= CODEX_CAPTURE_MAX_RETRIES) {
    pendingRef.current = pendingRef.current.filter((e) => e.ptyId !== entry.ptyId);
    return;
  }
  const idx = pendingRef.current.findIndex((e) => e.ptyId === entry.ptyId);
  if (idx >= 0) pendingRef.current[idx] = { ...entry, retries };
}
