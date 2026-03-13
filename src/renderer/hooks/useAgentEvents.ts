import {
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
} from 'react';
import type { AgentSession } from '../components/AgentMonitor/types';
import type { HookPayload } from '../types/electron';
import {
  initialAgentState,
  reducer,
  type AgentAction,
} from './useAgentEvents.helpers';
import {
  createToolCall,
  deriveTaskLabel,
  getSubagentChildId,
  getToolEndDetails,
  parsePersistedSessions,
  toHookPayload,
} from './useAgentEvents.payload';

export interface UseAgentEventsReturn {
  agents: AgentSession[];
  activeCount: number;
  clearCompleted: () => void;
  dismiss: (sessionId: string) => void;
  updateNotes: (sessionId: string, notes: string, bookmarked?: boolean) => void;
  currentSessions: AgentSession[];
  historicalSessions: AgentSession[];
}

export function useAgentEvents(): UseAgentEventsReturn {
  const [state, dispatch] = useReducer(reducer, initialAgentState);
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  const savedSessionIdsRef = useRef<Set<string>>(new Set());

  usePersistedSessionsLoader(dispatch, savedSessionIdsRef);
  useCompletedSessionsSaver(state.sessions, liveSessionIdsRef, savedSessionIdsRef);
  useAgentEventSubscription(dispatch, liveSessionIdsRef);

  const clearCompleted = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPLETED' });
  }, []);

  const dismiss = useCallback((sessionId: string) => {
    dispatch({ type: 'DISMISS', sessionId });
    window.electronAPI?.sessions?.delete?.(sessionId).catch(() => {});
  }, []);

  const updateNotes = useCallback((sessionId: string, notes: string, bookmarked?: boolean) => {
    dispatch({ type: 'SET_NOTES', sessionId, notes, bookmarked });

    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    if (session) {
      window.electronAPI?.sessions?.save?.({
        ...session,
        notes,
        bookmarked: bookmarked ?? session.bookmarked,
      }).catch(() => {});
    }
  }, [state.sessions]);

  const activeCount = state.sessions.filter((session) => session.status === 'running').length;
  const currentSessions = state.sessions.filter((session) => !session.restored);
  const historicalSessions = state.sessions.filter((session) => session.restored === true);

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
    if (!loadSessions) {
      return;
    }

    loadSessions()
      .then((result) => {
        if (!result.success || !result.sessions) {
          return;
        }

        const sessions = parsePersistedSessions(result.sessions);
        markSessionsAsSaved(sessions, savedSessionIdsRef);
        if (sessions.length > 0) {
          dispatch({ type: 'LOAD_PERSISTED', sessions });
        }
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
    if (!saveSession) {
      return;
    }

    for (const session of sessions) {
      if (!shouldPersistSession(session, liveSessionIdsRef, savedSessionIdsRef)) {
        continue;
      }

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
    if (!subscribe) {
      return;
    }

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
    console.warn('[useAgentEvents] toHookPayload returned null for:', JSON.stringify(event));
    return;
  }

  dispatchLifecycleEvent(payload, dispatch, liveSessionIdsRef);
  dispatchTokenUpdate(payload, dispatch);
}

function dispatchLifecycleEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  switch (payload.type) {
    case 'agent_start':
      dispatchAgentStart(payload, dispatch, liveSessionIdsRef);
      return;
    case 'pre_tool_use':
      dispatchToolStart(payload, dispatch);
      return;
    case 'post_tool_use':
      dispatchToolEnd(payload, dispatch);
      return;
    case 'agent_end':
    case 'agent_stop':
      dispatchAgentEnd(payload, dispatch);
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
  });
}

function dispatchToolStart(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const toolCall = createToolCall(payload);
  if (!toolCall) {
    return;
  }

  dispatch({ type: 'TOOL_START', sessionId: payload.sessionId, toolCall });
  const childSessionId = getSubagentChildId(toolCall.toolName, payload.input ?? {});
  if (childSessionId) {
    dispatch({
      type: 'LINK_SUBAGENT',
      parentSessionId: payload.sessionId,
      childSessionId,
    });
  }
}

function dispatchToolEnd(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  if (!payload.toolCallId) {
    return;
  }

  const details = getToolEndDetails(payload);
  dispatch({
    type: 'TOOL_END',
    sessionId: payload.sessionId,
    toolCallId: payload.toolCallId,
    duration: details.duration,
    status: details.status,
    output: details.output,
  });
}

function dispatchAgentEnd(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  dispatch({
    type: 'AGENT_END',
    sessionId: payload.sessionId,
    timestamp: payload.timestamp,
    error: payload.error,
  });
}

function dispatchTokenUpdate(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  if (!payload.usage) {
    return;
  }

  dispatch({
    type: 'TOKEN_UPDATE',
    sessionId: payload.sessionId,
    usage: payload.usage,
    model: payload.model,
  });
}

function shouldPersistSession(
  session: AgentSession,
  liveSessionIdsRef: MutableRefObject<Set<string>>,
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): boolean {
  return (
    (session.status === 'complete' || session.status === 'error')
    && !savedSessionIdsRef.current.has(session.id)
    && liveSessionIdsRef.current.has(session.id)
  );
}

function markSessionsAsSaved(
  sessions: AgentSession[],
  savedSessionIdsRef: MutableRefObject<Set<string>>,
): void {
  for (const session of sessions) {
    savedSessionIdsRef.current.add(session.id);
  }
}
