/**
 * useAgentEvents.subagentReducers.ts — Reducer functions for token usage,
 * subtool updates, and subagent linking logic.
 *
 * Extracted from useAgentEvents.helpers.ts to stay within the 300-line
 * ESLint limit. Uses local action type shapes to avoid circular imports
 * with useAgentEvents.helpers.ts.
 */

import type { SubToolCallEvent } from '../components/AgentMonitor/types';
import type { RawApiTokenUsage as TokenUsage } from '../types/electron';
import type { AgentState, PendingSubagentStamp } from './useAgentEvents.helpers';
import {
  getUsageDeltas,
  hasSession,
  mergeOptionalTokenCount,
  updateSession,
} from './useAgentEvents.session-utils';

/** Window (ms) for temporal linking — 30s accounts for model loading overhead. */
const TEMPORAL_LINK_WINDOW_MS = 30_000;

interface TokenUpdateAction {
  type: 'TOKEN_UPDATE';
  sessionId: string;
  usage: TokenUsage;
  model?: string;
}

interface SubToolUpdateAction {
  type: 'SUBTOOL_UPDATE';
  sessionId: string;
  parentToolCallId: string;
  subTool: SubToolCallEvent;
}

interface LinkSubagentAction {
  type: 'LINK_SUBAGENT';
  parentSessionId: string;
  childSessionId: string;
}

interface RecordSubagentToolAction {
  type: 'RECORD_SUBAGENT_TOOL';
  parentSessionId: string;
  timestamp: number;
}

export function updateTokenUsage(
  state: AgentState,
  action: TokenUpdateAction,
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

export function updateSubTool(
  state: AgentState,
  action: SubToolUpdateAction,
): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    const toolCalls = session.toolCalls.map((tc) => {
      if (tc.id !== action.parentToolCallId) return tc;
      const existing = tc.subTools ?? [];
      const idx = existing.findIndex((s) => s.id === action.subTool.id);
      const subTools = idx >= 0
        ? existing.map((s, i) => i === idx ? { ...s, ...action.subTool } : s)
        : [...existing, action.subTool];
      return { ...tc, subTools };
    });
    return { ...session, toolCalls };
  });
}

export function linkSubagent(
  state: AgentState,
  action: LinkSubagentAction,
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

export function recordSubagentTool(
  state: AgentState,
  action: RecordSubagentToolAction,
): AgentState {
  return {
    ...state,
    pendingSubagentTimestamps: [
      ...state.pendingSubagentTimestamps,
      { parentSessionId: action.parentSessionId, timestamp: action.timestamp },
    ],
  };
}

export function findTemporalParent(
  stamps: PendingSubagentStamp[],
  childTimestamp: number,
): PendingSubagentStamp | undefined {
  let best: PendingSubagentStamp | undefined;
  for (const stamp of stamps) {
    const delta = childTimestamp - stamp.timestamp;
    if (delta >= 0 && delta <= TEMPORAL_LINK_WINDOW_MS) {
      if (!best || stamp.timestamp > best.timestamp) best = stamp;
    }
  }
  return best;
}
