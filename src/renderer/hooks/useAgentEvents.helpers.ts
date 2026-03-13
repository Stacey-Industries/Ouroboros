import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { TokenUsage } from '../types/electron';

const MAX_TOOL_CALLS = 50;

export interface AgentState {
  sessions: AgentSession[];
  pendingSubagentLinks: Record<string, string>;
}

export const initialAgentState: AgentState = {
  sessions: [],
  pendingSubagentLinks: {},
};

export type AgentAction =
  | { type: 'AGENT_START'; sessionId: string; taskLabel: string; timestamp: number; parentSessionId?: string; model?: string }
  | { type: 'TOOL_START'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'TOOL_END'; sessionId: string; toolCallId: string; duration: number; status: 'success' | 'error'; output?: string }
  | { type: 'AGENT_END'; sessionId: string; timestamp: number; error?: string }
  | { type: 'TOKEN_UPDATE'; sessionId: string; usage: TokenUsage; model?: string }
  | { type: 'LINK_SUBAGENT'; parentSessionId: string; childSessionId: string }
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
  if (hasSession(state.sessions, action.sessionId)) {
    return state;
  }

  const newSession: AgentSession = {
    id: action.sessionId,
    taskLabel: action.taskLabel,
    status: 'running',
    startedAt: action.timestamp,
    toolCalls: [],
    parentSessionId: action.parentSessionId ?? state.pendingSubagentLinks[action.sessionId],
    inputTokens: 0,
    outputTokens: 0,
    model: action.model,
  };

  return {
    sessions: [newSession, ...state.sessions],
    pendingSubagentLinks: omitPendingLink(state.pendingSubagentLinks, action.sessionId),
  };
}

function startToolCall(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOOL_START' }>,
): AgentState {
  const baseState = ensureSession(state, action.sessionId, action.toolCall.timestamp);
  return updateSession(baseState, action.sessionId, (session) => ({
    ...session,
    toolCalls: trimToolCalls([...session.toolCalls, action.toolCall]),
  }));
}

function finishToolCall(
  state: AgentState,
  action: Extract<AgentAction, { type: 'TOOL_END' }>,
): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    toolCalls: session.toolCalls.map((toolCall) => (
      toolCall.id === action.toolCallId
        ? { ...toolCall, duration: action.duration, status: action.status, output: action.output }
        : toolCall
    )),
  }));
}

function endSession(
  state: AgentState,
  action: Extract<AgentAction, { type: 'AGENT_END' }>,
): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    status: action.error ? 'error' : 'complete',
    completedAt: action.timestamp,
    error: action.error,
    toolCalls: markPendingToolCallsErrored(session.toolCalls),
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

function markPendingToolCallsErrored(toolCalls: ToolCallEvent[]): ToolCallEvent[] {
  return toolCalls.map((toolCall) => (
    toolCall.status === 'pending' ? { ...toolCall, status: 'error' as const } : toolCall
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
