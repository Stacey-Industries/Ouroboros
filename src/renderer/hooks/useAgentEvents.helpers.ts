import type {
  AgentSession,
  SubToolCallEvent,
  ToolCallEvent,
} from '../components/AgentMonitor/types';
import type { RawApiTokenUsage as TokenUsage } from '../types/electron';
import { endSession } from './useAgentEvents.endSession';
import {
  type CompactionAction,
  type ConversationTurnAction,
  type NotificationAction,
  type PermissionEventAction,
  type PostCompactAction,
  type PreCompactAction,
  reduceCompaction,
  reduceConversationTurn,
  reduceNotification,
  reducePermissionEvent,
  reducePostCompact,
  reducePreCompact,
} from './useAgentEvents.miscReducers';
import {
  reduceRuleLoaded,
  reduceSkillEnd,
  reduceSkillStart,
  type RuleLoadedAction,
  type SkillEndAction,
  type SkillStartAction,
} from './useAgentEvents.ruleSkillReducers';
import {
  ensureSession,
  findToolCallIndex,
  hasSession,
  loadPersistedSessions,
  omitPendingLink,
  resolveStaleToolCalls,
  trimToolCalls,
  updateSession,
} from './useAgentEvents.session-utils';
import {
  findTemporalParent,
  linkSubagent,
  recordSubagentTool,
  updateSubTool,
  updateTokenUsage,
} from './useAgentEvents.subagentReducers';
import {
  reduceTaskCompleted,
  reduceTaskCreated,
  type TaskCompletedAction,
  type TaskCreatedAction,
} from './useAgentEvents.taskReducers';

export interface PendingSubagentStamp {
  parentSessionId: string;
  timestamp: number;
}

export interface AgentState {
  sessions: AgentSession[];
  pendingSubagentLinks: Record<string, string>;
  /** Tracks subagent tool calls that haven't been linked to a child session yet. */
  pendingSubagentTimestamps: PendingSubagentStamp[];
}

export const initialAgentState: AgentState = {
  sessions: [],
  pendingSubagentLinks: {},
  pendingSubagentTimestamps: [],
};

export type AgentAction =
  | {
      type: 'AGENT_START';
      sessionId: string;
      taskLabel: string;
      timestamp: number;
      parentSessionId?: string;
      model?: string;
      internal?: boolean;
      external?: boolean;
    }
  | { type: 'TOOL_START'; sessionId: string; toolCall: ToolCallEvent }
  | {
      type: 'TOOL_END';
      sessionId: string;
      toolCallId?: string;
      toolName?: string;
      duration: number;
      status: 'success' | 'error';
      output?: string;
    }
  | { type: 'AGENT_END'; sessionId: string; timestamp: number; error?: string; costUsd?: number }
  | { type: 'TOKEN_UPDATE'; sessionId: string; usage: TokenUsage; model?: string }
  | { type: 'LINK_SUBAGENT'; parentSessionId: string; childSessionId: string }
  | { type: 'RECORD_SUBAGENT_TOOL'; parentSessionId: string; timestamp: number }
  | {
      type: 'SUBTOOL_UPDATE';
      sessionId: string;
      parentToolCallId: string;
      subTool: SubToolCallEvent;
    }
  | { type: 'DISMISS'; sessionId: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'LOAD_PERSISTED'; sessions: AgentSession[] }
  | { type: 'SET_NOTES'; sessionId: string; notes: string; bookmarked?: boolean }
  | RuleLoadedAction
  | SkillStartAction
  | SkillEndAction
  | TaskCreatedAction
  | TaskCompletedAction
  | ConversationTurnAction
  | CompactionAction
  | PreCompactAction
  | PostCompactAction
  | PermissionEventAction
  | NotificationAction;

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
    case 'SUBTOOL_UPDATE':
      return updateSubTool(state, action);
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
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.sessionId) };
    case 'CLEAR_COMPLETED':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.status === 'running' || s.status === 'idle'),
      };
    case 'LOAD_PERSISTED':
      return loadPersistedSessions(state, action.sessions);
    case 'SET_NOTES':
      return updateSession(state, action.sessionId, (s) => ({
        ...s,
        notes: action.notes,
        bookmarked: action.bookmarked ?? s.bookmarked,
      }));
    default:
      return reduceExtensionAction(state, action);
  }
}

