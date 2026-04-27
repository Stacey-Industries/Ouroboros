import React from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { useAgentChatStoreContext } from '../../AgentChat/agentChatStore';
import {
  useActiveApprovalSessionIds,
  useWorkbenchContextState,
  useWorkbenchHandlers,
} from './ChatWorkbenchBody.model';
import {
  WorkbenchApprovalSurface,
  WorkbenchMainColumn,
  WorkbenchRailSurface,
} from './ChatWorkbenchBody.parts';

interface ChatWorkbenchBodyProps {
  projectRoot: string | null;
  terminal?: UseTerminalSessionsReturn;
}

export function ChatWorkbenchBody({
  projectRoot,
  terminal,
}: ChatWorkbenchBodyProps): React.ReactElement {
  const selectThread = useAgentChatStoreContext((state) => state.onSelectThread);
  const state = useWorkbenchContextState();
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
      {state.layout.railOpen && (
        <WorkbenchRailSurface compare={state.compare} handlers={handlers} />
      )}
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
