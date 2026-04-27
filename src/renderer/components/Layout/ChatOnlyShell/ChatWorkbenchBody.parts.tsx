import React, { Suspense, useCallback, useMemo } from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { useConfig } from '../../../hooks/useConfig';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { AgentChatThreadRecord, ApprovalRequest } from '../../../types/electron';
import { AgentChatWorkspace } from '../../AgentChat/AgentChatWorkspace';
import type {
  CompareState,
  DockState,
  LayoutState,
  SessionsState,
  SurfacePolicyState,
  WorkbenchHandlers,
} from './ChatWorkbenchBody.model';
import { ChatWorkbenchComparePane } from './ChatWorkbenchComparePane';
import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';
import { InnerSidebar } from './InnerSidebar';
import { InnerSidebarChats } from './InnerSidebarChats';
import { InnerSidebarCode } from './InnerSidebarCode';
import { InnerSidebarTerminals } from './InnerSidebarTerminals';
import { OuterProjectRail } from './OuterProjectRail';
import { WorkbenchApprovalPrompt } from './WorkbenchApprovalPrompt';

const ChatWorkbenchTerminalDock = React.lazy(() =>
  import('./ChatWorkbenchTerminalDock').then((m) => ({ default: m.ChatWorkbenchTerminalDock })),
);
const ChatWorkbenchArtifactPane = React.lazy(() =>
  import('./ChatWorkbenchArtifactPane').then((m) => ({ default: m.ChatWorkbenchArtifactPane })),
);

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

// ── Two-tier rail ─────────────────────────────────────────────────────────────

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

function useRailHandlers(layout: LayoutState): {
  handleSelectProject: (path: string) => void;
  handleAddProject: (path: string) => void;
  handleOpenSettings: () => void;
  handleSelectTab: (tab: Parameters<typeof layout.setActiveInnerTab>[1]) => void;
} {
  const activeProject = layout.activeProject;
  const handleSelectProject = useCallback(
    (path: string) => layout.setActiveProject(path),
    [layout],
  );
  const handleAddProject = useCallback((path: string) => layout.setActiveProject(path), [layout]);
  const handleOpenSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('agent-ide:open-settings'));
  }, []);
  const handleSelectTab = useCallback(
    (tab: Parameters<typeof layout.setActiveInnerTab>[1]) => {
      if (activeProject) layout.setActiveInnerTab(activeProject, tab);
    },
    [layout, activeProject],
  );
  return { handleSelectProject, handleAddProject, handleOpenSettings, handleSelectTab };
}

function buildInnerTabContents(props: {
  activeProject: string | null;
  approvalRequests: ApprovalRequest[];
  compare: CompareState;
  dock: DockState;
  handlers: WorkbenchHandlers;
  sessionsState: SessionsState;
  terminal?: UseTerminalSessionsReturn;
  threads: AgentChatThreadRecord[];
}): {
  chats: React.ReactNode;
  terminals: React.ReactNode;
  code: React.ReactNode;
} {
  const { activeProject, approvalRequests, compare, dock, handlers, sessionsState, terminal, threads } = props;
  const openDock = (): void => {
    dock.setVisible(true);
  };
  return {
    chats: (
      <InnerSidebarChats
        activeSessionId={sessionsState.activeSessionId}
        activeThreadId={null}
        approvalRequests={approvalRequests}
        compareSessionId={compare.compareTarget?.sessionId ?? null}
        onCompareSession={compare.beginCompare}
        onCreateSession={() => {
          void handlers.handleCreateSession();
        }}
        onSelectRecentChat={handlers.handleSelectRecentChat}
        onSelectSession={handlers.handleSelectSession}
        sessions={sessionsState.sessions}
        threads={threads}
      />
    ),
    terminals: <InnerSidebarTerminals terminal={terminal} onActivateInDock={openDock} />,
    code: <InnerSidebarCode activeProject={activeProject} />,
  };
}

function RailSurfaceView(props: {
  activeProject: string | null;
  activeTab: ReturnType<LayoutState['getProjectState']>['activeInnerTab'];
  projects: string[];
  railHandlers: ReturnType<typeof useRailHandlers>;
  tabContents: ReturnType<typeof buildInnerTabContents>;
}): React.ReactElement {
  const { activeProject, activeTab, projects, railHandlers, tabContents } = props;
  return (
    <>
      <OuterProjectRail
        projects={projects}
        activeProject={activeProject}
        onSelectProject={railHandlers.handleSelectProject}
        onAddProject={railHandlers.handleAddProject}
        onOpenSettings={railHandlers.handleOpenSettings}
      />
      <InnerSidebar
        activeProject={activeProject}
        activeTab={activeTab}
        onSelectTab={railHandlers.handleSelectTab}
        chatsContent={tabContents.chats}
        terminalsContent={tabContents.terminals}
        codeContent={tabContents.code}
      />
    </>
  );
}

