/**
 * InnerAppLayout — renders the main application layout with all panels wired.
 *
 * Extracted from InnerApp's render method to reduce component size.
 */

import React, { type ErrorInfo,useCallback, useReducer } from 'react';

import type { WorkspaceLayout } from '../../types/electron';
import { AgentChatWorkspace } from '../AgentChat/AgentChatWorkspace';
import type { AgentChatWorkspaceModel } from '../AgentChat/useAgentChatWorkspace';
import { AgentMonitorManager } from '../AgentMonitor';
import type { Command } from '../CommandPalette/types';
import { DiffReviewProvider } from '../DiffReview';
import { ProjectPicker } from '../FileTree/ProjectPicker';
import { FileViewerManager } from '../FileViewer';
import { MultiBufferManager } from '../FileViewer/MultiBufferManager';
import { GitPanel } from '../GitPanel';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import type { AppLayoutProps } from './AppLayout';
import { AppLayoutConnected } from './AppLayoutConnected';
import { CentrePaneConnected } from './CentrePaneConnected';
import { FilePickerConnected } from './FilePickerConnected';
import { RightSidebarTabs } from './RightSidebarTabs';
const AnalyticsDashboard = React.lazy(() => import('../Analytics').then(m => ({ default: m.AnalyticsDashboard })));
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SymbolSearch } from '../CommandPalette/SymbolSearch';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { PerformanceOverlay } from '../shared/PerformanceOverlay';
import { TerminalManager } from '../Terminal/TerminalManager';
// Inline ChatErrorBoundary — kept inline specifically for the chat sidebar because Vite HMR
// can fail to resolve the shared ErrorBoundary module exactly when a crash recovery is needed.
class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ChatErrorBoundary] caught:', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center"
          style={{ color: 'var(--text-muted)', minHeight: 120 }}>
          <span className="text-sm font-medium" style={{ color: 'var(--error, #f85149)' }}>
            Chat crashed
          </span>
          <span className="text-xs">{this.state.error?.message ?? 'An unexpected error occurred.'}</span>
          <button className="mt-1 rounded px-3 py-1 text-xs"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { IdeToolBridge } from './IdeToolBridge';
import { SidebarSections } from './SidebarSections';
import { ExtensionsPanel,GitSidebarPanel, SearchPanel } from './SidebarViewPanels';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface InnerAppLayoutProps {
  projectRoot: string | null;
  projectRoots: string[];
  addProjectRoot: (path: string) => void;
  recentProjects: string[];
  setRecentProjects: React.Dispatch<React.SetStateAction<string[]>>;
  handleProjectChange: (path: string) => Promise<void>;
  keybindings: Record<string, string>;
  // Layout
  workspaceLayouts: WorkspaceLayout[];
  activeLayoutName: string;
  handleSelectLayout: (layout: WorkspaceLayout) => void;
  handleSaveLayout: (name: string) => void;
  handleUpdateLayout: (name: string) => void;
  handleDeleteLayout: (name: string) => void;
  // Terminal
  terminalControl: AppLayoutProps['terminalControl'];
  sessions: TerminalSession[];
  activeSessionId: string | null;
  recordingSessions: Set<string>;
  handleTerminalRestart: (id: string) => Promise<void>;
  handleTerminalClose: (id: string) => void;
  handleTerminalTitleChange: (id: string, title: string) => void;
  spawnSession: (cwd?: string) => Promise<void>;
  handleToggleRecording: (id: string) => Promise<void>;
  handleSplit: (id: string) => Promise<void>;
  handleCloseSplit: (id: string) => void;
  // Command palette
  paletteOpen: boolean;
  closePalette: () => void;
  commands: Command[];
  recentIds: string[];
  handleExecute: (command: Command) => Promise<void>;
  // Overlays
  filePickerOpen: boolean;
  setFilePickerOpen: (v: boolean) => void;
  symbolSearchOpen: boolean;
  setSymbolSearchOpen: (v: boolean) => void;
  perfOverlayVisible: boolean;
}

type ProjectPickerSlotProps = Pick<
  InnerAppLayoutProps,
  'projectRoot' | 'recentProjects' | 'handleProjectChange' | 'addProjectRoot' | 'setRecentProjects'
> & {
  rootCount: number;
};

type TerminalPanelContentProps = Pick<
  InnerAppLayoutProps,
  'sessions' | 'activeSessionId' | 'recordingSessions' | 'handleTerminalRestart' | 'handleTerminalClose' |
  'handleTerminalTitleChange' | 'spawnSession' | 'handleToggleRecording' | 'handleSplit' | 'handleCloseSplit'
>;

type LayoutOverlaysProps = Pick<
  InnerAppLayoutProps,
  'paletteOpen' | 'closePalette' | 'commands' | 'recentIds' | 'handleExecute' |
  'filePickerOpen' | 'setFilePickerOpen' | 'projectRoot' |
  'symbolSearchOpen' | 'setSymbolSearchOpen' | 'perfOverlayVisible'
>;

function ProjectPickerSlot({
  projectRoot,
  recentProjects,
  handleProjectChange,
  addProjectRoot,
  setRecentProjects,
  rootCount,
}: ProjectPickerSlotProps): React.ReactElement {
  const handleAddProject = useCallback((path: string) => {
    addProjectRoot(path);
    const updated = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 10);
    setRecentProjects(updated);
    if (hasElectronAPI()) void window.electronAPI.config.set('recentProjects', updated);
  }, [addProjectRoot, recentProjects, setRecentProjects]);

  return (
    <ProjectPicker
      currentPath={projectRoot}
      recentProjects={recentProjects}
      onSelectProject={(path) => void handleProjectChange(path)}
      onAddProject={handleAddProject}
      rootCount={rootCount}
    />
  );
}

