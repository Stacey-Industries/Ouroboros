import React from 'react';

import { useIsMobile } from '../../../hooks/useIsMobile';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { useAgentChatStoreContext } from '../../AgentChat/agentChatStore';
import {
  useActiveApprovalSessionIds,
  useWorkbenchContextState,
  useWorkbenchHandlers,
} from './ChatWorkbenchBody.model';
import {
  TwoTierRailSurface,
  WorkbenchApprovalSurface,
  WorkbenchMainColumn,
} from './ChatWorkbenchBody.parts';
import type { ChatWorkbenchLayoutApi } from './useChatWorkbenchLayout';
import type { TerminalDockApi } from './useTerminalDockState';
import { WorkbenchRightPane } from './WorkbenchRightPane';

interface ChatWorkbenchBodyProps {
  dock: TerminalDockApi;
  layout: ChatWorkbenchLayoutApi;
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
}

type WorkbenchState = ReturnType<typeof useWorkbenchContextState>;
type WorkbenchHandlersResult = ReturnType<typeof useWorkbenchHandlers>;

interface RailSlotProps {
  state: WorkbenchState;
  handlers: WorkbenchHandlersResult;
  terminal?: UseTerminalSessionsReturn;
}

function RailSlot({ state, handlers, terminal }: RailSlotProps): React.ReactElement | null {
  if (!state.layout.railOpen) return null;
  return (
    <TwoTierRailSurface
      layout={state.layout}
      sessionsState={state.sessionsState}
      threads={state.threads}
      approvalRequests={state.approvalRequests}
      compare={state.compare}
      handlers={handlers}
      terminal={terminal}
      dock={state.dock}
    />
  );
}

// Mobile overlay wrappers — slide-in panes with a tap-to-close scrim.

interface MobileOverlayProps {
  open: boolean;
  side: 'left' | 'right';
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

function MobileOverlay({
  open,
  side,
  onClose,
  label,
  children,
}: MobileOverlayProps): React.ReactElement | null {
  if (!open) return null;
  const sideClass = side === 'left' ? 'left-0' : 'right-0';
  const translate = side === 'left' ? '-translate-x-0' : 'translate-x-0';
  return (
    <>
      <div
        aria-hidden="true"
        // hardcoded: opacity scrim — non-semantic overlay, no design token
        className={'fixed inset-0 z-[150] bg-[rgba(0,0,0,0.45)]'} // hardcoded: scrim
        onClick={onClose}
        data-testid={`workbench-${side}-overlay-scrim`}
      />
      <aside
        role="dialog"
        aria-label={label}
        className={`fixed inset-y-0 ${sideClass} z-[151] flex transform ${translate} bg-surface-base shadow-xl`}
        style={{ width: 'min(420px, 85vw)' }}
        data-testid={`workbench-${side}-overlay`}
      >
        {children}
      </aside>
    </>
  );
}

interface BodyContentProps {
  state: WorkbenchState;
  handlers: WorkbenchHandlersResult;
  terminal?: UseTerminalSessionsReturn;
  projectRoot: string | null;
  activeApprovalSessionIds: Array<string | null | undefined>;
}

function useBodyContent(props: ChatWorkbenchBodyProps): BodyContentProps {
  const selectThread = useAgentChatStoreContext((s) => s.onSelectThread);
  const reloadThreads = useAgentChatStoreContext((s) => s.reloadThreads);
  const state = useWorkbenchContextState(props.layout, props.dock);
  const handlers = useWorkbenchHandlers(state.activation, selectThread, reloadThreads);
  const activeApprovalSessionIds = useActiveApprovalSessionIds(state.sessionsState.activeSessionId);
  return {
    state,
    handlers,
    terminal: props.terminal,
    projectRoot: props.projectRoot,
    activeApprovalSessionIds,
  };
}

export function ChatWorkbenchBody(props: ChatWorkbenchBodyProps): React.ReactElement {
  const content = useBodyContent(props);
  const isMobile = useIsMobile();
  if (isMobile) return <MobileBody {...content} />;
  return <DesktopBody {...content} />;
}

function DesktopBody({
  state,
  handlers,
  terminal,
  projectRoot,
  activeApprovalSessionIds,
}: BodyContentProps): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" data-testid="chat-workbench-body">
      <WorkbenchApprovalSurface
        activeApprovalSessionIds={activeApprovalSessionIds}
        approvalRequests={state.approvalRequests}
        handlers={handlers}
        sessionsState={state.sessionsState}
        threads={state.threads}
      />
      <RailSlot state={state} handlers={handlers} terminal={terminal} />
      <WorkbenchMainColumn
        compare={state.compare}
        dock={state.dock}
        layout={state.layout}
        projectRoot={state.layout.activeProject ?? projectRoot}
        surfacePolicy={state.surfacePolicy}
        terminal={terminal}
      />
    </div>
  );
}

function MobileBody({
  state,
  handlers,
  terminal,
  projectRoot,
  activeApprovalSessionIds,
}: BodyContentProps): React.ReactElement {
  return (
    <div
      className="flex flex-1 min-h-0 overflow-hidden"
      data-testid="chat-workbench-body"
      data-mobile="true"
    >
      <WorkbenchApprovalSurface
        activeApprovalSessionIds={activeApprovalSessionIds}
        approvalRequests={state.approvalRequests}
        handlers={handlers}
        sessionsState={state.sessionsState}
        threads={state.threads}
      />
      <WorkbenchMainColumn
        compare={state.compare}
        dock={state.dock}
        layout={state.layout}
        projectRoot={state.layout.activeProject ?? projectRoot}
        surfacePolicy={state.surfacePolicy}
        terminal={terminal}
      />
      <MobileOverlays state={state} handlers={handlers} terminal={terminal} />
    </div>
  );
}

function MobileOverlays({
  state,
  handlers,
  terminal,
}: {
  state: WorkbenchState;
  handlers: WorkbenchHandlersResult;
  terminal?: UseTerminalSessionsReturn;
}): React.ReactElement {
  const closeRail = (): void => state.layout.setRailOpen(false);
  const closeRightPane = (): void => {
    if (state.layout.rightPaneView === 'artifact') state.surfacePolicy.closeArtifact();
    else state.surfacePolicy.closeUtility();
  };
  return (
    <>
      <MobileOverlay
        open={state.layout.railOpen}
        side="left"
        onClose={closeRail}
        label="Workbench rail"
      >
        <div className="flex h-full w-full">
          <RailSlot state={state} handlers={handlers} terminal={terminal} />
        </div>
      </MobileOverlay>
      <MobileOverlay
        open={state.layout.rightPaneOpen}
        side="right"
        onClose={closeRightPane}
        label="Workbench utilities"
      >
        <MobileRightPaneContent state={state} />
      </MobileOverlay>
    </>
  );
}

function MobileRightPaneContent({ state }: { state: WorkbenchState }): React.ReactElement | null {
  if (!state.layout.rightPaneView) return null;
  const handleClose = (): void => {
    if (state.layout.rightPaneView === 'artifact') state.surfacePolicy.closeArtifact();
    else state.surfacePolicy.closeUtility();
  };
  return (
    <WorkbenchRightPane
      view={state.layout.rightPaneView}
      activeUtilityTab={state.layout.activeUtilityTab}
      onSelectUtilityTab={state.layout.setActiveUtilityTab}
      onSelectView={state.layout.setRightPaneView}
      onClose={handleClose}
    />
  );
}
