import type { AgentSession } from '../components/AgentMonitor/types';
import type { AgentAction, AgentState } from './useAgentEvents.helpers';
import { resolvePendingToolCalls, updateSession } from './useAgentEvents.session-utils';

const COMPACT_GUIDANCE =
  '\n\nContext kept refilling after compaction. Try breaking the task into smaller steps or starting a new session.';

function hasCompactionFailure(session: AgentSession): boolean {
  return session.pendingPreCompactTokens !== undefined;
}

function buildEndError(
  rawError: string | undefined,
  updatedFailedCompactions: number,
): string | undefined {
  if (!rawError) return rawError;
  const mentionsCompact = /compact/i.test(rawError);
  if (mentionsCompact || updatedFailedCompactions >= 2) {
    return rawError + COMPACT_GUIDANCE;
  }
  return rawError;
}

export function endSession(
  state: AgentState,
  action: Extract<AgentAction, { type: 'AGENT_END' }>,
): AgentState {
  const sessionError = action.error;
  return updateSession(state, action.sessionId, (session) => {
    const failedNow = hasCompactionFailure(session);
    const updatedFailedCompactions = failedNow
      ? (session.failedCompactions ?? 0) + 1
      : (session.failedCompactions ?? 0);
    const finalError = buildEndError(sessionError, updatedFailedCompactions);
    return {
      ...session,
      status: sessionError ? 'error' : 'complete',
      completedAt: action.timestamp,
      error: finalError,
      costUsd: action.costUsd ?? session.costUsd,
      toolCalls: resolvePendingToolCalls(session.toolCalls, sessionError),
      failedCompactions: updatedFailedCompactions > 0 ? updatedFailedCompactions : undefined,
      pendingPreCompactTokens: undefined,
    };
  });
}
