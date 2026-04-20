/**
 * InnerAppLayout — renders the main application layout with all panels wired.
 *
 * Extracted from InnerApp's render method to reduce component size.
 * Overlay sub-components live in InnerAppLayout.overlays.tsx.
 */

import React, { useCallback } from 'react';

import { MobileLayoutProvider } from '../../contexts/MobileLayoutContext';
import { useChatWindowMode } from '../../hooks/useChatWindowMode';
import { useSystemBack } from '../../hooks/useSystemBack';
import type { WorkspaceLayout } from '../../types/electron';
import { AgentChatWorkspace } from '../AgentChat/AgentChatWorkspace';
import type { Command } from '../CommandPalette/types';
import { DiffReviewProvider } from '../DiffReview';
import { ProjectPicker } from '../FileTree/ProjectPicker';
import { FileViewerManager } from '../FileViewer';
import { MultiBufferManager } from '../FileViewer/MultiBufferManager';
import { SessionSidebar } from '../SessionSidebar/SessionSidebar';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { TerminalManager } from '../Terminal/TerminalManager';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import type { AppLayoutProps } from './AppLayout';
import { AppLayoutConnected } from './AppLayoutConnected';
import { CentrePaneConnected } from './CentrePaneConnected';
import { IdeToolBridge } from './IdeToolBridge';
import { AgentSidebarContent } from './InnerAppLayout.agent';
import { LayoutOverlays } from './InnerAppLayout.overlays';
import { LayoutPresetResolverProvider, useLayoutPreset } from './layoutPresets';
import { useChatPrimaryFlag } from './layoutPresets/LayoutPresetResolver';
import { NoDragZone } from './NoDragZone';
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
  persistTerminalSessions: boolean;
}

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

type ProjectPickerSlotProps = Pick<
  InnerAppLayoutProps,
  'projectRoot' | 'recentProjects' | 'handleProjectChange' | 'addProjectRoot' | 'setRecentProjects'
> & { rootCount: number };

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

function createLayoutProps(props: InnerAppLayoutProps): AppLayoutProps['layoutProps'] {
  const { workspaceLayouts, activeLayoutName, handleSelectLayout, handleSaveLayout, handleUpdateLayout, handleDeleteLayout } = props;
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

function LayoutProviders({ projectRoot, children }: React.PropsWithChildren<{ projectRoot: string | null }>): React.ReactElement {
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
  sessions, activeSessionId, recordingSessions, handleTerminalRestart,
  handleTerminalClose, handleTerminalTitleChange, spawnSession,
  handleToggleRecording, handleSplit, handleCloseSplit,
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
  projectRoot, recentProjects, handleProjectChange, addProjectRoot, setRecentProjects, rootCount,
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
  // Mounted inside MobileLayoutProvider — context is available.
  useSystemBack();
  // The preset declares which component goes in each slot (e.g. chat-primary
  // puts AgentChatWorkspace in editorContent and SessionSidebar in sidebarContent).
  // The plain ide-primary preset keeps the file tree + editor. Route based on
  // preset id — the preset's `slots.componentKey` values are descriptive only;
  // actual component wiring lives here.
  const { preset } = useLayoutPreset();
  const chatMode = preset.id === 'chat-primary';
  return (
    <AppLayoutConnected
      terminalControl={props.terminalControl}
      projectRoot={props.projectRoot}
      keybindings={props.keybindings}
      layoutProps={createLayoutProps(props)}
      sidebarHeader={<ProjectPickerSlot {...props} rootCount={props.projectRoots.length} />}
      sidebarContent={
        chatMode
          ? <ErrorBoundary label="Sessions"><SessionSidebar /></ErrorBoundary>
          : <ErrorBoundary label="File Tree"><SidebarSections /></ErrorBoundary>
      }
      editorContent={
        chatMode
          ? <ErrorBoundary label="Chat"><AgentChatWorkspace projectRoot={props.projectRoot} /></ErrorBoundary>
          : <CentrePaneConnected />
      }
      agentCards={<AgentSidebarContent projectRoot={props.projectRoot} />}
      terminalContent={<NoDragZone><TerminalPanelContent {...props} /></NoDragZone>}
    />
  );
}

export function InnerAppLayout(props: InnerAppLayoutProps): React.ReactElement {
  const { isChatWindow } = useChatWindowMode();
  // When the user has toggled "Start in chat mode" in Settings, the main window
  // boots into the chat-primary preset just like a dedicated chat window does.
  const chatPrimary = useChatPrimaryFlag();
  const forcePresetId = isChatWindow || chatPrimary ? 'chat-primary' : undefined;
  return (
    <LayoutPresetResolverProvider forcePresetId={forcePresetId}>
      <LayoutProviders projectRoot={props.projectRoot}>
        <MobileLayoutProvider>
          <LayoutChrome {...props} />
          <LayoutOverlays {...props} />
        </MobileLayoutProvider>
      </LayoutProviders>
    </LayoutPresetResolverProvider>
  );
}
