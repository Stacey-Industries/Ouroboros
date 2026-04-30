/**
 * ChatWorkbenchBody.rails — outer/inner rail composition for the chat workbench.
 *
 * Outer rail = projects (always). Inner sidebar shows chats / terminals / code
 * for the active project. Selecting a project sets `layout.activeProject`;
 * the inner Chats tab lists all chats whose workspaceRoot matches.
 */

import React, { useCallback, useMemo } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { OPEN_SETTINGS_EVENT } from '../../../hooks/appEventNames';
import { useConfig } from '../../../hooks/useConfig';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { AgentChatThreadRecord, ApprovalRequest } from '../../../types/electron';
import type {
  CompareState,
  DockState,
  LayoutState,
  SessionsState,
  WorkbenchHandlers,
} from './ChatWorkbenchBody.model';
import { InnerSidebar } from './InnerSidebar';
import { InnerSidebarChats } from './InnerSidebarChats';
import { InnerSidebarCode } from './InnerSidebarCode';
import { InnerSidebarTerminals } from './InnerSidebarTerminals';
import { OuterProjectRail } from './OuterProjectRail';

// ── Project list helpers ───────────────────────────────────────────────────────

function useWorkbenchProjects(): string[] {
  const { projectRoots } = useProject();
  const { config } = useConfig();
  return useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const p of [...projectRoots, ...(config?.recentProjects ?? [])]) {
      if (p && !seen.has(p)) {
        seen.add(p);
        merged.push(p);
      }
    }
    return merged;
  }, [projectRoots, config?.recentProjects]);
}

// ── Rail handlers ──────────────────────────────────────────────────────────────

interface RailHandlers {
  handleSelectProject: (path: string) => void;
  handleAddProject: (path: string) => void;
  handleRemoveProject: (path: string) => void;
  handleOpenSettings: () => void;
  handleSelectTab: (tab: Parameters<LayoutState['setActiveInnerTab']>[1]) => void;
}

function useRailHandlers(layout: LayoutState): RailHandlers {
  const activeProject = layout.activeProject;
  const { removeProjectRoot } = useProject();
  const { config, set: setConfig } = useConfig();
  const handleSelectProject = useCallback(
    (path: string) => layout.setActiveProject(path),
    [layout],
  );
  const handleAddProject = useCallback((path: string) => layout.setActiveProject(path), [layout]);
  const handleRemoveProject = useCallback(
    (path: string) => {
      removeProjectRoot(path);
      const recents = config?.recentProjects ?? [];
      if (recents.includes(path)) {
        void setConfig(
          'recentProjects',
          recents.filter((p) => p !== path),
        );
      }
      if (layout.activeProject === path) layout.setActiveProject(null);
    },
    [config?.recentProjects, layout, removeProjectRoot, setConfig],
  );
  const handleOpenSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
  }, []);
  const handleSelectTab = useCallback(
    (tab: Parameters<LayoutState['setActiveInnerTab']>[1]) => {
      if (activeProject) layout.setActiveInnerTab(activeProject, tab);
    },
    [layout, activeProject],
  );
  return {
    handleSelectProject,
    handleAddProject,
    handleRemoveProject,
    handleOpenSettings,
    handleSelectTab,
  };
}

// ── Inner tab contents ─────────────────────────────────────────────────────────

interface InnerTabContentsArgs {
  activeProject: string | null;
  approvalRequests: ApprovalRequest[];
  dock: DockState;
  handlers: WorkbenchHandlers;
  sessionsState: SessionsState;
  terminal?: UseTerminalSessionsReturn;
  threads: AgentChatThreadRecord[];
}

interface InnerTabContents {
  chats: React.ReactNode;
  terminals: React.ReactNode;
  code: React.ReactNode;
}

function buildInnerTabContents(args: InnerTabContentsArgs): InnerTabContents {
  const { activeProject, approvalRequests, dock, handlers, sessionsState, terminal, threads } =
    args;
  const openDock = (): void => {
    dock.setVisible(true);
  };
  return {
    chats: (
      <InnerSidebarChats
        activeProjectRoot={activeProject}
        activeThreadId={null}
        approvalRequests={approvalRequests}
        onCreateChat={() => {
          void handlers.handleCreateSession(activeProject ?? undefined);
        }}
        onSelectRecentChat={handlers.handleSelectRecentChat}
        sessions={sessionsState.sessions}
        threads={threads}
      />
    ),
    terminals: <InnerSidebarTerminals terminal={terminal} onActivateInDock={openDock} />,
    code: <InnerSidebarCode activeProject={activeProject} />,
  };
}

// ── Rail surface view ──────────────────────────────────────────────────────────

interface RailSurfaceViewProps {
  activeProject: string | null;
  activeTab: ReturnType<LayoutState['getProjectState']>['activeInnerTab'];
  projects: string[];
  railHandlers: RailHandlers;
  tabContents: InnerTabContents;
}

function RailSurfaceView(props: RailSurfaceViewProps): React.ReactElement {
  return (
    <>
      <OuterProjectRail
        projects={props.projects}
        activeProject={props.activeProject}
        onSelectProject={props.railHandlers.handleSelectProject}
        onAddProject={props.railHandlers.handleAddProject}
        onRemoveProject={props.railHandlers.handleRemoveProject}
        onOpenSettings={props.railHandlers.handleOpenSettings}
      />
      <InnerSidebar
        activeProject={props.activeProject}
        activeTab={props.activeTab}
        onSelectTab={props.railHandlers.handleSelectTab}
        chatsContent={props.tabContents.chats}
        terminalsContent={props.tabContents.terminals}
        codeContent={props.tabContents.code}
      />
    </>
  );
}

// ── Public entry ───────────────────────────────────────────────────────────────

export interface TwoTierRailSurfaceProps {
  layout: LayoutState;
  sessionsState: SessionsState;
  threads: AgentChatThreadRecord[];
  approvalRequests: ApprovalRequest[];
  compare: CompareState;
  handlers: WorkbenchHandlers;
  terminal?: UseTerminalSessionsReturn;
  dock: DockState;
}

export function TwoTierRailSurface(props: TwoTierRailSurfaceProps): React.ReactElement {
  const { layout, sessionsState, threads, approvalRequests, dock, handlers, terminal } = props;
  const activeProject = layout.activeProject;
  const projectState = layout.getProjectState(activeProject ?? '');
  return (
    <RailSurfaceView
      activeProject={activeProject}
      activeTab={projectState.activeInnerTab}
      projects={useWorkbenchProjects()}
      railHandlers={useRailHandlers(layout)}
      tabContents={buildInnerTabContents({
        activeProject,
        approvalRequests,
        dock,
        handlers,
        sessionsState,
        terminal,
        threads,
      })}
    />
  );
}
