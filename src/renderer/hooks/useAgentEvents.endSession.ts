import type { AgentSession } from '../components/AgentMonitor/types';
import type { AgentAction, AgentState } from './useAgentEvents.helpers';
import { resolvePendingToolCalls, updateSession } from './useAgentEvents.session-utils';

const COMPACT_GUIDANCE =
  '\n\nContext kept refilling after compaction. Try breaking the task into smaller steps or starting a new session.';

type EndAction = Extract<AgentAction, { type: 'AGENT_END' }>;

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

function hasLiveChildren(state: AgentState, sessionId: string): boolean {
  return state.sessions.some(
    (candidate) => candidate.parentSessionId === sessionId && candidate.status === 'running',
  );
}

function deferEnd(state: AgentState, action: EndAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    pendingEnd: {
      error: action.error,
      timestamp: action.timestamp,
      costUsd: action.costUsd,
      deferredAt: Date.now(),
    },
  }));
}

function applyEnd(state: AgentState, action: EndAction): AgentState {
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
      pendingEnd: undefined,
    };
  });
}

function pendingEndAction(session: AgentSession): EndAction | null {
  if (!session.pendingEnd) return null;
  return {
    type: 'AGENT_END',
    sessionId: session.id,
    timestamp: session.pendingEnd.timestamp,
    error: session.pendingEnd.error,
    costUsd: session.pendingEnd.costUsd,
  };
}

/**
 * Finalize any deferred end whose live children have all completed. Loops
 * until quiescent — finalizing a parent may itself have been the only live
 * child of a deeper-nested deferred grandparent.
 */
function finalizePendingChain(state: AgentState): AgentState {
  let working = state;
  // Bounded loop: in the worst case we finalize once per session.
  for (let i = 0; i < working.sessions.length + 1; i++) {
    const finalizable = working.sessions.find(
      (s) => s.pendingEnd !== undefined && !hasLiveChildren(working, s.id),
    );
    if (!finalizable) return working;
    const action = pendingEndAction(finalizable);
    if (!action) return working;
    working = applyEnd(working, action);
  }
  return working;
}

export function endSession(state: AgentState, action: EndAction): AgentState {
  const target = state.sessions.find((s) => s.id === action.sessionId);
  if (!target) return state;
  if (target.status === 'running' && hasLiveChildren(state, action.sessionId)) {
    return finalizePendingChain(deferEnd(state, action));
  }
  return finalizePendingChain(applyEnd(state, action));
}

/**
 * Force-finalize a deferred end regardless of remaining live children. Used
 * by the dispatcher's safety timeout so a stuck or crashed subagent can't
 * pin the parent in the active list forever.
 */
export function forceFinalizeEnd(
  state: AgentState,
  action: { type: 'AGENT_END_FORCE_FINALIZE'; sessionId: string },
): AgentState {
  const target = state.sessions.find((s) => s.id === action.sessionId);
  if (!target?.pendingEnd) return state;
  const replay = pendingEndAction(target);
  if (!replay) return state;
  return finalizePendingChain(applyEnd(state, replay));
}
