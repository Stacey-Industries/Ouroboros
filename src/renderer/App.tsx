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
import { MultiBufferManager, useMultiBufferManager, AddExcerptForm } from './components/FileViewer/MultiBufferManager';
import { MultiBufferView } from './components/FileViewer/MultiBufferView';

import { TerminalManager } from './components/Terminal/TerminalManager';
import type { TerminalSession } from './components/Terminal/TerminalTabs';
import { AgentMonitorManager } from './components/AgentMonitor/AgentMonitorManager';
import { GitPanel } from './components/GitPanel';
import { RightSidebarTabs } from './components/Layout/RightSidebarTabs';

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
import type { AppTheme, AgentTemplate, WorkspaceLayout } from './types/electron';
import { resolveTemplate } from './utils/templateResolver';
import { PerformanceOverlay } from './components/shared/PerformanceOverlay';
import { DiffReviewProvider, useDiffReview, DiffReviewPanel } from './components/DiffReview';
import { SessionReplayPanel } from './components/SessionReplay';
import type { AgentSession as AgentMonitorSession } from './components/AgentMonitor/types';

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
// Also shows multi-buffer tabs alongside file tabs.

function EditorTabBar(): React.ReactElement {
  const { openFiles, activeIndex, setActive, closeFile } = useFileViewerManager();
  const { multiBuffers, openMultiBuffer, closeMultiBuffer } = useMultiBufferManager();

  const handleNewMultiBuffer = useCallback(() => {
    const id = openMultiBuffer();
    // Dispatch event so the centre pane switches to multi-buffer view
    window.dispatchEvent(
      new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
    );
  }, [openMultiBuffer]);

  const handleActivateMultiBuffer = useCallback((id: string) => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
    );
  }, []);

  const handleCloseMultiBuffer = useCallback((id: string) => {
    closeMultiBuffer(id);
    // If this was the active multi-buffer, switch back to file view
    window.dispatchEvent(
      new CustomEvent('agent-ide:deactivate-multi-buffer'),
    );
  }, [closeMultiBuffer]);

  const handleActivateFile = useCallback((filePath: string) => {
    // Deactivate any multi-buffer first
    window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
    setActive(filePath);
  }, [setActive]);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', alignItems: 'stretch' }}>
      {/* File tabs */}
      {openFiles.length > 0 && (
        <FileViewerTabs
          files={openFiles}
          activeIndex={activeIndex}
          onActivate={handleActivateFile}
          onClose={closeFile}
        />
      )}

      {/* Multi-buffer tabs */}
      {multiBuffers.map((mb) => (
        <div
          key={mb.id}
          role="tab"
          tabIndex={0}
          title={mb.config.name}
          onClick={() => handleActivateMultiBuffer(mb.id)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); handleCloseMultiBuffer(mb.id); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleActivateMultiBuffer(mb.id); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 10px 0 12px',
            height: '100%',
            flexShrink: 0,
            cursor: 'pointer',
            userSelect: 'none',
            borderRight: '1px solid var(--border)',
            borderBottom: '2px solid transparent',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
            fontSize: '0.8125rem',
            fontFamily: 'var(--font-ui)',
            minWidth: '80px',
            maxWidth: '200px',
            transition: 'background-color 100ms ease, color 100ms ease',
          }}
        >
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{'\u2630'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mb.config.name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleCloseMultiBuffer(mb.id); }}
            aria-label={`Close ${mb.config.name}`}
            tabIndex={-1}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '16px', height: '16px', borderRadius: '3px',
              border: 'none', background: 'transparent',
              color: 'var(--text-faint)', cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}

      {/* New Multi-Buffer button */}
      <button
        onClick={handleNewMultiBuffer}
        title="New Multi-Buffer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '100%',
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontFamily: 'var(--font-ui)',
          padding: 0,
          borderRight: '1px solid var(--border)',
        }}
      >
        {'\u2630'}+
      </button>

      {/* Spacer */}
      {openFiles.length === 0 && multiBuffers.length === 0 && (
        <div style={{ flex: 1 }} aria-hidden="true" />
      )}
      <div style={{ flex: 1 }} />
    </div>
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
  const { activeFile, openFile, saveFile, setDirty } = useFileViewerManager();
  const { multiBuffers, addExcerpt, removeExcerpt } = useMultiBufferManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();

  // Track which multi-buffer is active (null = normal file view)
  const [activeMultiBufferId, setActiveMultiBufferId] = useState<string | null>(null);
  const [showAddExcerpt, setShowAddExcerpt] = useState(false);

  // Listen for activation/deactivation events from the tab bar
  useEffect(() => {
    function onActivate(e: Event): void {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setActiveMultiBufferId(id);
    }
    function onDeactivate(): void {
      setActiveMultiBufferId(null);
      setShowAddExcerpt(false);
    }
    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);

  // If the active multi-buffer was closed, fall back to file view
  const activeMB = activeMultiBufferId
    ? multiBuffers.find((mb) => mb.id === activeMultiBufferId) ?? null
    : null;

  useEffect(() => {
    if (activeMultiBufferId && !activeMB) {
      setActiveMultiBufferId(null);
    }
  }, [activeMultiBufferId, activeMB]);

  const handleReload = useCallback(async (): Promise<void> => {
    if (!activeFile) return;
    await openFile(activeFile.path);
    const name = activeFile.path.replace(/\\/g, '/').split('/').pop() ?? activeFile.path;
    toast(`Reloaded ${name} from disk`, 'info');
  }, [activeFile, openFile, toast]);

  const handleSave = useCallback(async (content: string): Promise<void> => {
    if (!activeFile) return;
    await saveFile(activeFile.path, content);
    const name = activeFile.path.replace(/\\/g, '/').split('/').pop() ?? activeFile.path;
    toast(`Saved ${name}`, 'info');
  }, [activeFile, saveFile, toast]);

  const handleDirtyChange = useCallback((dirty: boolean): void => {
    if (!activeFile) return;
    setDirty(activeFile.path, dirty);
  }, [activeFile, setDirty]);

  const handleOpenFileFromExcerpt = useCallback((filePath: string) => {
    setActiveMultiBufferId(null);
    void openFile(filePath);
  }, [openFile]);

  const handleRemoveExcerpt = useCallback((index: number) => {
    if (!activeMultiBufferId) return;
    removeExcerpt(activeMultiBufferId, index);
  }, [activeMultiBufferId, removeExcerpt]);

  const handleAddExcerpt = useCallback((excerpt: import('./types/electron').BufferExcerpt) => {
    if (!activeMultiBufferId) return;
    addExcerpt(activeMultiBufferId, excerpt);
    setShowAddExcerpt(false);
  }, [activeMultiBufferId, addExcerpt]);

  // Multi-buffer view
  if (activeMB) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Action bar */}
        <div
          style={{
            flexShrink: 0,
            height: '28px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            gap: '8px',
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8125rem',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Multi-Buffer:</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{activeMB.config.name}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowAddExcerpt((prev) => !prev)}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              color: 'var(--accent)',
              padding: '2px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            + Add Excerpt
          </button>
        </div>

        {/* Add excerpt form */}
        {showAddExcerpt && (
          <AddExcerptForm
            onAdd={handleAddExcerpt}
            onCancel={() => setShowAddExcerpt(false)}
          />
        )}

        {/* Multi-buffer content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <MultiBufferView
            name={activeMB.config.name}
            excerpts={activeMB.config.excerpts}
            fileContents={activeMB.fileContents}
            onRemoveExcerpt={handleRemoveExcerpt}
            onOpenFile={handleOpenFileFromExcerpt}
          />
        </div>
      </div>
    );
  }

  // Normal file view
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
          onSave={handleSave}
          onDirtyChange={handleDirtyChange}
          isDirty={activeFile?.isDirty ?? false}
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

// ─── CentrePaneConnected — switches between EditorContent, DiffReview, and SessionReplay ──

function CentrePaneConnected(): React.ReactElement {
  const { state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll } = useDiffReview();
  const [replaySession, setReplaySession] = useState<AgentMonitorSession | null>(null);

  // Listen for diff review open event
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ sessionId: string; snapshotHash: string; projectRoot: string }>).detail;
      if (detail) {
        setReplaySession(null); // Close replay if open
        openReview(detail.sessionId, detail.snapshotHash, detail.projectRoot);
      }
    }

    window.addEventListener('agent-ide:diff-review-open', onOpen);
    return () => window.removeEventListener('agent-ide:diff-review-open', onOpen);
  }, [openReview]);

  // Listen for session replay open event
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ session: AgentMonitorSession }>).detail;
      if (detail?.session) {
        closeReview(); // Close diff review if open
        setReplaySession(detail.session);
      }
    }

    window.addEventListener('agent-ide:open-session-replay', onOpen);
    return () => window.removeEventListener('agent-ide:open-session-replay', onOpen);
  }, [closeReview]);

  // Diff review takes priority if both are somehow open
  if (state) {
    return (
      <DiffReviewPanel
        state={state}
        onAcceptHunk={acceptHunk}
        onRejectHunk={rejectHunk}
        onAcceptAllFile={acceptAllFile}
        onRejectAllFile={rejectAllFile}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
        onClose={closeReview}
      />
    );
  }

  if (replaySession) {
    return (
      <SessionReplayPanel
        session={replaySession}
        onClose={() => setReplaySession(null)}
      />
    );
  }

  return <EditorContent />;
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
  const { commands, recentIds, execute, registerCommand } = useCommandRegistry();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [perfOverlayVisible, setPerfOverlayVisible] = useState(false);

  // ── Workspace layouts ─────────────────────────────────────────────────────
  const [workspaceLayouts, setWorkspaceLayouts] = useState<WorkspaceLayout[]>([]);
  const [activeLayoutName, setActiveLayoutName] = useState('Default');

  // Load layouts from config on mount
  useEffect(() => {
    if (!hasElectronAPI()) return;
    void (async () => {
      try {
        const layouts = await window.electronAPI.config.get('workspaceLayouts');
        const activeName = await window.electronAPI.config.get('activeLayoutName');
        if (Array.isArray(layouts) && layouts.length > 0) {
          setWorkspaceLayouts(layouts);
        }
        if (activeName) {
          setActiveLayoutName(activeName);
        }
      } catch {
        // Config not available — use defaults
      }
    })();
  }, []);

  const handleSelectLayout = useCallback((layout: WorkspaceLayout) => {
    setActiveLayoutName(layout.name);
    // Dispatch DOM event so AppLayout can apply sizes + collapse state
    window.dispatchEvent(new CustomEvent('agent-ide:apply-layout', { detail: layout }));
    if (hasElectronAPI()) {
      void window.electronAPI.config.set('activeLayoutName', layout.name);
    }
  }, []);

  const handleSaveLayout = useCallback((name: string) => {
    // We'll read current sizes via a DOM event round-trip isn't needed;
    // instead pass a callback that reads localStorage (same source as useResizable).
    let currentSizes = { leftSidebar: 240, rightSidebar: 300, terminal: 250 };
    let currentCollapse = { leftSidebar: false, rightSidebar: false, terminal: false };
    try {
      const stored = localStorage.getItem('agent-ide:panel-sizes');
      if (stored) currentSizes = { ...currentSizes, ...JSON.parse(stored) };
      const storedCollapse = localStorage.getItem('agent-ide:panel-collapse');
      if (storedCollapse) currentCollapse = { ...currentCollapse, ...JSON.parse(storedCollapse) };
    } catch { /* ignore */ }

    const newLayout: WorkspaceLayout = {
      name,
      panelSizes: currentSizes,
      visiblePanels: {
        leftSidebar: !currentCollapse.leftSidebar,
        rightSidebar: !currentCollapse.rightSidebar,
        terminal: !currentCollapse.terminal,
      },
      builtIn: false,
    };

    setWorkspaceLayouts((prev) => {
      const updated = [...prev, newLayout];
      if (hasElectronAPI()) {
        void window.electronAPI.config.set('workspaceLayouts', updated);
      }
      return updated;
    });
    setActiveLayoutName(name);
    if (hasElectronAPI()) {
      void window.electronAPI.config.set('activeLayoutName', name);
    }
  }, []);

  const handleUpdateLayout = useCallback((name: string) => {
    let currentSizes = { leftSidebar: 240, rightSidebar: 300, terminal: 250 };
    let currentCollapse = { leftSidebar: false, rightSidebar: false, terminal: false };
    try {
      const stored = localStorage.getItem('agent-ide:panel-sizes');
      if (stored) currentSizes = { ...currentSizes, ...JSON.parse(stored) };
      const storedCollapse = localStorage.getItem('agent-ide:panel-collapse');
      if (storedCollapse) currentCollapse = { ...currentCollapse, ...JSON.parse(storedCollapse) };
    } catch { /* ignore */ }

    setWorkspaceLayouts((prev) => {
      const updated = prev.map((l) =>
        l.name === name
          ? {
              ...l,
              panelSizes: currentSizes,
              visiblePanels: {
                leftSidebar: !currentCollapse.leftSidebar,
                rightSidebar: !currentCollapse.rightSidebar,
                terminal: !currentCollapse.terminal,
              },
            }
          : l,
      );
      if (hasElectronAPI()) {
        void window.electronAPI.config.set('workspaceLayouts', updated);
      }
      return updated;
    });
  }, []);

  const handleDeleteLayout = useCallback((name: string) => {
    setWorkspaceLayouts((prev) => {
      const updated = prev.filter((l) => l.name !== name);
      if (hasElectronAPI()) {
        void window.electronAPI.config.set('workspaceLayouts', updated);
      }
      return updated;
    });
    // If the deleted layout was active, switch to Default
    setActiveLayoutName((prev) => {
      if (prev === name) {
        const newName = 'Default';
        if (hasElectronAPI()) {
          void window.electronAPI.config.set('activeLayoutName', newName);
        }
        return newName;
      }
      return prev;
    });
  }, []);

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

  // ── Register agent templates as command palette commands ─────────────────

  useEffect(() => {
    if (!hasElectronAPI()) return;

    void window.electronAPI.config.get('agentTemplates').then((templates: AgentTemplate[]) => {
      if (!templates || templates.length === 0) return;

      const children: Command[] = templates.map((t) => ({
        id: `agent-template:${t.id}`,
        label: t.name,
        category: 'terminal' as const,
        icon: t.icon ?? '◆',
        action: () => {
          // Resolve template variables with current context
          const ctx = {
            projectRoot,
            projectName: projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '',
            openFile: null as string | null,
            openFileName: null as string | null,
          };
          const resolvedPrompt = resolveTemplate(t.promptTemplate, ctx);
          window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
            detail: {
              prompt: resolvedPrompt,
              label: t.name,
              cliOverrides: t.cliOverrides,
            },
          }));
        },
      }));

      registerCommand({
        id: 'agent:templates',
        label: 'Agent Templates',
        category: 'terminal',
        icon: '◆',
        action: () => { /* submenu */ },
        children,
      });
    });
  }, [projectRoot, registerCommand]);

  // ── Register layout switching commands ──────────────────────────────────────

  useEffect(() => {
    const children: Command[] = workspaceLayouts.map((layout, idx) => ({
      id: `layout:switch:${layout.name}`,
      label: layout.name,
      category: 'view' as const,
      shortcut: idx < 3 ? `Ctrl+Alt+${idx + 1}` : undefined,
      icon: layout.name === activeLayoutName ? '●' : '○',
      action: () => handleSelectLayout(layout),
    }));

    registerCommand({
      id: 'layout:switch',
      label: 'Switch Layout',
      category: 'view',
      icon: '⊞',
      action: () => { /* submenu */ },
      children,
    });

    registerCommand({
      id: 'layout:save-current',
      label: 'Save Current Layout',
      category: 'view',
      icon: '⊞',
      action: () => {
        const name = prompt('Enter a name for this layout:');
        if (name && name.trim()) {
          handleSaveLayout(name.trim());
        }
      },
    });
  }, [workspaceLayouts, activeLayoutName, registerCommand, handleSelectLayout, handleSaveLayout]);

  // ── Register multi-session command ─────────────────────────────────────────

  useEffect(() => {
    registerCommand({
      id: 'agent:multi-session',
      label: 'Launch Multi-Session',
      category: 'terminal',
      icon: '\u2B58',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-multi-session'));
      },
    });
  }, [registerCommand]);

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

  const spawnClaudeSession = useCallback(async (
    optionalCwd?: string,
    options?: { initialPrompt?: string; cliOverrides?: Record<string, unknown>; label?: string }
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

    function onOpenDiffReview(e: Event): void {
      const detail = (e as CustomEvent<{ sessionId: string; snapshotHash: string; projectRoot: string }>).detail;
      if (detail?.sessionId && detail?.snapshotHash && detail?.projectRoot) {
        // This is handled by the DiffReviewProvider — we dispatch to it via a second event
        // that the DiffReviewConnected component listens for.
        window.dispatchEvent(new CustomEvent('agent-ide:diff-review-open', { detail }));
      }
    }

    function onSpawnClaudeTemplate(e: Event): void {
      const detail = (e as CustomEvent<{ prompt: string; label?: string; cliOverrides?: Record<string, unknown> }>).detail;
      if (detail?.prompt) {
        void spawnClaudeSession(undefined, {
          initialPrompt: detail.prompt,
          label: detail.label,
          cliOverrides: detail.cliOverrides,
        });
      }
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
      } else if (pressed === 'Ctrl+Shift+N') {
        e.preventDefault();
        if (hasElectronAPI()) {
          void window.electronAPI.window.create();
        }
      } else if (pressed === 'Ctrl+Shift+P') {
        e.preventDefault();
        setPerfOverlayVisible((prev) => !prev);
      } else if (pressed === 'Ctrl+Shift+C') {
        e.preventDefault();
        void spawnClaudeSession();
      } else if (pressed === 'Ctrl+Alt+1' || pressed === 'Ctrl+Alt+2' || pressed === 'Ctrl+Alt+3') {
        e.preventDefault();
        const idx = parseInt(pressed.slice(-1), 10) - 1;
        if (workspaceLayouts[idx]) {
          handleSelectLayout(workspaceLayouts[idx]);
        }
      }
    }

    window.addEventListener('agent-ide:set-theme', onSetTheme);
    window.addEventListener('agent-ide:open-settings', onOpenSettings);
    window.addEventListener('agent-ide:open-folder', onOpenFolder);
    window.addEventListener('agent-ide:new-terminal', onNewTerminal);
    window.addEventListener('agent-ide:open-file-picker', onOpenFilePicker);
    window.addEventListener('agent-ide:open-symbol-search', onOpenSymbolSearch);
    window.addEventListener('agent-ide:open-diff-review', onOpenDiffReview);
    window.addEventListener('agent-ide:spawn-claude-template', onSpawnClaudeTemplate);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('agent-ide:set-theme', onSetTheme);
      window.removeEventListener('agent-ide:open-settings', onOpenSettings);
      window.removeEventListener('agent-ide:open-folder', onOpenFolder);
      window.removeEventListener('agent-ide:new-terminal', onNewTerminal);
      window.removeEventListener('agent-ide:open-file-picker', onOpenFilePicker);
      window.removeEventListener('agent-ide:open-symbol-search', onOpenSymbolSearch);
      window.removeEventListener('agent-ide:open-diff-review', onOpenDiffReview);
      window.removeEventListener('agent-ide:spawn-claude-template', onSpawnClaudeTemplate);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleProjectChange, setTheme, spawnSession, spawnClaudeSession, keybindings, workspaceLayouts, handleSelectLayout]);

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
    onNewClaude: () => void spawnClaudeSession(),
    onReorder: handleTerminalReorder,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FileViewerManager projectRoot={projectRoot}>
      <MultiBufferManager>
      <DiffReviewProvider>
      <AppLayoutConnected
        terminalControl={terminalControl}
        projectRoot={projectRoot}
        keybindings={keybindings}
        layoutProps={{
          layouts: workspaceLayouts,
          activeLayoutName,
          currentPanelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 250 },
          currentVisiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
          onSelectLayout: handleSelectLayout,
          onSaveLayout: handleSaveLayout,
          onUpdateLayout: handleUpdateLayout,
          onDeleteLayout: handleDeleteLayout,
        }}
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
        editorContent={<CentrePaneConnected />}
        agentCards={
          <RightSidebarTabs
            monitorContent={<AgentMonitorManager />}
            gitContent={<GitPanel />}
          />
        }
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
      </DiffReviewProvider>
      </MultiBufferManager>
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
