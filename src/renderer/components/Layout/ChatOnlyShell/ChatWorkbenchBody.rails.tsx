/**
 * ChatWorkbenchBody.rails — outer/inner rail composition for the chat workbench.
 *
 * Outer rail = projects (always). Inner sidebar shows chats / terminals / code
 * for the active project. Selecting a project sets `layout.activeProject`;
 * the inner Chats tab lists all chats whose workspaceRoot matches.
 */

import log from 'electron-log/renderer';
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

// Wave 82 — clear stale activeProject if it isn't in the merged project list.
// Without this, layout.activeProject persists in localStorage even after a
// project is removed, leaving the inner rail showing a project that the outer
// rail no longer contains.
//
// `isReady` gates the validator until both async sources (ProjectContext's
// getProjectRoots and useConfig's config.getAll) have resolved. On cold boot
// the localStorage-restored activeProject would otherwise be wiped because
// `projects` is transiently `[]` while the IPC calls are in flight, leaving
// the rail entry but no inner state — the user then has to remove and re-add
// the project to recover.
function useActiveProjectValidator(
  layout: LayoutState,
  projects: string[],
  isReady: boolean,
): void {
  const activeProject = layout.activeProject;
  React.useEffect(() => {
    if (!isReady) return;
    if (!activeProject) return;
    if (projects.includes(activeProject)) return;
    log.warn('[trace:rail] validator CLEARING activeProject', {
      activeProject,
      projects,
      isReady,
    });
    layout.setActiveProject(null);
  }, [activeProject, projects, layout, isReady]);
}

function useProjectsReady(): boolean {
  const { isLoaded: projectsLoaded } = useProject();
  const { isLoading: configLoading } = useConfig();
  return projectsLoaded && !configLoading;
}

// ── Rail handlers ──────────────────────────────────────────────────────────────

interface RailHandlers {
  handleSelectProject: (path: string) => void;
  handleAddProject: (path: string) => void;
  handleRemoveProject: (path: string) => void;
  handleOpenSettings: () => void;
  handleSelectTab: (tab: Parameters<LayoutState['setActiveInnerTab']>[1]) => void;
}

// Wave 82.1 — clicking a "recent" project on the rail used to call
// `layout.setActiveProject` only, leaving the project absent from
// `projectRoots`. Per-window roots (used by `pathSecurity` in the main
// process) are sourced from `projectRoots`, so `files:readDir` returned
// `{success:false}` and the file tree silently rendered as empty. Promoting
// the path via `addProjectRoot` (idempotent) registers it with the sandbox
// before activation.
function useProjectSelection(layout: LayoutState): {
  handleSelectOrAdd: (path: string) => void;
  handleRemoveProject: (path: string) => void;
} {
  const { addProjectRoot, removeProjectRoot } = useProject();
  const { config, set: setConfig } = useConfig();
  const handleSelectOrAdd = useCallback(
    (path: string) => {
      addProjectRoot(path);
      layout.setActiveProject(path);
    },
    [addProjectRoot, layout],
  );
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
  return { handleSelectOrAdd, handleRemoveProject };
}

function useRailHandlers(layout: LayoutState): RailHandlers {
  const activeProject = layout.activeProject;
  const { handleSelectOrAdd, handleRemoveProject } = useProjectSelection(layout);
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
    handleSelectProject: handleSelectOrAdd,
    handleAddProject: handleSelectOrAdd,
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
  const projects = useWorkbenchProjects();
  const isReady = useProjectsReady();
  log.info('[trace:rail] TwoTierRailSurface', {
    isReady,
    activeProject,
    projectsCount: projects.length,
    projects,
  });
  useActiveProjectValidator(layout, projects, isReady);
  return (
    <RailSurfaceView
      activeProject={activeProject}
      activeTab={projectState.activeInnerTab}
      projects={projects}
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
