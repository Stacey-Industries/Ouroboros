import React from 'react';

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

export function ChatWorkbenchBody({
  dock: externalDock,
  layout: externalLayout,
  projectRoot,
  terminal,
}: ChatWorkbenchBodyProps): React.ReactElement {
  const selectThread = useAgentChatStoreContext((state) => state.onSelectThread);
  const state = useWorkbenchContextState(externalLayout, externalDock);
  const handlers = useWorkbenchHandlers(state.activation, selectThread);
  const activeApprovalSessionIds = useActiveApprovalSessionIds(state.sessionsState.activeSessionId);
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
        projectRoot={projectRoot}
        surfacePolicy={state.surfacePolicy}
        terminal={terminal}
      />
    </div>
  );
}