export function TwoTierRailSurface(props: TwoTierRailSurfaceProps): React.ReactElement {
  const { layout, ...rest } = props;
  const activeProject = layout.activeProject;
  const projectState = layout.getProjectState(activeProject ?? '');
  return (
    <RailSurfaceView
      activeProject={activeProject}
      activeTab={projectState.activeInnerTab}
      projects={useWorkbenchProjects()}
      railHandlers={useRailHandlers(layout)}
      tabContents={buildInnerTabContents({ activeProject, ...rest })}
    />
  );
}

// ── Approval surface ───────────────────────────────────────────────────────────

export function WorkbenchApprovalSurface({
  activeApprovalSessionIds,
  approvalRequests,
  handlers,
  sessionsState,
  threads,
}: {
  activeApprovalSessionIds: Array<string | null | undefined>;
  approvalRequests: ApprovalRequest[];
  handlers: WorkbenchHandlers;
  sessionsState: SessionsState;
  threads: AgentChatThreadRecord[];
}): React.ReactElement {
  return (
    <WorkbenchApprovalPrompt
      requests={approvalRequests}
      activeSessionIds={activeApprovalSessionIds}
      sessions={sessionsState.sessions}
      threads={threads}
      onSelectSession={handlers.handleSelectSession}
      onSelectThread={handlers.handleSelectRecentChat}
    />
  );
}

// ── Centre pane ────────────────────────────────────────────────────────────────

function WorkbenchCenterPane({
  compare,
  projectRoot,
}: {
  compare: CompareState;
  projectRoot: string | null;
}): React.ReactElement {
  const workspaceClass = compare.isComparing ? 'w-1/2 border-r border-border-semantic' : 'w-full';
  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 gap-0 px-4 xl:px-6">
        <div className={`flex min-w-0 ${workspaceClass} flex-col overflow-hidden`}>
          <AgentChatWorkspace projectRoot={projectRoot} variant="chat-only" />
        </div>
        {compare.compareTarget && (
          <ChatWorkbenchComparePane
            projectRoot={compare.compareTarget.projectRoot}
            threadId={compare.compareTarget.threadId}
            sessionId={compare.compareTarget.sessionId}
            projectLabel={compare.compareTarget.projectLabel}
            onClose={compare.closeCompare}
          />
        )}
      </div>
    </main>
  );
}

// ── Side panels ────────────────────────────────────────────────────────────────

function WorkbenchSidePanels({
  layout,
  surfacePolicy,
}: {
  layout: LayoutState;
  surfacePolicy: SurfacePolicyState;
}): React.ReactElement {
  return (
    <>
      {layout.artifactOpen && (
        <Suspense fallback={null}>
          <ChatWorkbenchArtifactPane onClose={surfacePolicy.closeArtifact} />
        </Suspense>
      )}
      {layout.utilityOpen && (
        <ChatWorkbenchUtilityDrawer
          activeTab={layout.activeUtilityTab}
          onSelectTab={layout.setActiveUtilityTab}
          onClose={surfacePolicy.closeUtility}
        />
      )}
    </>
  );
}

// ── Terminal surface ───────────────────────────────────────────────────────────

function UnavailableTerminalDock(): React.ReactElement {
  return (
    <section
      className="h-40 shrink-0 border-t border-border-semantic bg-surface-panel/90 px-3 py-3"
      data-testid="chat-workbench-terminal-dock-unavailable"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
        Terminal
      </div>
      <p className="mt-2 text-sm text-text-semantic-secondary">
        Terminal sessions are not available in this window.
      </p>
    </section>
  );
}

function WorkbenchTerminalSurface({
  dock,
  terminal,
}: {
  dock: DockState;
  terminal?: UseTerminalSessionsReturn;
}): React.ReactElement | null {
  if (!dock.visible) return null;
  if (!terminal) return <UnavailableTerminalDock />;
  return (
    <Suspense fallback={null}>
      <ChatWorkbenchTerminalDock
        terminal={terminal}
        height={dock.height}
        onHeightChange={dock.setHeight}
        onClose={() => dock.setVisible(false)}
      />
    </Suspense>
  );
}

// ── Main column ────────────────────────────────────────────────────────────────

export function WorkbenchMainColumn({
  compare,
  dock,
  layout,
  projectRoot,
  surfacePolicy,
  terminal,
}: {
  compare: CompareState;
  dock: DockState;
  layout: LayoutState;
  projectRoot: string | null;
  surfacePolicy: SurfacePolicyState;
  terminal?: UseTerminalSessionsReturn;
}): React.ReactElement {
  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0">
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <WorkbenchCenterPane compare={compare} projectRoot={projectRoot} />
        <WorkbenchSidePanels layout={layout} surfacePolicy={surfacePolicy} />
      </div>
      <WorkbenchTerminalSurface dock={dock} terminal={terminal} />
    </div>
  );
}
