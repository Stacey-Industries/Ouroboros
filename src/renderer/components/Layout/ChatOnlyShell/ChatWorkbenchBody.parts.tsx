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
import { ChatWorkbenchUtilityDrawer } from './ChatWorkbenchUtilityDrawer';
import { WorkbenchApprovalPrompt } from './WorkbenchApprovalPrompt';
import { WorkbenchRail } from './WorkbenchRail';

const ChatWorkbenchTerminalDock = React.lazy(() =>
  import('./ChatWorkbenchTerminalDock').then((m) => ({ default: m.ChatWorkbenchTerminalDock })),
);
const ChatWorkbenchArtifactPane = React.lazy(() =>
  import('./ChatWorkbenchArtifactPane').then((m) => ({ default: m.ChatWorkbenchArtifactPane })),
);

function ShellToggleButton({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      onClick={onClick}
      aria-pressed={pressed}
    >
      {label}
    </button>
  );
}

function WorkbenchToggleRow({
  layout,
  dock,
  hasTerminal,
}: {
  layout: LayoutState;
  dock: DockState;
  hasTerminal: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 border-b border-stroke-default bg-surface-panel/70 px-3 py-2">
      <ShellToggleButton label="Rail" pressed={layout.railOpen} onClick={layout.toggleRail} />
      <ShellToggleButton
        label="Artifact"
        pressed={layout.artifactOpen}
        onClick={layout.toggleArtifact}
      />
      <ShellToggleButton
        label="Utility"
        pressed={layout.utilityOpen}
        onClick={layout.toggleUtility}
      />
      <ShellToggleButton
        label="Terminal"
        pressed={hasTerminal && dock.visible}
        onClick={dock.toggleVisible}
      />
      <div
        className="ml-auto text-xs text-text-semantic-tertiary"
        data-testid="chat-workbench-utility-tab"
      >
        Active utility: {layout.activeUtilityTab}
      </div>
    </div>
  );
}

function UnavailableTerminalDock(): React.ReactElement {
  return (
    <section
      className="h-40 shrink-0 border-t border-stroke-default bg-surface-panel/90 px-3 py-3"
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

export function WorkbenchRailSurface({
  compare,
  handlers,
}: {
  compare: CompareState;
  handlers: WorkbenchHandlers;
}): React.ReactElement {
  return (
    <WorkbenchRail
      title="Workbench"
      onCreateSession={() => {
        void handlers.handleCreateSession();
      }}
      onLaunchAgent={handlers.handleLaunchAgent}
      onSelectSession={handlers.handleSelectSession}
      onSelectRecentChat={handlers.handleSelectRecentChat}
      onCompareSession={compare.openCompare}
      canCompareSession={compare.canCompare}
      compareSessionId={compare.compareTarget?.sessionId ?? null}
    />
  );
}

function WorkbenchCenterPane({
  compare,
  projectRoot,
}: {
  compare: CompareState;
  projectRoot: string | null;
}): React.ReactElement {
  const workspaceClass = compare.isComparing ? 'w-1/2 border-r border-stroke-default' : 'w-full';
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

export function WorkbenchMainColumn({
  compare,
  dock,
  hasTerminal,
  layout,
  projectRoot,
  surfacePolicy,
  terminal,
}: {
  compare: CompareState;
  dock: DockState;
  hasTerminal: boolean;
  layout: LayoutState;
  projectRoot: string | null;
  surfacePolicy: SurfacePolicyState;
  terminal?: UseTerminalSessionsReturn;
}): React.ReactElement {
  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0">
      <WorkbenchToggleRow layout={layout} dock={dock} hasTerminal={hasTerminal} />
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <WorkbenchCenterPane compare={compare} projectRoot={projectRoot} />
        <WorkbenchSidePanels layout={layout} surfacePolicy={surfacePolicy} />
      </div>
      <WorkbenchTerminalSurface dock={dock} terminal={terminal} />
    </div>
  );
}
