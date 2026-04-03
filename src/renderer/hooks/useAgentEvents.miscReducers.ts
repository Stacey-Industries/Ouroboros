/**
 * useAgentEvents.miscReducers.ts — Reducer cases for conversation, compaction,
 * notification, and permission events.
 *
 * Extracted from helpers.ts to stay within the 300-line ESLint limit.
 */

import type {
  CompactionEvent,
  ConversationTurn,
  PermissionEvent,
} from '../components/AgentMonitor/types';
import type { AgentState } from './useAgentEvents.helpers';
import { updateSession } from './useAgentEvents.session-utils';

export interface ConversationTurnAction {
  type: 'CONVERSATION_TURN';
  sessionId: string;
  turn: ConversationTurn;
}

/** Legacy single-dispatch compaction (kept for test/backward compatibility). */
export interface CompactionAction {
  type: 'COMPACTION';
  sessionId: string;
  event: CompactionEvent;
}

/** Pre-compact phase: stores token count until post_compact arrives. */
export interface PreCompactAction {
  type: 'PRE_COMPACT';
  sessionId: string;
  tokenCount: number;
}

/** Post-compact phase: merges with pending pre-compact tokens. */
export interface PostCompactAction {
  type: 'POST_COMPACT';
  sessionId: string;
  tokenCount: number;
  timestamp: number;
}

export interface PermissionEventAction {
  type: 'PERMISSION_EVENT';
  sessionId: string;
  event: PermissionEvent;
}

export interface NotificationAction {
  type: 'NOTIFICATION';
  sessionId: string;
  message: string;
}

export function reduceConversationTurn(
  state: AgentState,
  action: ConversationTurnAction,
): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    conversationTurns: [...(session.conversationTurns ?? []), action.turn].slice(-100),
  }));
}

export function reduceCompaction(state: AgentState, action: CompactionAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    compactions: [...(session.compactions ?? []), action.event].slice(-100),
  }));
}

export function reducePreCompact(state: AgentState, action: PreCompactAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    pendingPreCompactTokens: action.tokenCount,
  }));
}

export function reducePostCompact(state: AgentState, action: PostCompactAction): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    const event: CompactionEvent = {
      preTokens: session.pendingPreCompactTokens ?? 0,
      postTokens: action.tokenCount,
      timestamp: action.timestamp,
    };
    return {
      ...session,
      compactions: [...(session.compactions ?? []), event].slice(-100),
      pendingPreCompactTokens: undefined,
    };
  });
}

export function reducePermissionEvent(
  state: AgentState,
  action: PermissionEventAction,
): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    permissionEvents: [...(session.permissionEvents ?? []), action.event].slice(-100),
  }));
}

export function reduceNotification(
  state: AgentState,
  action: NotificationAction,
): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    notifications: [...(session.notifications ?? []), action.message].slice(-100),
  }));
}
