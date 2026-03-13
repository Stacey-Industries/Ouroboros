/**
 * useSessionManager — manages terminal session lifecycle state.
 *
 * Extracted from App.tsx. Owns sessions array, active session ID,
 * spawn/kill/restart logic, recording state, split pane management,
 * and session persistence.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TerminalSession } from '../components/Terminal/TerminalTabs';
import type { AppLayoutProps } from '../components/Layout/AppLayout';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function generateSessionId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildSessionLabel(index: number): string {
  return `Terminal ${index + 1}`;
}

export interface SessionManagerResult {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  spawnSession: (optionalCwd?: string) => Promise<void>;
  spawnClaudeSession: (
    optionalCwd?: string,
    options?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ) => Promise<void>;
  handleTerminalClose: (sessionId: string) => void;
  handleTerminalRestart: (sessionId: string) => Promise<void>;
  handleTerminalTitleChange: (sessionId: string, title: string) => void;
  handleTerminalReorder: (reordered: TerminalSession[]) => void;
  handleSplit: (primarySessionId: string) => Promise<void>;
  handleCloseSplit: (primarySessionId: string) => void;
  recordingSessions: Set<string>;
  handleToggleRecording: (sessionId: string) => Promise<void>;
  terminalControl: AppLayoutProps['terminalControl'];
}

export function useSessionManager(): SessionManagerResult {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const spawnCountRef = useRef(0);
  const killTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  // ── Recording state ────────────────────────────────────────────────────────
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());

  function clearKillTimers(sessionId: string): void {
    const timers = killTimersRef.current.get(sessionId);
    if (timers) {
      timers.forEach(clearTimeout);
      killTimersRef.current.delete(sessionId);
    }
  }

  const spawnSession = useCallback(async (optionalCwd?: string): Promise<void> => {
    const id = generateSessionId();
    const index = spawnCountRef.current;
    spawnCountRef.current += 1;

    let cwd: string | undefined = optionalCwd;
    if (!cwd) {
      try {
        cwd = await window.electronAPI.config.get('defaultProjectRoot');
      } catch {
        // Config not available; fall back to undefined (PTY uses os.homedir())
      }
    }

    const newSession: TerminalSession = {
      id,
      title: buildSessionLabel(index),
      status: 'running',
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(id);

    try {
      await window.electronAPI.pty.spawn(id, { cwd });

      const exitCleanup = window.electronAPI.pty.onExit(id, () => {
        exitCleanup();
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'exited' } : s)),
        );
        clearKillTimers(id);
      });
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: 'exited', title: `${s.title} [error]` } : s,
        ),
      );
    }
  }, []);

  const spawnClaudeSession = useCallback(async (
    optionalCwd?: string,
    options?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string },
  ): Promise<void> => {
    const id = generateSessionId();
    const index = spawnCountRef.current;
    spawnCountRef.current += 1;

    let cwd: string | undefined = optionalCwd;
    if (!cwd) {
      try {
        cwd = await window.electronAPI.config.get('defaultProjectRoot');
      } catch {
        // Config not available; fall back to undefined (PTY uses os.homedir())
      }
    }

    const newSession: TerminalSession = {
      id,
      title: options?.label ?? `Claude ${index + 1}`,
      status: 'running',
      isClaude: true,
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(id);

    try {
      await window.electronAPI.pty.spawnClaude(id, {
        cwd,
        initialPrompt: options?.initialPrompt,
        cliOverrides: options?.cliOverrides,
      });

      const exitCleanup = window.electronAPI.pty.onExit(id, () => {
        exitCleanup();
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'exited' } : s)),
        );
        clearKillTimers(id);
      });
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: 'exited', title: `${s.title} [error]` } : s,
        ),
      );
    }
  }, []);

  const gracefulKill = useCallback((sessionId: string): void => {
    clearKillTimers(sessionId);
    void window.electronAPI.pty.write(sessionId, '\x03');
    const t1 = setTimeout(() => {
      void window.electronAPI.pty.kill(sessionId);
    }, 3000);
    const t2 = setTimeout(() => {
      void window.electronAPI.pty.kill(sessionId);
    }, 6000);
    killTimersRef.current.set(sessionId, [t1, t2]);
  }, []);

  const handleTerminalClose = useCallback(
    (sessionId: string): void => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      if (session.status === 'running') {
        gracefulKill(sessionId);
      }

      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId && next.length > 0) {
          const closedIdx = prev.findIndex((s) => s.id === sessionId);
          const nextActive = next[Math.min(closedIdx, next.length - 1)];
          setActiveSessionId(nextActive.id);
        } else if (next.length === 0) {
          setActiveSessionId(null);
        }
        return next;
      });
    },
    [sessions, activeSessionId, gracefulKill],
  );

  const handleTerminalRestart = useCallback(
    async (sessionId: string): Promise<void> => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session || session.status !== 'exited') return;

      let cwd: string | undefined;
      try {
        cwd = await window.electronAPI.config.get('defaultProjectRoot');
      } catch {
        // ignore
      }

      try {
        await window.electronAPI.pty.spawn(sessionId, { cwd });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, status: 'running', title: s.title.replace(/ \[exited\]$/, '').replace(/ \[error\]$/, '') }
              : s,
          ),
        );

        const exitCleanup = window.electronAPI.pty.onExit(sessionId, () => {
          exitCleanup();
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, status: 'exited' } : s)),
          );
          clearKillTimers(sessionId);
        });
      } catch {
        // Still exited — no-op
      }
    },
    [sessions],
  );

  const handleTerminalTitleChange = useCallback((sessionId: string, title: string): void => {
    if (!title) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title } : s)),
    );
  }, []);

  // ── Restore terminal sessions from persisted config on mount ──────────────
  const hasRestoredSessionsRef = useRef(false);

  useEffect(() => {
    if (!hasElectronAPI()) return;
    if (hasRestoredSessionsRef.current) return;
    hasRestoredSessionsRef.current = true;

    void (async () => {
      try {
        // Check for already-running PTY sessions in main process (e.g. after hot reload).
        // If found, reconnect the renderer UI to them without spawning new processes.
        const active = await window.electronAPI.pty.listSessions();
        if (active.length > 0) {
          const reconnected: TerminalSession[] = active.map((s, i) => ({
            id: s.id,
            title: buildSessionLabel(i),
            status: 'running',
          }));
          setSessions(reconnected);
          setActiveSessionId(reconnected[0].id);
          spawnCountRef.current = reconnected.length;
          for (const s of reconnected) {
            const exitCleanup = window.electronAPI.pty.onExit(s.id, () => {
              exitCleanup();
              setSessions((prev) =>
                prev.map((sess) => (sess.id === s.id ? { ...sess, status: 'exited' } : sess)),
              );
              clearKillTimers(s.id);
            });
          }
          return;
        }

        const saved = await window.electronAPI.config.get('terminalSessions');
        if (!Array.isArray(saved) || saved.length === 0) {
          // No saved sessions — spawn a default one
          void spawnSession();
          return;
        }
        // Restore saved sessions in order
        for (const snap of saved) {
          if (snap && typeof snap.cwd === 'string') {
            await spawnSession(snap.cwd);
          }
        }
      } catch {
        // Config unavailable — spawn default
        void spawnSession();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist terminal CWDs every 5 seconds ────────────────────────────────
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const interval = setInterval(() => {
      const running = sessionsRef.current.filter((s) => s.status === 'running');
      if (running.length === 0) return;

      void (async () => {
        const snapshots = await Promise.all(
          running.map(async (s) => {
            try {
              const res = await window.electronAPI.pty.getCwd(s.id);
              return { cwd: res.cwd ?? '', title: s.title };
            } catch {
              return { cwd: '', title: s.title };
            }
          })
        );
        try {
          await window.electronAPI.config.set('terminalSessions', snapshots);
        } catch {
          // Best-effort — ignore write failures
        }
      })();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ── Recording toggle handler ───────────────────────────────────────────────
  const handleToggleRecording = useCallback(async (sessionId: string): Promise<void> => {
    const isCurrentlyRecording = recordingSessions.has(sessionId);
    if (isCurrentlyRecording) {
      await window.electronAPI.pty.stopRecording(sessionId);
      // The main process sends pty:recordingState event which updates state via onRecordingState.
      // But we also optimistically update here in case the event is delayed.
      setRecordingSessions((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    } else {
      await window.electronAPI.pty.startRecording(sessionId);
      setRecordingSessions((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    }
  }, [recordingSessions]);

  // ── Sync recording state from main process events ─────────────────────────
  useEffect(() => {
    if (!hasElectronAPI()) return;
    const cleanups: Array<() => void> = [];

    for (const session of sessions) {
      const cleanup = window.electronAPI.pty.onRecordingState(
        session.id,
        ({ recording }) => {
          setRecordingSessions((prev) => {
            const next = new Set(prev);
            if (recording) {
              next.add(session.id);
            } else {
              next.delete(session.id);
            }
            return next;
          });
        }
      );
      cleanups.push(cleanup);
    }

    return () => cleanups.forEach((c) => c());
  }, [sessions]);

  // ── Split pane handlers ────────────────────────────────────────────────────

  const handleSplit = useCallback(async (primarySessionId: string): Promise<void> => {
    const splitId = generateSessionId();

    let cwd: string | undefined;
    try {
      cwd = await window.electronAPI.config.get('defaultProjectRoot');
    } catch {
      // ignore
    }

    try {
      await window.electronAPI.pty.spawn(splitId, { cwd });

      const exitCleanup = window.electronAPI.pty.onExit(splitId, () => {
        exitCleanup();
        setSessions((prev) =>
          prev.map((s) =>
            s.id === primarySessionId ? { ...s, splitStatus: 'exited' } : s
          )
        );
        clearKillTimers(splitId);
      });

      setSessions((prev) =>
        prev.map((s) =>
          s.id === primarySessionId
            ? { ...s, splitSessionId: splitId, splitStatus: 'running' }
            : s
        )
      );
    } catch {
      // Spawn failed — don't show split
    }
  }, []);

  const handleCloseSplit = useCallback((primarySessionId: string): void => {
    setSessions((prev) => {
      const session = prev.find((s) => s.id === primarySessionId);
      if (session?.splitSessionId) {
        gracefulKill(session.splitSessionId);
      }
      return prev.map((s) =>
        s.id === primarySessionId
          ? { ...s, splitSessionId: undefined, splitStatus: undefined }
          : s
      );
    });
  }, [gracefulKill]);

  const handleTerminalReorder = useCallback(
    (reordered: TerminalSession[]): void => {
      setSessions(reordered);
    },
    [],
  );

  const terminalControl: AppLayoutProps['terminalControl'] = {
    sessions,
    activeSessionId,
    onActivate: setActiveSessionId,
    onClose: handleTerminalClose,
    onNew: () => void spawnSession(),
    onNewClaude: () => void spawnClaudeSession(),
    onReorder: handleTerminalReorder,
  };

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    spawnSession,
    spawnClaudeSession,
    handleTerminalClose,
    handleTerminalRestart,
    handleTerminalTitleChange,
    handleTerminalReorder,
    handleSplit,
    handleCloseSplit,
    recordingSessions,
    handleToggleRecording,
    terminalControl,
  };
}
