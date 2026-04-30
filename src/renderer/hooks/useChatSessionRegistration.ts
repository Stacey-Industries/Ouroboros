/**
 * useChatSessionRegistration.ts — Wave 64.
 *
 * Returns an idempotent callback that dispatches SESSION_REGISTER for an IDE
 * chat session. Extracted from useAgentEvents.ts to keep that file under the
 * 300-line ESLint cap.
 */
import type { Dispatch } from 'react';
import { useCallback } from 'react';

import type { AgentAction } from './useAgentEvents.helpers';

export interface RegisterChatSessionArgs {
  sessionId: string;
  cwd?: string;
  taskLabel?: string;
}

export function useChatSessionRegistration(
  dispatch: Dispatch<AgentAction>,
): (args: RegisterChatSessionArgs) => void {
  return useCallback(
    (args: RegisterChatSessionArgs) => {
      dispatch({
        type: 'SESSION_REGISTER',
        sessionId: args.sessionId,
        timestamp: Date.now(),
        kind: 'chat',
        cwd: args.cwd,
        taskLabel: args.taskLabel,
      });
    },
    [dispatch],
  );
}
