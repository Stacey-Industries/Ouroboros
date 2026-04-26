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
