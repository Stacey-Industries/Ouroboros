import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { RawApiTokenUsage as TokenUsage } from '../types/electron';
import {
  ensureSession,
  findToolCallIndex,
  getUsageDeltas,
  hasSession,
  loadPersistedSessions,
  mergeOptionalTokenCount,
  omitPendingLink,
  resolvePendingToolCalls,
  resolveStaleToolCalls,
  trimToolCalls,
  updateSession,
} from './useAgentEvents.session-utils';

/** Window (ms) for temporal linking: if a new agent_start arrives within this time
 *  of an unconsumed subagent tool call from another session, auto-link them.
 *  30s accounts for Claude Code subagent initialization overhead (model loading,
 *  context building, etc.) which routinely exceeds 5s. */
const TEMPORAL_LINK_WINDOW_MS = 30_000;

export interface PendingSubagentStamp {
  parentSessionId: string;
  timestamp: number;
}

export interface AgentState {
  sessions: AgentSession[];
  pendingSubagentLinks: Record<string, string>;
  /** Tracks subagent tool calls that haven't been linked to a child session yet.
   *  Key is a synthetic id (parent+timestamp), value has parentSessionId + timestamp. */
  pendingSubagentTimestamps: PendingSubagentStamp[];
}

export const initialAgentState: AgentState = {
  sessions: [],
  pendingSubagentLinks: {},
  pendingSubagentTimestamps: [],
};

export type AgentAction =
  | { type: 'AGENT_START'; sessionId: string; taskLabel: string; timestamp: number; parentSessionId?: string; model?: string }
  | { type: 'TOOL_START'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'TOOL_END'; sessionId: string; toolCallId?: string; toolName?: string; duration: number; status: 'success' | 'error'; output?: string }
  | { type: 'AGENT_END'; sessionId: string; timestamp: number; error?: string }
  | { type: 'TOKEN_UPDATE'; sessionId: string; usage: TokenUsage; model?: string }
  | { type: 'LINK_SUBAGENT'; parentSessionId: string; childSessionId: string }
  | { type: 'RECORD_SUBAGENT_TOOL'; parentSessionId: string; timestamp: number }
  | { type: 'DISMISS'; sessionId: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'LOAD_PERSISTED'; sessions: AgentSession[] }
  | { type: 'SET_NOTES'; sessionId: string; notes: string; bookmarked?: boolean };

export function reducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'AGENT_START':
      return startSession(state, action);
    case 'TOOL_START':
      return startToolCall(state, action);
    case 'TOOL_END':
      return finishToolCall(state, action);
    case 'AGENT_END':
      return endSession(state, action);
    case 'TOKEN_UPDATE':
      return updateTokenUsage(state, action);
    default:
      return reduceUtilityAction(state, action);
  }
}

function reduceUtilityAction(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'LINK_SUBAGENT':
      return linkSubagent(state, action);
    case 'RECORD_SUBAGENT_TOOL':
      return recordSubagentTool(state, action);
    case 'DISMISS':
      return { ...state, sessions: state.sessions.filter((session) => session.id !== action.sessionId) };
    case 'CLEAR_COMPLETED':
      return {
        ...state,
        sessions: state.sessions.filter((session) => session.status === 'running' || session.status === 'idle'),
      };
    case 'LOAD_PERSISTED':
      return loadPersistedSessions(state, action.sessions);
    case 'SET_NOTES':
      return updateSession(state, action.sessionId, (session) => ({
        ...session,
        notes: action.notes,
        bookmarked: action.bookmarked ?? session.bookmarked,
      }));
    default:
      return state;
  }
}

function startSession(
  state: AgentState,
  action: Extract<AgentAction, { type: 'AGENT_START' }>,
): AgentState {
  // If the session already exists (placeholder from ensureSession, or a
  // completed chat-thread session receiving a new turn), update it.
  // Reset status to 'running' so the monitor card reflects the new turn.
  if (hasSession(state.sessions, action.sessionId)) {
    return updateSession(state, action.sessionId, (session) => ({
      ...session,
      taskLabel: action.taskLabel !== `Session ${action.sessionId.slice(0, 8)}` ? action.taskLabel : session.taskLabel,
      status: 'running',
      startedAt: action.timestamp,
      completedAt: undefined,
      error: undefined,
      model: action.model ?? session.model,
      parentSessionId: action.parentSessionId ?? session.parentSessionId,
    }));
  }

  // Resolve parent: explicit > pending link > temporal heuristic
  let resolvedParent = action.parentSessionId ?? state.pendingSubagentLinks[action.sessionId];
  let updatedTimestamps = state.pendingSubagentTimestamps;

  if (!resolvedParent) {
    const temporalMatch = findTemporalParent(state.pendingSubagentTimestamps, action.timestamp);
    if (temporalMatch) {
      resolvedParent = temporalMatch.parentSessionId;
      // Consume the matched stamp so it isn't reused
      updatedTimestamps = state.pendingSubagentTimestamps.filter((stamp) => stamp !== temporalMatch);
    }
  }

  const newSession: AgentSession = {
    id: action.sessionId,
    taskLabel: action.taskLabel,
    status: 'running',
    startedAt: action.timestamp,
    toolCalls: [],
    parentSessionId: resolvedParent,
    inputTokens: 0,
    outputTokens: 0,
    model: action.model,
  };

  return {
    sessions: [newSession, ...state.sessions],
    pendingSubagentLinks: omitPendingLink(state.pendingSubagentLinks, action.sessionId),
    pendingSubagentTimestamps: updatedTimestamps,
  };
}

