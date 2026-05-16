import React, { Suspense } from 'react';

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
import { WorkbenchApprovalPrompt } from './WorkbenchApprovalPrompt';
import { WorkbenchRightPane } from './WorkbenchRightPane';

const ChatWorkbenchTerminalDock = React.lazy(() =>
  import('./ChatWorkbenchTerminalDock').then((m) => ({ default: m.ChatWorkbenchTerminalDock })),
);

// ── Two-tier rail ─────────────────────────────────────────────────────────────
//
// TwoTierRailSurface lives in ChatWorkbenchBody.rails.tsx. Re-exported here for
// existing import sites.
export { TwoTierRailSurface, type TwoTierRailSurfaceProps } from './ChatWorkbenchBody.rails';

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
}): React.ReactElement | null {
  if (!layout.rightPaneOpen || !layout.rightPaneView) return null;
  const handleClose = (): void => {
    if (layout.rightPaneView === 'artifact') surfacePolicy.closeArtifact();
    else surfacePolicy.closeUtility();
  };
  return (
    <WorkbenchRightPane
      view={layout.rightPaneView}
      activeUtilityTab={layout.activeUtilityTab}
      onSelectUtilityTab={layout.setActiveUtilityTab}
      onSelectView={layout.setRightPaneView}
      onClose={handleClose}
      activeProject={layout.activeProject}
    />
  );
}

// ── Terminal surface ───────────────────────────────────────────────────────────

function WorkbenchTerminalSurface({
  dock,
  onActiveSessionChange,
}: {
  dock: DockState;
  onActiveSessionChange?: (sessionId: string | null) => void;
}): React.ReactElement | null {
  if (!dock.visible) return null;
  return (
    <Suspense fallback={null}>
      <ChatWorkbenchTerminalDock
        onClose={() => dock.setVisible(false)}
        onActiveSessionChange={onActiveSessionChange}
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
  onActiveSessionChange,
}: {
  compare: CompareState;
  dock: DockState;
  layout: LayoutState;
  projectRoot: string | null;
  surfacePolicy: SurfacePolicyState;
  onActiveSessionChange?: (sessionId: string | null) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0">
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <WorkbenchCenterPane compare={compare} projectRoot={projectRoot} />
        <WorkbenchSidePanels layout={layout} surfacePolicy={surfacePolicy} />
      </div>
      <WorkbenchTerminalSurface dock={dock} onActiveSessionChange={onActiveSessionChange} />
    </div>
  );
}
