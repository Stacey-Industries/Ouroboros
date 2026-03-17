import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { TokenUsage } from '../types/electron';

const MAX_TOOL_CALLS = 50;
/** If a tool call has been pending longer than this, auto-resolve it as success
 *  (its post_tool_use was likely lost or unmatched). Checked when new tools arrive. */
const STALE_TOOL_CALL_MS = 120_000;
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

type SessionUpdater = (session: AgentSession) => AgentSession;

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
  // If the session already exists (created as a placeholder by ensureSession),
  // update it with the real metadata instead of dropping it.
  if (hasSession(state.sessions, action.sessionId)) {
    return updateSession(state, action.sessionId, (session) => ({
      ...session,
      taskLabel: action.taskLabel !== `Session ${action.sessionId.slice(0, 8)}` ? action.taskLabel : session.taskLabel,
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
  return updateSession(baseState, action.sessionId, (session) => ({
    ...session,
    toolCalls: trimToolCalls([...resolveStaleToolCalls(session.toolCalls, action.toolCall.timestamp), action.toolCall]),
  }));
}

function finishToolCall(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOOL_END' }>,
): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    let targetIndex = -1;

    if (action.toolCallId) {
      targetIndex = session.toolCalls.findIndex((tc) => tc.id === action.toolCallId);
    }

    // Fallback 1: match most-recent pending call with same tool name
    if (targetIndex < 0 && action.toolName) {
      for (let i = session.toolCalls.length - 1; i >= 0; i--) {
        if (session.toolCalls[i].toolName === action.toolName && session.toolCalls[i].status === 'pending') {
          targetIndex = i;
          break;
        }
      }
    }

    // Fallback 2: match ANY most-recent pending call (last resort — better than dropping)
    if (targetIndex < 0) {
      for (let i = session.toolCalls.length - 1; i >= 0; i--) {
        if (session.toolCalls[i].status === 'pending') {
          targetIndex = i;
          break;
        }
      }
    }

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

function loadPersistedSessions(state: AgentState, sessions: AgentSession[]): AgentState {
  const existingIds = new Set(state.sessions.map((session) => session.id));
  return {
    ...state,
    sessions: [...state.sessions, ...sessions.filter((session) => !existingIds.has(session.id))],
  };
}

function ensureSession(state: AgentState, sessionId: string, timestamp: number): AgentState {
  if (hasSession(state.sessions, sessionId)) {
    return state;
  }

  return {
    ...state,
    sessions: [createPlaceholderSession(sessionId, timestamp), ...state.sessions],
  };
}

function updateSession(state: AgentState, sessionId: string, update: SessionUpdater): AgentState {
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === sessionId ? update(session) : session),
  };
}

function createPlaceholderSession(sessionId: string, timestamp: number): AgentSession {
  return {
    id: sessionId,
    taskLabel: `Session ${sessionId.slice(0, 8)}`,
    status: 'running',
    startedAt: timestamp,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
  };
}

/** Auto-resolve tool calls that have been pending longer than STALE_TOOL_CALL_MS.
 *  Their post_tool_use was likely lost or unmatched. */
function resolveStaleToolCalls(toolCalls: ToolCallEvent[], now: number): ToolCallEvent[] {
  let changed = false;
  const resolved = toolCalls.map((tc) => {
    if (tc.status === 'pending' && (now - tc.timestamp) > STALE_TOOL_CALL_MS) {
      changed = true;
      return { ...tc, status: 'success' as const, duration: now - tc.timestamp };
    }
    return tc;
  });
  return changed ? resolved : toolCalls;
}

/** Resolve any tool calls still in 'pending' state when a session ends.
 *  If the session ended normally (no error), mark them as 'success' since
 *  their post_tool_use likely arrived but wasn't matched.
 *  If the session errored, mark them as 'error'. */
function resolvePendingToolCalls(toolCalls: ToolCallEvent[], sessionError?: string): ToolCallEvent[] {
  const resolvedStatus: 'success' | 'error' = sessionError ? 'error' : 'success';
  return toolCalls.map((toolCall) => (
    toolCall.status === 'pending' ? { ...toolCall, status: resolvedStatus } : toolCall
  ));
}

function getUsageDeltas(usage: TokenUsage): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} {
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

function mergeOptionalTokenCount(currentValue: number | undefined, delta: number): number | undefined {
  const nextValue = (currentValue ?? 0) + delta;
  return nextValue > 0 ? nextValue : undefined;
}

function trimToolCalls(toolCalls: ToolCallEvent[]): ToolCallEvent[] {
  return toolCalls.length > MAX_TOOL_CALLS
    ? toolCalls.slice(toolCalls.length - MAX_TOOL_CALLS)
    : toolCalls;
}

function omitPendingLink(
  pendingSubagentLinks: Record<string, string>,
  sessionId: string,
): Record<string, string> {
  const { [sessionId]: removedLink, ...remainingLinks } = pendingSubagentLinks;
  void removedLink;
  return remainingLinks;
}

function hasSession(sessions: AgentSession[], sessionId: string): boolean {
  return sessions.some((session) => session.id === sessionId);
}