function reduceSkillAndTaskAction(state: AgentState, action: AgentAction): AgentState | null {
  switch (action.type) {
    case 'RULE_LOADED':
      return reduceRuleLoaded(state, action);
    case 'SKILL_START':
      return reduceSkillStart(state, action);
    case 'SKILL_END':
      return reduceSkillEnd(state, action);
    case 'TASK_CREATED':
      return reduceTaskCreated(state, action);
    case 'TASK_COMPLETED':
      return reduceTaskCompleted(state, action);
    default:
      return null;
  }
}

function reduceExtensionAction(state: AgentState, action: AgentAction): AgentState {
  const skillOrTask = reduceSkillAndTaskAction(state, action);
  if (skillOrTask !== null) return skillOrTask;
  switch (action.type) {
    case 'CONVERSATION_TURN':
      return reduceConversationTurn(state, action);
    case 'COMPACTION':
      return reduceCompaction(state, action);
    case 'PRE_COMPACT':
      return reducePreCompact(state, action);
    case 'POST_COMPACT':
      return reducePostCompact(state, action);
    case 'PERMISSION_EVENT':
      return reducePermissionEvent(state, action);
    case 'NOTIFICATION':
      return reduceNotification(state, action);
    default:
      return state;
  }
}

type AgentStartAction = Extract<AgentAction, { type: 'AGENT_START' }>;

function updateExistingSession(state: AgentState, action: AgentStartAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    taskLabel:
      action.taskLabel !== `Session ${action.sessionId.slice(0, 8)}`
        ? action.taskLabel
        : session.taskLabel,
    status: 'running',
    startedAt: action.timestamp,
    completedAt: undefined,
    error: undefined,
    model: action.model ?? session.model,
    parentSessionId: action.parentSessionId ?? session.parentSessionId,
    external: action.external ?? session.external,
  }));
}

function resolveParentAndTimestamps(
  state: AgentState,
  action: AgentStartAction,
): { resolvedParent: string | undefined; updatedTimestamps: PendingSubagentStamp[] } {
  let resolvedParent = action.parentSessionId ?? state.pendingSubagentLinks[action.sessionId];
  let updatedTimestamps = state.pendingSubagentTimestamps;
  if (!resolvedParent) {
    const temporalMatch = findTemporalParent(state.pendingSubagentTimestamps, action.timestamp);
    if (temporalMatch) {
      resolvedParent = temporalMatch.parentSessionId;
      updatedTimestamps = state.pendingSubagentTimestamps.filter(
        (stamp) => stamp !== temporalMatch,
      );
    }
  }
  return { resolvedParent, updatedTimestamps };
}

function startSession(state: AgentState, action: AgentStartAction): AgentState {
  if (hasSession(state.sessions, action.sessionId)) return updateExistingSession(state, action);
  const { resolvedParent, updatedTimestamps } = resolveParentAndTimestamps(state, action);
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
    internal: action.internal,
    external: action.external,
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
    const isDuplicate = session.toolCalls.some(
      (tc) =>
        tc.toolName === action.toolCall.toolName &&
        tc.input === action.toolCall.input &&
        Math.abs(tc.timestamp - action.toolCall.timestamp) < 2000 &&
        tc.status === 'pending',
    );
    if (isDuplicate) return session;
    return {
      ...session,
      toolCalls: trimToolCalls([
        ...resolveStaleToolCalls(session.toolCalls, action.toolCall.timestamp),
        action.toolCall,
      ]),
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

/* endSession and its helpers are in useAgentEvents.endSession.ts (line-count budget). */

/* Re-export dispatchers that were moved to ruleSkillDispatchers.ts for line-count budget. */
export { dispatchAgentEnd, dispatchTokenUpdate } from './useAgentEvents.ruleSkillDispatchers';
