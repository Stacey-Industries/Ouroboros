/**
 * App.tsx — Root application component.
 *
 * Responsibilities:
 * - Bootstrap theme and config on mount.
 * - Own project root state via ProjectProvider.
 * - Render AppLayout with all panels wired:
 *     Left sidebar  → ProjectPicker (header) + FileTree (content)
 *     Centre        → EditorTabBar (tabBar slot) + EditorContent (breadcrumb + viewer)
 *     Right         → AgentMonitorManager
 *     Bottom        → TerminalManager
 * - Mount CommandPalette overlay.
 * - Mount SettingsModal component (conditional on state).
 * - Listen for Electron menu events and custom window events from commands.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useConfig } from './hooks/useConfig';
import { useTheme } from './hooks/useTheme';

import { ProjectProvider, useProject } from './contexts/ProjectContext';
import { AppLayout } from './components/Layout/AppLayout';
import type { AppLayoutProps } from './components/Layout/AppLayout';

import { ProjectPicker } from './components/FileTree/ProjectPicker';
import { FileTree } from './components/FileTree/FileTree';

import {
  FileViewerManager,
  useFileViewerManager,
  FileViewerTabs,
  Breadcrumb,
  FileViewer,
} from './components/FileViewer';

import { TerminalManager } from './components/Terminal/TerminalManager';
import type { TerminalSession } from './components/Terminal/TerminalTabs';
import { AgentMonitorManager } from './components/AgentMonitor/AgentMonitorManager';

import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { FilePicker } from './components/CommandPalette/FilePicker';
import { SymbolSearch } from './components/CommandPalette/SymbolSearch';
import { useCommandPalette } from './components/CommandPalette/useCommandPalette';
import { useCommandRegistry } from './components/CommandPalette/useCommandRegistry';
import type { Command } from './components/CommandPalette/types';

import { SettingsModal } from './components/Settings';
import { keyEventToString, KEYBINDING_ACTIONS } from './components/Settings/KeybindingsSection';

import { ToastProvider, useToastContext } from './contexts/ToastContext';
import { FocusProvider } from './contexts/FocusContext';
import { AgentEventsProvider } from './contexts/AgentEventsContext';

import { useGitBranch } from './hooks/useGitBranch';
import { useUpdater } from './hooks/useUpdater';
import type { AppTheme } from './types/electron';
import { PerformanceOverlay } from './components/shared/PerformanceOverlay';

// ─── Guard: is the Electron bridge available? ─────────────────────────────────

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg, #0d1117)',
        color: 'var(--text-muted, #8b949e)',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <circle cx="12" cy="12" r="10" stroke="var(--border, #30363d)" strokeWidth="2" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="var(--accent, #58a6ff)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ fontSize: '13px', fontFamily: 'var(--font-ui, system-ui)' }}>
        Loading…
      </span>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sidebar content: FileTree wired to ProjectContext + FileViewerManager ─────

function SidebarFileTree(): React.ReactElement {
  const { projectRoots, removeProjectRoot } = useProject();
  const { openFile, activeFile } = useFileViewerManager();

  const handleFileSelect = useCallback(
    (filePath: string): void => {
      void openFile(filePath);
    },
    [openFile],
  );

  return (
    <FileTree
      projectRoots={projectRoots}
      activeFilePath={activeFile?.path ?? null}
      onFileSelect={handleFileSelect}
      onRemoveRoot={removeProjectRoot}
    />
  );
}

// ─── Editor tab bar — reads open files from FileViewerManager context ─────────
// This is passed as the `editorTabBar` slot of AppLayout / CentrePane.

function EditorTabBar(): React.ReactElement {
  const { openFiles, activeIndex, setActive, closeFile } = useFileViewerManager();

  if (openFiles.length === 0) {
    return <div style={{ flex: 1 }} aria-hidden="true" />;
  }

  return (
    <FileViewerTabs
      files={openFiles}
      activeIndex={activeIndex}
      onActivate={setActive}
      onClose={closeFile}
    />
  );
}

// ─── Editor content: Breadcrumb + FileViewer ──────────────────────────────────
// This is passed as the `editorContent` slot of AppLayout.
// The tab bar is rendered separately in the `editorTabBar` slot above.

// ─── Status bar props — derived from FileViewerManager context ────────────────

function useStatusBarProps(): {
  activeFilePath: string | null;
  lineCount: number | undefined;
  language: string | undefined;
} {
  const { activeFile } = useFileViewerManager();

  const lineCount = activeFile?.content != null
    ? activeFile.content.split('\n').length
    : undefined;

  return {
    activeFilePath: activeFile?.path ?? null,
    lineCount,
    language: undefined, // let StatusBar infer from extension
  };
}

// ─── Editor content: Breadcrumb + FileViewer ──────────────────────────────────

function EditorContent(): React.ReactElement {
  const { activeFile, openFile } = useFileViewerManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();

  const handleReload = useCallback(async (): Promise<void> => {
    if (!activeFile) return;
    await openFile(activeFile.path);
    const name = activeFile.path.replace(/\\/g, '/').split('/').pop() ?? activeFile.path;
    toast(`Reloaded ${name} from disk`, 'info');
  }, [activeFile, openFile, toast]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Breadcrumb bar */}
      <div
        style={{
          flexShrink: 0,
          height: '28px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Breadcrumb
          filePath={activeFile?.path ?? null}
          projectRoot={projectRoot}
        />
      </div>

      {/* File viewer fills the remaining height */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FileViewer
          filePath={activeFile?.path ?? null}
          content={activeFile?.content ?? null}
          isLoading={activeFile?.isLoading ?? false}
          error={activeFile?.error ?? null}
          isDirtyOnDisk={activeFile?.isDirtyOnDisk ?? false}
          onReload={handleReload}
          originalContent={activeFile?.originalContent ?? null}
          projectRoot={projectRoot}
          isImage={activeFile?.isImage ?? false}
        />
      </div>
    </div>
  );
}

// ─── AppLayoutConnected — wraps AppLayout, reads FileViewerManager context ────

/**
 * Thin wrapper that calls useStatusBarProps (which depends on FileViewerManager
 * context) and forwards all other props to AppLayout.
 */
function AppLayoutConnected(
  props: Omit<AppLayoutProps, 'statusBar'> & { projectRoot: string | null },
): React.ReactElement {
  const { projectRoot, ...layoutProps } = props;
  const statusBarData = useStatusBarProps();
  const { branch } = useGitBranch(projectRoot);

  return (
    <AppLayout
      {...layoutProps}
      statusBar={{
        activeFilePath: statusBarData.activeFilePath,
        projectRoot,
        lineCount: statusBarData.lineCount,
        language: statusBarData.language,
        gitBranch: branch,
      }}
    />
  );
}

// ─── FilePickerConnected — reads openFile from FileViewerManager context ──────

function FilePickerConnected({
  isOpen,
  onClose,
  projectRoot,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
}): React.ReactElement {
  const { openFile } = useFileViewerManager();

  const handleOpenFile = useCallback(
    (filePath: string): void => {
      void openFile(filePath);
    },
    [openFile],
  );

  return (
    <FilePicker
      isOpen={isOpen}
      onClose={onClose}
      projectRoot={projectRoot}
      onOpenFile={handleOpenFile}
    />
  );
}

// ─── InnerApp — rendered once config is ready, inside ProjectProvider ─────────

interface InnerAppProps {
  initialRecentProjects: string[];
  keybindings: Record<string, string>;
}

function InnerApp({ initialRecentProjects, keybindings }: InnerAppProps): React.ReactElement {
  const { setTheme } = useTheme();
  const { projectRoot, projectRoots, setProjectRoot, addProjectRoot } = useProject();

  const { isOpen: paletteOpen, open: openPalette, close: closePalette } = useCommandPalette();
  const { commands, recentIds, execute } = useCommandRegistry();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [perfOverlayVisible, setPerfOverlayVisible] = useState(false);

  // Auto-updater — subscribes to update events and shows toasts
  useUpdater();

  // ── Global renderer error capture (crash reporting) ───────────────────────
  useEffect(() => {
    if (!hasElectronAPI()) return;

    function onError(event: ErrorEvent): void {
      void window.electronAPI.crash.logError(
        'renderer:window.onerror',
        event.message,
        event.error instanceof Error ? (event.error.stack ?? '') : '',
      );
    }

    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      const msg =
        event.reason instanceof Error
          ? (event.reason.stack ?? event.reason.message)
          : String(event.reason);
      void window.electronAPI.crash.logError('renderer:unhandledRejection', msg);
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  // Keep recentProjects in local state so ProjectPicker updates immediately
  // without waiting for a config round-trip.
  const [recentProjects, setRecentProjects] = useState<string[]>(initialRecentProjects);

  // ── Handle project switch ────────────────────────────────────────────────

  const handleProjectChange = useCallback(
    async (path: string): Promise<void> => {
      setProjectRoot(path);

      const updated = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 10);
      setRecentProjects(updated);

      if (hasElectronAPI()) {
        try {
          await window.electronAPI.config.set('defaultProjectRoot', path);
          await window.electronAPI.config.set('recentProjects', updated);
        } catch {
          // Config write is best-effort; in-memory state is already updated.
        }
      }
    },
    [recentProjects, setProjectRoot],
  );

  // ── Terminal session state (lifted from TerminalManager) ──────────────────
  // Declared before menu event useEffect so spawnSession is in scope.

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const spawnCountRef = useRef(0);
  const killTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  // ── Recording state ────────────────────────────────────────────────────────
  const [recordingSessions, setRecordingSessions] = useState<Set<string>>(new Set());

  function generateSessionId(): string {
    return `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function buildSessionLabel(index: number): string {
    return `Terminal ${index + 1}`;
  }

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

  // ── Electron menu events ─────────────────────────────────────────────────

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const cleanup = window.electronAPI.app.onMenuEvent((event) => {
      if (event === 'menu:open-folder') {
        void window.electronAPI.files.selectFolder().then((result) => {
          if (!result.cancelled && result.path) {
            void handleProjectChange(result.path);
          }
        });
      } else if (event === 'menu:command-palette') {
        openPalette();
      } else if (event === 'menu:new-terminal') {
        void spawnSession();
      } else if (event === 'menu:settings') {
        setSettingsOpen(true);
      }
    });

    return cleanup;
  }, [handleProjectChange, openPalette, spawnSession]);

  // ── Custom window events dispatched by command registry ──────────────────

  useEffect(() => {
    function onSetTheme(e: Event): void {
      const id = (e as CustomEvent<string>).detail;
      void setTheme(id as AppTheme);
    }

    function onOpenSettings(): void {
      setSettingsOpen(true);
    }

    function onOpenFolder(): void {
      if (!hasElectronAPI()) return;
      void window.electronAPI.files.selectFolder().then((result) => {
        if (!result.cancelled && result.path) {
          void handleProjectChange(result.path);
        }
      });
    }

    function onNewTerminal(e: Event): void {
      const detail = (e as CustomEvent<{ cwd?: string }>).detail;
      void spawnSession(detail?.cwd);
    }

    function onOpenFilePicker(): void {
      setFilePickerOpen(true);
    }

    function onOpenSymbolSearch(): void {
      setSymbolSearchOpen(true);
    }

    // Keyboard shortcuts — respect user-configured keybindings from config
    function getEffectiveShortcut(actionId: string): string {
      if (keybindings[actionId]) return keybindings[actionId];
      return KEYBINDING_ACTIONS.find((a) => a.id === actionId)?.defaultShortcut ?? '';
    }

    function onKeyDown(e: KeyboardEvent): void {
      const pressed = keyEventToString(e);
      if (!pressed) return;

      const settingsShortcut = getEffectiveShortcut('app:settings');
      const filePickerShortcut = getEffectiveShortcut('file:open-file');

      if (pressed === settingsShortcut) {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      } else if (pressed === filePickerShortcut) {
        e.preventDefault();
        setFilePickerOpen((prev) => !prev);
      } else if (pressed === 'Ctrl+T') {
        e.preventDefault();
        setSymbolSearchOpen((prev) => !prev);
      } else if (pressed === 'Ctrl+Shift+P') {
        e.preventDefault();
        setPerfOverlayVisible((prev) => !prev);
      }
    }

    window.addEventListener('agent-ide:set-theme', onSetTheme);
    window.addEventListener('agent-ide:open-settings', onOpenSettings);
    window.addEventListener('agent-ide:open-folder', onOpenFolder);
    window.addEventListener('agent-ide:new-terminal', onNewTerminal);
    window.addEventListener('agent-ide:open-file-picker', onOpenFilePicker);
    window.addEventListener('agent-ide:open-symbol-search', onOpenSymbolSearch);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('agent-ide:set-theme', onSetTheme);
      window.removeEventListener('agent-ide:open-settings', onOpenSettings);
      window.removeEventListener('agent-ide:open-folder', onOpenFolder);
      window.removeEventListener('agent-ide:new-terminal', onNewTerminal);
      window.removeEventListener('agent-ide:open-file-picker', onOpenFilePicker);
      window.removeEventListener('agent-ide:open-symbol-search', onOpenSymbolSearch);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleProjectChange, setTheme, spawnSession, keybindings]);

  // ── Command palette executor ──────────────────────────────────────────────

  const handleExecute = useCallback(
    async (command: Command): Promise<void> => {
      await execute(command);
    },
    [execute],
  );

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

  // ── Terminal control for AppLayout ──────────────────────────────────────

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
    onReorder: handleTerminalReorder,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FileViewerManager projectRoot={projectRoot}>
      <AppLayoutConnected
        terminalControl={terminalControl}
        projectRoot={projectRoot}
        keybindings={keybindings}
        sidebarHeader={
          <ProjectPicker
            currentPath={projectRoot}
            recentProjects={recentProjects}
            onSelectProject={(path) => void handleProjectChange(path)}
            onAddProject={(path) => {
              addProjectRoot(path);
              // Also update recentProjects
              const updated = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 10);
              setRecentProjects(updated);
              if (hasElectronAPI()) {
                void window.electronAPI.config.set('recentProjects', updated);
              }
            }}
            rootCount={projectRoots.length}
          />
        }
        sidebarContent={<SidebarFileTree />}
        editorTabBar={<EditorTabBar />}
        editorContent={<EditorContent />}
        agentCards={<AgentMonitorManager />}
        terminalContent={
          <TerminalManager
            sessions={sessions}
            activeSessionId={activeSessionId}
            onRestart={handleTerminalRestart}
            onClose={handleTerminalClose}
            onTitleChange={handleTerminalTitleChange}
            onSpawn={() => void spawnSession()}
            recordingSessions={recordingSessions}
            onToggleRecording={(id) => void handleToggleRecording(id)}
            onSplit={(id) => void handleSplit(id)}
            onCloseSplit={handleCloseSplit}
          />
        }
      />

      {/* Command palette — fixed overlay */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
        recentIds={recentIds}
        onExecute={handleExecute}
      />

      {/* File picker — fixed overlay */}
      <FilePickerConnected
        isOpen={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        projectRoot={projectRoot}
      />

      {/* Symbol search — fixed overlay */}
      <SymbolSearch
        isOpen={symbolSearchOpen}
        onClose={() => setSymbolSearchOpen(false)}
        projectRoot={projectRoot}
      />

      {/* Settings modal — fixed overlay, above command palette */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Performance overlay — toggled by Ctrl+Shift+P */}
      <PerformanceOverlay visible={perfOverlayVisible} />
    </FileViewerManager>
  );
}

// ─── useCustomCSS — inject / update <style id="custom-css"> in document head ──

function useCustomCSS(css: string): void {
  useEffect(() => {
    const styleId = 'custom-css';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }

    el.textContent = css;
  }, [css]);
}

// ─── ConfiguredApp — reads customCSS from config and injects it ───────────────

interface ConfiguredAppProps {
  initialRoot: string | null;
  initialRecents: string[];
  keybindings: Record<string, string>;
  customCSS: string;
}

function ConfiguredApp({
  initialRoot,
  initialRecents,
  keybindings,
  customCSS,
}: ConfiguredAppProps): React.ReactElement {
  useCustomCSS(customCSS);

  return (
    <ToastProvider>
      <FocusProvider>
        <AgentEventsProvider>
          <ProjectProvider initialRoot={initialRoot}>
            <InnerApp initialRecentProjects={initialRecents} keybindings={keybindings} />
          </ProjectProvider>
        </AgentEventsProvider>
      </FocusProvider>
    </ToastProvider>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

/**
 * App — top-level entry.
 *
 * Calls useTheme first so CSS vars are applied to :root before first paint.
 * Shows a loading screen until config is ready, then seeds ProjectProvider
 * with the persisted project root and recent list.
 */
export default function App(): React.ReactElement {
  const { config, isLoading: configLoading } = useConfig();
  // Apply theme CSS vars to :root immediately. Return value not used here.
  useTheme();

  if (configLoading || !config) {
    return <LoadingScreen />;
  }

  const initialRoot: string | null = config.defaultProjectRoot || null;
  const initialRecents: string[] = Array.isArray(config.recentProjects)
    ? config.recentProjects
    : [];
  const keybindings: Record<string, string> =
    config.keybindings && typeof config.keybindings === 'object'
      ? config.keybindings
      : {};
  const customCSS: string =
    typeof config.customCSS === 'string' ? config.customCSS : '';

  return (
    <ConfiguredApp
      initialRoot={initialRoot}
      initialRecents={initialRecents}
      keybindings={keybindings}
      customCSS={customCSS}
    />
  );
}