function createLayoutProps(props: InnerAppLayoutProps): AppLayoutProps['layoutProps'] {
  const {
    workspaceLayouts,
    activeLayoutName,
    handleSelectLayout,
    handleSaveLayout,
    handleUpdateLayout,
    handleDeleteLayout,
  } = props;

  return {
    layouts: workspaceLayouts,
    activeLayoutName,
    currentPanelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 250 },
    currentVisiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
    onSelectLayout: handleSelectLayout,
    onSaveLayout: handleSaveLayout,
    onUpdateLayout: handleUpdateLayout,
    onDeleteLayout: handleDeleteLayout,
  };
}

function LayoutProviders({
  projectRoot,
  children,
}: React.PropsWithChildren<{
  projectRoot: string | null;
}>): React.ReactElement {
  return (
    <ErrorBoundary label="Editor">
      <FileViewerManager projectRoot={projectRoot}>
        <IdeToolBridge />
        <MultiBufferManager>
          <DiffReviewProvider>{children}</DiffReviewProvider>
        </MultiBufferManager>
      </FileViewerManager>
    </ErrorBoundary>
  );
}

function AgentSidebarContent({ projectRoot }: { projectRoot: string | null }): React.ReactElement {
  // Force re-render counter — used to propagate model updates from AgentChatWorkspace
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  const modelRef = React.useRef<AgentChatWorkspaceModel | null>(null);

  const handleModelReady = useCallback((model: AgentChatWorkspaceModel) => {
    // Only trigger re-render when data the header cares about actually changes
    const prev = modelRef.current;
    const threadsChanged = prev?.threads !== model.threads;
    const activeChanged = prev?.activeThreadId !== model.activeThreadId;
    modelRef.current = model;
    if (threadsChanged || activeChanged || !prev) {
      forceRender();
    }
  }, []);

  const chatModel = modelRef.current;

  return (
    <RightSidebarTabs
      chatContent={<ChatErrorBoundary><AgentChatWorkspace projectRoot={projectRoot} onModelReady={handleModelReady} /></ChatErrorBoundary>}
      monitorContent={<ErrorBoundary label="Agent Monitor"><AgentMonitorManager /></ErrorBoundary>}
      gitContent={<ErrorBoundary label="Git Panel"><GitPanel /></ErrorBoundary>}
      analyticsContent={<ErrorBoundary label="Analytics"><React.Suspense fallback={<div />}><AnalyticsDashboard /></React.Suspense></ErrorBoundary>}
      threads={chatModel?.threads}
      activeThreadId={chatModel?.activeThreadId}
      onSelectThread={chatModel?.selectThread}
      onDeleteThread={chatModel ? (id) => void chatModel.deleteThread(id) : undefined}
      onNewChat={chatModel?.startNewChat}
    />
  );
}

function TerminalPanelContent({
  sessions,
  activeSessionId,
  recordingSessions,
  handleTerminalRestart,
  handleTerminalClose,
  handleTerminalTitleChange,
  spawnSession,
  handleToggleRecording,
  handleSplit,
  handleCloseSplit,
}: TerminalPanelContentProps): React.ReactElement {
  return (
    <ErrorBoundary label="Terminal">
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
    </ErrorBoundary>
  );
}

function SidebarViewHeader({ title }: { title: string }): React.ReactElement {
  return (
    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
      {title}
    </span>
  );
}

function LayoutChrome(props: InnerAppLayoutProps): React.ReactElement {
  return (
    <AppLayoutConnected
      terminalControl={props.terminalControl}
      projectRoot={props.projectRoot}
      keybindings={props.keybindings}
      layoutProps={createLayoutProps(props)}
      sidebarHeader={<ProjectPickerSlot {...props} rootCount={props.projectRoots.length} />}
      sidebarContent={<ErrorBoundary label="File Tree"><SidebarSections /></ErrorBoundary>}
      sidebarViewContent={{
        search: <SearchPanel />,
        git: <GitSidebarPanel />,
        extensions: <ExtensionsPanel />,
      }}
      sidebarViewHeaders={{
        search: <SidebarViewHeader title="Search" />,
        git: <SidebarViewHeader title="Source Control" />,
        extensions: <SidebarViewHeader title="Extensions" />,
      }}
      editorContent={<CentrePaneConnected />}
      agentCards={<AgentSidebarContent projectRoot={props.projectRoot} />}
      terminalContent={<TerminalPanelContent {...props} />}
    />
  );
}

function LayoutOverlays({
  paletteOpen,
  closePalette,
  commands,
  recentIds,
  handleExecute,
  filePickerOpen,
  setFilePickerOpen,
  projectRoot,
  symbolSearchOpen,
  setSymbolSearchOpen,
  perfOverlayVisible,
}: LayoutOverlaysProps): React.ReactElement {
  return (
    <>
      <CommandPalette isOpen={paletteOpen} onClose={closePalette} commands={commands} recentIds={recentIds} onExecute={handleExecute} />
      <FilePickerConnected isOpen={filePickerOpen} onClose={() => setFilePickerOpen(false)} projectRoot={projectRoot} />
      <SymbolSearch isOpen={symbolSearchOpen} onClose={() => setSymbolSearchOpen(false)} projectRoot={projectRoot} />
      <PerformanceOverlay visible={perfOverlayVisible} />
    </>
  );
}

export function InnerAppLayout(props: InnerAppLayoutProps): React.ReactElement {
  return (
    <LayoutProviders projectRoot={props.projectRoot}>
      <LayoutChrome {...props} />
      <LayoutOverlays {...props} />
    </LayoutProviders>
  );
}
