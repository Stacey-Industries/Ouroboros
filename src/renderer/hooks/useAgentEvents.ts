import log from 'electron-log/renderer';
import {
  type Dispatch,
  type MutableRefObject,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';

import type { AgentSession } from '../components/AgentMonitor/types';
import type { HookPayload } from '../types/electron';
import { routeNewEventTypes } from './useAgentEvents.eventRouting';
import { summarizeSubToolInput } from './useAgentEvents.fieldHelpers';
import {
  type AgentAction,
  dispatchAgentEnd,
  dispatchTokenUpdate,
  initialAgentState,
  reducer,
} from './useAgentEvents.helpers';
import {
  createToolCall,
  deriveTaskLabel,
  getSubagentChildId,
  getToolEndDetails,
  isSubagentTool,
  parsePersistedSessions,
  toHookPayload,
} from './useAgentEvents.payload';
import {
  dispatchRuleLoaded,
  dispatchSkillEnd,
  dispatchSkillStart,
} from './useAgentEvents.ruleSkillDispatchers';
import { markSessionsAsSaved, shouldPersistSession } from './useAgentEvents.session-utils';

export interface UseAgentEventsReturn {
  agents: AgentSession[];
  activeCount: number;
  clearCompleted: () => void;
  dismiss: (sessionId: string) => void;
  updateNotes: (sessionId: string, notes: string, bookmarked?: boolean) => void;
  currentSessions: AgentSession[];
  historicalSessions: AgentSession[];
}

function deleteCompletedSessions(sessions: AgentSession[]): void {
  const completedIds = sessions
    .filter((s) => s.status === 'complete' || s.status === 'error')
    .map((s) => s.id);
  for (const id of completedIds) {
    window.electronAPI?.sessions?.delete?.(id).catch(() => {});
  }
}

function persistSessionNotes(
  sessions: AgentSession[],
  sessionId: string,
  notes: string,
  bookmarked?: boolean,
): void {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (session) {
    window.electronAPI?.sessions
      ?.save?.({ ...session, notes, bookmarked: bookmarked ?? session.bookmarked })
      .catch(() => {});
  }
}

export function useAgentEvents(): UseAgentEventsReturn {
  const [state, dispatch] = useReducer(reducer, initialAgentState);
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  const savedSessionIdsRef = useRef<Set<string>>(new Set());

  usePersistedSessionsLoader(dispatch, savedSessionIdsRef);
  useCompletedSessionsSaver(state.sessions, liveSessionIdsRef, savedSessionIdsRef);
  useAgentEventSubscription(dispatch, liveSessionIdsRef);

  const clearCompleted = useCallback(() => {
    deleteCompletedSessions(state.sessions);
    dispatch({ type: 'CLEAR_COMPLETED' });
  }, [state.sessions]);

  const dismiss = useCallback((sessionId: string) => {
    dispatch({ type: 'DISMISS', sessionId });
    window.electronAPI?.sessions?.delete?.(sessionId).catch(() => {});
  }, []);

  const updateNotes = useCallback(
    (sessionId: string, notes: string, bookmarked?: boolean) => {
      dispatch({ type: 'SET_NOTES', sessionId, notes, bookmarked });
      persistSessionNotes(state.sessions, sessionId, notes, bookmarked);
    },
    [state.sessions],
  );

  const activeCount = state.sessions.filter((s) => s.status === 'running').length;
  const currentSessions = state.sessions.filter((s) => !s.restored);
  const historicalSessions = state.sessions.filter((s) => s.restored === true);

  return {
    agents: state.sessions,
    activeCount,
    clearCompleted,
    dismiss,
    updateNotes,
    currentSessions,
    historicalSessions,
  };
}

function usePersistedSessionsLoader(
  dispatch: Dispatch<AgentAction>,
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  useEffect(() => {
    const loadSessions = window.electronAPI?.sessions?.load;
    if (!loadSessions) return;
    loadSessions()
      .then((result) => {
        if (!result.success || !result.sessions) return;
        const sessions = parsePersistedSessions(result.sessions);
        markSessionsAsSaved(sessions, savedSessionIdsRef);
        if (sessions.length > 0) dispatch({ type: 'LOAD_PERSISTED', sessions });
      })
      .catch(() => {});
  }, [dispatch, savedSessionIdsRef]);
}

function useCompletedSessionsSaver(
  sessions: AgentSession[],
  liveSessionIdsRef: MutableRefObject<Set<string>>,
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  useEffect(() => {
    const saveSession = window.electronAPI?.sessions?.save;
    if (!saveSession) return;
    for (const session of sessions) {
      if (!shouldPersistSession(session, liveSessionIdsRef, savedSessionIdsRef)) continue;
      savedSessionIdsRef.current.add(session.id);
      saveSession(session).catch(() => {});
    }
  }, [liveSessionIdsRef, savedSessionIdsRef, sessions]);
}

function useAgentEventSubscription(
  dispatch: Dispatch<AgentAction>,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  useEffect(() => {
    const subscribe = window.electronAPI?.hooks?.onAgentEvent;
    if (!subscribe) return;
    return subscribe((event) => {
      handleAgentEvent(event, dispatch, liveSessionIdsRef);
    });
  }, [dispatch, liveSessionIdsRef]);
}

function handleAgentEvent(
  event: HookPayload,
  dispatch: Dispatch<AgentAction>,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  const payload = toHookPayload(event);
  if (!payload) {
    log.warn('toHookPayload returned null for:', JSON.stringify(event));
    return;
  }
  if (payload.type === 'instructions_loaded') {
    dispatchRuleLoaded(payload, dispatch);
    return;
  }
  if (routeNewEventTypes(payload, dispatch)) return;
  dispatchLifecycleEvent(payload, dispatch, liveSessionIdsRef);
  dispatchTokenUpdate(payload, dispatch);
}

function dispatchLifecycleEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  switch (payload.type) {
    case 'session_start':
    case 'agent_start':
      dispatchAgentStart(payload, dispatch, liveSessionIdsRef);
      return;
    case 'pre_tool_use':
      if (payload.parentToolCallId) {
        dispatchSubToolUpdate(payload, dispatch);
        return;
      }
      dispatchToolStart(payload, dispatch);
      return;
    case 'post_tool_use':
      if (payload.parentToolCallId) {
        dispatchSubToolUpdate(payload, dispatch);
        return;
      }
      dispatchToolEnd(payload, dispatch);
      return;
    case 'agent_end':
    case 'agent_stop':
    case 'session_stop':
      dispatchAgentEnd(payload, dispatch);
      dispatchSkillEnd(payload, dispatch);
      return;
    default:
      return;
  }
}

