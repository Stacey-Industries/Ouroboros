import React, { Suspense } from 'react';

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
