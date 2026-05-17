import React, { Suspense } from 'react';

import type { AgentChatThreadRecord, ApprovalRequest } from '../../../types/electron';
import type {
  LayoutState,
  SessionsState,
  SurfacePolicyState,
  WorkbenchHandlers,
} from './ChatWorkbenchBody.model';
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

// ── Main column ────────────────────────────────────────────────────────────────
//
// Wave 89 Phase 4b (terminal-first pivot): the dock-main-area wrapper is now
// the positioned ancestor for OverlayDrawer instances. The chat surface
// (AgentChatWorkspace / WorkbenchCenterPane) is no longer mounted here —
// it lives in the IDE shell (InnerAppLayout). The dock fills the full
// available height via flex-1 instead of a fixed px height.
//
// Layout: rail | dock-main-area (flex-1, position:relative)
//   dock-main-area contains:
//     - ChatWorkbenchTerminalDock (flex-1, fills parent)
//     - ChatWorkbenchOverlays (absolute-positioned over the dock)

export interface WorkbenchMainColumnProps {
  layout: LayoutState;
  surfacePolicy: SurfacePolicyState;
  overlayWidths: UseOverlayDrawerWidthsReturn;
  onActiveSessionChange?: (sessionId: string | null) => void;
}

export function WorkbenchMainColumn({
  layout,
  surfacePolicy,
  overlayWidths,
  onActiveSessionChange,
}: WorkbenchMainColumnProps): React.ReactElement {
  return (
    // `relative` provides the positioned ancestor for OverlayDrawer (Phase 4b).
    // The dock fills this area via flex-1; overlays float over the right portion.
    <div
      className="relative flex flex-1 min-w-0 min-h-0 overflow-hidden"
      data-testid="workbench-dock-main-area"
    >
      <Suspense fallback={null}>
        <ChatWorkbenchTerminalDock
          onActiveSessionChange={onActiveSessionChange}
        />
      </Suspense>
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
  );
}
