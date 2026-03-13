/**
 * InnerAppLayout — renders the main application layout with all panels wired.
 *
 * Extracted from InnerApp's render method to reduce component size.
 */

import React, { useCallback } from 'react';
import type { AppLayoutProps } from './AppLayout';
import type { WorkspaceLayout } from '../../types/electron';
import type { Command } from '../CommandPalette/types';
import type { TerminalSession } from '../Terminal/TerminalTabs';

import { AppLayoutConnected } from './AppLayoutConnected';
import { EditorTabBar } from './EditorTabBar';
import { CentrePaneConnected } from './CentrePaneConnected';
import { FilePickerConnected } from './FilePickerConnected';
import { ProjectPicker } from '../FileTree/ProjectPicker';
import { FileViewerManager } from '../FileViewer';
import { MultiBufferManager } from '../FileViewer/MultiBufferManager';
import { DiffReviewProvider } from '../DiffReview';
import { RightSidebarTabs } from './RightSidebarTabs';
import { AgentMonitorManager } from '../AgentMonitor/AgentMonitorManager';
import { GitPanel } from '../GitPanel';
import { AnalyticsDashboard } from '../Analytics';
import { TerminalManager } from '../Terminal/TerminalManager';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { SymbolSearch } from '../CommandPalette/SymbolSearch';
import { PerformanceOverlay } from '../shared/PerformanceOverlay';
import { SidebarFileTree } from './SidebarFileTree';
import { IdeToolBridge } from './IdeToolBridge';

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

function ProjectPickerSlot({
  projectRoot,
  recentProjects,
  handleProjectChange,
  addProjectRoot,
  setRecentProjects,
  rootCount,
}: {
  projectRoot: string | null;
  recentProjects: string[];
  handleProjectChange: (path: string) => Promise<void>;
  addProjectRoot: (path: string) => void;
  setRecentProjects: React.Dispatch<React.SetStateAction<string[]>>;
  rootCount: number;
}): React.ReactElement {
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

export function InnerAppLayout(props: InnerAppLayoutProps): React.ReactElement {
  const {
    projectRoot, projectRoots, addProjectRoot,
    recentProjects, setRecentProjects, handleProjectChange,
    keybindings, workspaceLayouts, activeLayoutName,
    handleSelectLayout, handleSaveLayout, handleUpdateLayout, handleDeleteLayout,
    terminalControl, sessions, activeSessionId,
    recordingSessions, handleTerminalRestart, handleTerminalClose,
    handleTerminalTitleChange, spawnSession, handleToggleRecording,
    handleSplit, handleCloseSplit,
    paletteOpen, closePalette, commands, recentIds, handleExecute,
    filePickerOpen, setFilePickerOpen, symbolSearchOpen, setSymbolSearchOpen,
    perfOverlayVisible,
  } = props;

  return (
    <FileViewerManager projectRoot={projectRoot}>
      <IdeToolBridge />
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
          <ProjectPickerSlot
            projectRoot={projectRoot}
            recentProjects={recentProjects}
            handleProjectChange={handleProjectChange}
            addProjectRoot={addProjectRoot}
            setRecentProjects={setRecentProjects}
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
            analyticsContent={<AnalyticsDashboard />}
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
      </DiffReviewProvider>
      </MultiBufferManager>
    </FileViewerManager>
  );
}