function startToolCall(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOOL_START' }>,
): AgentState {
  const baseState = ensureSession(state, action.sessionId, action.toolCall.timestamp);
  return updateSession(baseState, action.sessionId, (session) => {
    // Dedup: skip if a tool call with the same name AND same input arrived
    // within 2s. This prevents double-counting when both hook events and
    // synthetic bridge events fire for the same tool invocation, while still
    // allowing consecutive calls to the same tool with different inputs
    // (e.g. two Read calls on different files).
    const isDuplicate = session.toolCalls.some((tc) =>
      tc.toolName === action.toolCall.toolName
      && tc.input === action.toolCall.input
      && Math.abs(tc.timestamp - action.toolCall.timestamp) < 2000
      && tc.status === 'pending',
    );
    if (isDuplicate) return session;

    return {
      ...session,
      toolCalls: trimToolCalls([...resolveStaleToolCalls(session.toolCalls, action.toolCall.timestamp), action.toolCall]),
    };
  });
}

function finishToolCall(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOOL_END' }>,
): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    const targetIndex = findToolCallIndex(session.toolCalls, action.toolCallId, action.toolName);
    if (targetIndex < 0) return session;
    const toolCalls = session.toolCalls.map((tc, i) =>
      i === targetIndex
        ? { ...tc, duration: action.duration, status: action.status, output: action.output }
        : tc,
    );
    return { ...session, toolCalls };
  });
}

function endSession(
  state: AgentState,
  action: Extract<AgentAction, { type: 'AGENT_END' }>,
): AgentState {
  const sessionError = action.error;
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    status: sessionError ? 'error' : 'complete',
    completedAt: action.timestamp,
    error: sessionError,
    // If the session ended normally, pending tools likely completed but their
    // post_tool_use wasn't matched — mark them as success, not error.
    toolCalls: resolvePendingToolCalls(session.toolCalls, sessionError),
  }));
}

function updateTokenUsage(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOKEN_UPDATE' }>,
): AgentState {
  const usageDeltas = getUsageDeltas(action.usage);
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    inputTokens: session.inputTokens + usageDeltas.input,
    outputTokens: session.outputTokens + usageDeltas.output,
    cacheReadTokens: mergeOptionalTokenCount(session.cacheReadTokens, usageDeltas.cacheRead),
    cacheWriteTokens: mergeOptionalTokenCount(session.cacheWriteTokens, usageDeltas.cacheWrite),
    model: action.model ?? session.model,
  }));
}

function linkSubagent(
  state: AgentState,
  action: Extract<AgentAction, { type: 'LINK_SUBAGENT' }>,
): AgentState {
  if (hasSession(state.sessions, action.childSessionId)) {
    return updateSession(state, action.childSessionId, (session) => ({
      ...session,
      parentSessionId: action.parentSessionId,
    }));
  }

  return {
    ...state,
    pendingSubagentLinks: {
      ...state.pendingSubagentLinks,
      [action.childSessionId]: action.parentSessionId,
    },
  };
}

function recordSubagentTool(
  state: AgentState,
  action: Extract<AgentAction, { type: 'RECORD_SUBAGENT_TOOL' }>,
): AgentState {
  return {
    ...state,
    pendingSubagentTimestamps: [
      ...state.pendingSubagentTimestamps,
      { parentSessionId: action.parentSessionId, timestamp: action.timestamp },
    ],
  };
}

/** Find the most recent unconsumed subagent tool call within the temporal window. */
function findTemporalParent(
  stamps: PendingSubagentStamp[],
  childTimestamp: number,
): PendingSubagentStamp | undefined {
  let best: PendingSubagentStamp | undefined;

  for (const stamp of stamps) {
    const delta = childTimestamp - stamp.timestamp;
    if (delta >= 0 && delta <= TEMPORAL_LINK_WINDOW_MS) {
      if (!best || stamp.timestamp > best.timestamp) {
        best = stamp;
      }
    }
  }

  return best;
}

