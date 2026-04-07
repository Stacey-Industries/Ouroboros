/**
 * InnerAppLayout — renders the main application layout with all panels wired.
 *
 * Extracted from InnerApp's render method to reduce component size.
 */

import React, { useCallback } from 'react';

import type { WorkspaceLayout } from '../../types/electron';
import { AboutModal } from '../AboutModal';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SymbolSearch } from '../CommandPalette/SymbolSearch';
import type { Command } from '../CommandPalette/types';
import { DiffReviewProvider } from '../DiffReview';
import { ProjectPicker } from '../FileTree/ProjectPicker';
import { FileViewerManager } from '../FileViewer';
import { MultiBufferManager } from '../FileViewer/MultiBufferManager';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { PerformanceOverlay } from '../shared/PerformanceOverlay';
import { TerminalManager } from '../Terminal/TerminalManager';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import type { AppLayoutProps } from './AppLayout';
import { AppLayoutConnected } from './AppLayoutConnected';
import { CentrePaneConnected } from './CentrePaneConnected';
import { FilePickerConnected } from './FilePickerConnected';
import { IdeToolBridge } from './IdeToolBridge';
import { AgentSidebarContent } from './InnerAppLayout.agent';
import { SidebarSections } from './SidebarSections';

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

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

type ProjectPickerSlotProps = Pick<
  InnerAppLayoutProps,
  'projectRoot' | 'recentProjects' | 'handleProjectChange' | 'addProjectRoot' | 'setRecentProjects'
> & {
  rootCount: number;
};

type TerminalPanelContentProps = Pick<
  InnerAppLayoutProps,
  | 'sessions'
  | 'activeSessionId'
  | 'recordingSessions'
  | 'handleTerminalRestart'
  | 'handleTerminalClose'
  | 'handleTerminalTitleChange'
  | 'spawnSession'
  | 'handleToggleRecording'
  | 'handleSplit'
  | 'handleCloseSplit'
>;

type LayoutOverlaysProps = Pick<
  InnerAppLayoutProps,
  | 'paletteOpen'
  | 'closePalette'
  | 'commands'
  | 'recentIds'
  | 'handleExecute'
  | 'filePickerOpen'
  | 'setFilePickerOpen'
  | 'projectRoot'
  | 'symbolSearchOpen'
  | 'setSymbolSearchOpen'
  | 'perfOverlayVisible'
>;

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
    // These defaults are always overridden by AppLayout (which spreads live sizes from useResizable/usePanelCollapse).
    // They exist only to satisfy the StatusBarLayoutProps type at construction time.
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

function ProjectPickerSlot({
  projectRoot,
  recentProjects,
  handleProjectChange,
  addProjectRoot,
  setRecentProjects,
  rootCount,
}: ProjectPickerSlotProps): React.ReactElement {
  const handleAddProject = useCallback(
    (path: string) => {
      addProjectRoot(path);
      const updated = [path, ...recentProjects.filter((p) => p !== path)].slice(0, 10);
      setRecentProjects(updated);
      if (hasElectronAPI()) {
        void window.electronAPI.window.setProjectRoot(path);
        void window.electronAPI.config.set('recentProjects', updated);
      }
    },
    [addProjectRoot, recentProjects, setRecentProjects],
  );

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

function LayoutChrome(props: InnerAppLayoutProps): React.ReactElement {
  return (
    <AppLayoutConnected
      terminalControl={props.terminalControl}
      projectRoot={props.projectRoot}
      keybindings={props.keybindings}
      layoutProps={createLayoutProps(props)}
      sidebarHeader={<ProjectPickerSlot {...props} rootCount={props.projectRoots.length} />}
      sidebarContent={
        <ErrorBoundary label="File Tree">
          <SidebarSections />
        </ErrorBoundary>
      }
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
      <CommandPalette
        isOpen={paletteOpen}
        onClose={closePalette}
        commands={commands}
        recentIds={recentIds}
        onExecute={handleExecute}
      />
      <FilePickerConnected
        isOpen={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        projectRoot={projectRoot}
      />
      <SymbolSearch
        isOpen={symbolSearchOpen}
        onClose={() => setSymbolSearchOpen(false)}
        projectRoot={projectRoot}
      />
      <PerformanceOverlay visible={perfOverlayVisible} />
      <AboutModal />
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