function dispatchAgentStart(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  liveSessionIdsRef.current.add(payload.sessionId);
  dispatch({
    type: 'AGENT_START',
    sessionId: payload.sessionId,
    taskLabel: deriveTaskLabel(payload),
    timestamp: payload.timestamp,
    parentSessionId: payload.parentSessionId,
    model: payload.model,
    internal: payload.internal,
  });
  dispatchSkillStart(payload, dispatch);
}

function dispatchToolStart(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const toolCall = createToolCall(payload);
  if (!toolCall) return;
  dispatch({ type: 'TOOL_START', sessionId: payload.sessionId, toolCall });
  const childSessionId = getSubagentChildId(toolCall.toolName, payload.input ?? {});
  if (childSessionId) {
    dispatch({ type: 'LINK_SUBAGENT', parentSessionId: payload.sessionId, childSessionId });
  } else if (isSubagentTool(toolCall.toolName)) {
    dispatch({
      type: 'RECORD_SUBAGENT_TOOL',
      parentSessionId: payload.sessionId,
      timestamp: payload.timestamp,
    });
  }
}

function dispatchToolEnd(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const details = getToolEndDetails(payload);
  dispatch({
    type: 'TOOL_END',
    sessionId: payload.sessionId,
    toolCallId: payload.toolCallId,
    toolName: payload.toolName,
    duration: details.duration,
    status: details.status,
    output: details.output,
  });
}

function dispatchSubToolUpdate(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  if (!payload.parentToolCallId || !payload.toolCallId) return;
  const isComplete = payload.type === 'post_tool_use';
  const details = isComplete ? getToolEndDetails(payload) : undefined;
  const input = summarizeSubToolInput(payload.input);
  dispatch({
    type: 'SUBTOOL_UPDATE',
    sessionId: payload.sessionId,
    parentToolCallId: payload.parentToolCallId,
    subTool: {
      id: payload.toolCallId,
      toolName: payload.toolName ?? 'Tool',
      input,
      timestamp: payload.timestamp,
      status: isComplete ? (details?.status ?? 'success') : 'pending',
      output: details?.output,
    },
  });
}
