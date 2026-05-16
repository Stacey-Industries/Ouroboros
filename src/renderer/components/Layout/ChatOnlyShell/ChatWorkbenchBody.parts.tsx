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
import { ChatWorkbenchOverlays } from './ChatWorkbenchOverlays';
import type { UseOverlayDrawerWidthsReturn } from './useOverlayDrawerWidths';
import { WorkbenchApprovalPrompt } from './WorkbenchApprovalPrompt';

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
//
// Wave 89 Phase 3: the chat-area row (`flex flex-1 min-h-0 min-w-0 relative`)
// is the positioned ancestor that OverlayDrawer instances anchor to.
// Both utility and artifact overlays tile horizontally over this area —
// no longer occupying fixed flex slots.

export interface WorkbenchMainColumnProps {
  compare: CompareState;
  dock: DockState;
  layout: LayoutState;
  projectRoot: string | null;
  surfacePolicy: SurfacePolicyState;
  overlayWidths: UseOverlayDrawerWidthsReturn;
  onActiveSessionChange?: (sessionId: string | null) => void;
}

export function WorkbenchMainColumn({
  compare,
  dock,
  layout,
  projectRoot,
  surfacePolicy,
  overlayWidths,
  onActiveSessionChange,
}: WorkbenchMainColumnProps): React.ReactElement {
  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0">
      {/* `relative` provides the positioned ancestor for OverlayDrawer (Phase 3). */}
      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <WorkbenchCenterPane compare={compare} projectRoot={projectRoot} />
        <ChatWorkbenchOverlays
          utilityOpen={layout.utilityOpen}
          artifactOpen={layout.artifactOpen}
          activeUtilityTab={layout.activeUtilityTab}
          onSelectUtilityTab={layout.setActiveUtilityTab}
          onCloseUtility={surfacePolicy.closeUtility}
          onCloseArtifact={surfacePolicy.closeArtifact}
          activeProject={layout.activeProject}
          overlayWidths={overlayWidths}
        />
      </div>
      <WorkbenchTerminalSurface dock={dock} onActiveSessionChange={onActiveSessionChange} />
    </div>
  );
}
