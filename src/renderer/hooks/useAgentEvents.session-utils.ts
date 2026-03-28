/**
 * useAgentEvents.session-utils.ts — Pure utility functions for agent session
 * state management. Split from useAgentEvents.helpers.ts to stay under line limits.
 */

import type { MutableRefObject } from 'react';

import type { AgentSession, ToolCallEvent } from '../components/AgentMonitor/types';
import type { RawApiTokenUsage as TokenUsage } from '../types/electron';
import type { AgentState } from './useAgentEvents.helpers';

const MAX_TOOL_CALLS = 50;
const STALE_TOOL_CALL_MS = 120_000;

type SessionUpdater = (session: AgentSession) => AgentSession;

export function hasSession(sessions: AgentSession[], sessionId: string): boolean {
  return sessions.some((session) => session.id === sessionId);
}

export function updateSession(state: AgentState, sessionId: string, update: SessionUpdater): AgentState {
  return {
    ...state,
    sessions: state.sessions.map((session) => session.id === sessionId ? update(session) : session),
  };
}

export function createPlaceholderSession(sessionId: string, timestamp: number): AgentSession {
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

export function ensureSession(state: AgentState, sessionId: string, timestamp: number): AgentState {
  if (hasSession(state.sessions, sessionId)) return state;
  return {
    ...state,
    sessions: [createPlaceholderSession(sessionId, timestamp), ...state.sessions],
  };
}

export function loadPersistedSessions(state: AgentState, sessions: AgentSession[]): AgentState {
  const existingIds = new Set(state.sessions.map((session) => session.id));
  return {
    ...state,
    sessions: [...state.sessions, ...sessions.filter((session) => !existingIds.has(session.id))],
  };
}

/** Auto-resolve tool calls that have been pending longer than STALE_TOOL_CALL_MS. */
export function resolveStaleToolCalls(toolCalls: ToolCallEvent[], now: number): ToolCallEvent[] {
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

/** Resolve pending tool calls when a session ends. */
export function resolvePendingToolCalls(toolCalls: ToolCallEvent[], sessionError?: string): ToolCallEvent[] {
  const resolvedStatus: 'success' | 'error' = sessionError ? 'error' : 'success';
  return toolCalls.map((tc) => (tc.status === 'pending' ? { ...tc, status: resolvedStatus } : tc));
}

export function getUsageDeltas(usage: TokenUsage): {
  input: number; output: number; cacheRead: number; cacheWrite: number;
} {
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

export function mergeOptionalTokenCount(currentValue: number | undefined, delta: number): number | undefined {
  const nextValue = (currentValue ?? 0) + delta;
  return nextValue > 0 ? nextValue : undefined;
}

export function trimToolCalls(toolCalls: ToolCallEvent[]): ToolCallEvent[] {
  return toolCalls.length > MAX_TOOL_CALLS
    ? toolCalls.slice(toolCalls.length - MAX_TOOL_CALLS)
    : toolCalls;
}

export function omitPendingLink(
  pendingSubagentLinks: Record<string, string>,
  sessionId: string,
): Record<string, string> {
  const { [sessionId]: removedLink, ...remainingLinks } = pendingSubagentLinks;
  void removedLink;
  return remainingLinks;
}

export function findToolCallIndex(
  toolCalls: ToolCallEvent[],
  toolCallId?: string,
  toolName?: string,
): number {
  if (toolCallId) {
    const idx = toolCalls.findIndex((tc) => tc.id === toolCallId);
    if (idx >= 0) return idx;
  }
  if (toolName) {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      if (toolCalls[i].toolName === toolName && toolCalls[i].status === 'pending') return i;
    }
  }
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    if (toolCalls[i].status === 'pending') return i;
  }
  return -1;
}

export function shouldPersistSession(
  session: AgentSession,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): boolean {
  return (
    (session.status === 'complete' || session.status === 'error') &&
    !savedSessionIdsRef.current.has(session.id) &&
    liveSessionIdsRef.current.has(session.id)
  );
}

export function markSessionsAsSaved(
  sessions: AgentSession[],
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  for (const session of sessions) {
    savedSessionIdsRef.current.add(session.id);
  }
}
