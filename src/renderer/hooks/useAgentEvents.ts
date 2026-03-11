/**
 * useAgentEvents.ts — Subscribes to agent hook events via electronAPI and
 * maintains AgentSession state through a useReducer.
 *
 * The hook processes HookPayload events (delivered as AgentEvent wrappers)
 * and transitions sessions through their lifecycle:
 *   agent_start → running
 *   pre_tool_use → adds pending ToolCallEvent
 *   post_tool_use → resolves pending ToolCallEvent with duration + status
 *   agent_end → marks session complete or error
 */

import { useReducer, useEffect, useCallback, useRef } from 'react';
import type { AgentSession, ToolCallEvent, HookPayload, TokenUsage } from '../components/AgentMonitor/types';

// ─── State ───────────────────────────────────────────────────────────────────

interface AgentState {
  sessions: AgentSession[];
  /** Maps child session IDs to parent session IDs, inferred from Task/Agent tool calls. */
  pendingSubagentLinks: Record<string, string>;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type AgentAction =
  | { type: 'AGENT_START'; sessionId: string; taskLabel: string; timestamp: number; parentSessionId?: string; model?: string }
  | { type: 'TOOL_START'; sessionId: string; toolCall: ToolCallEvent }
  | { type: 'TOOL_END'; sessionId: string; toolCallId: string; duration: number; status: 'success' | 'error'; output?: string }
  | { type: 'AGENT_END'; sessionId: string; timestamp: number; error?: string }
  | { type: 'TOKEN_UPDATE'; sessionId: string; usage: TokenUsage; model?: string }
  | { type: 'LINK_SUBAGENT'; parentSessionId: string; childSessionId: string }
  | { type: 'DISMISS'; sessionId: string }
  | { type: 'CLEAR_COMPLETED' }
  | { type: 'LOAD_PERSISTED'; sessions: AgentSession[] };

// ─── Reducer ─────────────────────────────────────────────────────────────────

const MAX_TOOL_CALLS = 50;

function reducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'AGENT_START': {
      const existing = state.sessions.find((s) => s.id === action.sessionId);
      if (existing) return state; // idempotent

      // Resolve parent: explicit field first, then check pending subagent links
      const parentId = action.parentSessionId
        ?? state.pendingSubagentLinks[action.sessionId]
        ?? undefined;

      const newSession: AgentSession = {
        id: action.sessionId,
        taskLabel: action.taskLabel,
        status: 'running',
        startedAt: action.timestamp,
        toolCalls: [],
        parentSessionId: parentId,
        inputTokens: 0,
        outputTokens: 0,
        model: action.model,
      };

      // Remove consumed pending link
      const { [action.sessionId]: _, ...remainingLinks } = state.pendingSubagentLinks;

      return {
        sessions: [newSession, ...state.sessions],
        pendingSubagentLinks: remainingLinks,
      };
    }

    case 'TOOL_START': {
      // Auto-create session if we receive a tool event with no prior agent_start
      const sessionExists = state.sessions.some((s) => s.id === action.sessionId);
      const baseState = sessionExists ? state : {
        ...state,
        sessions: [{
          id: action.sessionId,
          taskLabel: `Session ${action.sessionId.slice(0, 8)}`,
          status: 'running' as const,
          startedAt: action.toolCall.timestamp,
          toolCalls: [],
          inputTokens: 0,
          outputTokens: 0,
        }, ...state.sessions],
      };

      return {
        ...baseState,
        sessions: baseState.sessions.map((s) => {
          if (s.id !== action.sessionId) return s;

          const calls = [...s.toolCalls, action.toolCall];
          // Keep only the last MAX_TOOL_CALLS to avoid unbounded memory growth
          const trimmed = calls.length > MAX_TOOL_CALLS
            ? calls.slice(calls.length - MAX_TOOL_CALLS)
            : calls;

          return { ...s, toolCalls: trimmed };
        }),
      };
    }

    case 'TOOL_END': {
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s;

          const toolCalls = s.toolCalls.map((tc) => {
            if (tc.id !== action.toolCallId) return tc;
            return { ...tc, duration: action.duration, status: action.status, output: action.output };
          });

          return { ...s, toolCalls };
        }),
      };
    }

    case 'AGENT_END': {
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s;

          // Resolve any still-pending tool calls
          const toolCalls = s.toolCalls.map((tc) =>
            tc.status === 'pending' ? { ...tc, status: 'error' as const } : tc,
          );

          return {
            ...s,
            status: action.error ? 'error' : 'complete',
            completedAt: action.timestamp,
            error: action.error,
            toolCalls,
          };
        }),
      };
    }

    case 'TOKEN_UPDATE': {
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s;
          const inputDelta = action.usage.input_tokens ?? 0;
          const outputDelta = action.usage.output_tokens ?? 0;
          const cacheReadDelta = action.usage.cache_read_input_tokens ?? 0;
          const cacheWriteDelta = action.usage.cache_creation_input_tokens ?? 0;
          return {
            ...s,
            inputTokens: s.inputTokens + inputDelta,
            outputTokens: s.outputTokens + outputDelta,
            cacheReadTokens: (s.cacheReadTokens ?? 0) + cacheReadDelta || undefined,
            cacheWriteTokens: (s.cacheWriteTokens ?? 0) + cacheWriteDelta || undefined,
            model: action.model ?? s.model,
          };
        }),
      };
    }

    case 'LINK_SUBAGENT': {
      // Check if child session already exists — if so, update it directly
      const childExists = state.sessions.some((s) => s.id === action.childSessionId);
      if (childExists) {
        return {
          ...state,
          sessions: state.sessions.map((s) =>
            s.id === action.childSessionId
              ? { ...s, parentSessionId: action.parentSessionId }
              : s,
          ),
        };
      }
      // Otherwise, store the link for when the child session starts
      return {
        ...state,
        pendingSubagentLinks: {
          ...state.pendingSubagentLinks,
          [action.childSessionId]: action.parentSessionId,
        },
      };
    }

    case 'DISMISS': {
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.sessionId) };
    }

    case 'CLEAR_COMPLETED': {
      return {
        ...state,
        sessions: state.sessions.filter(
          (s) => s.status === 'running' || s.status === 'idle',
        ),
      };
    }

    case 'LOAD_PERSISTED': {
      // Merge persisted sessions — skip any whose IDs already exist in state (live sessions take precedence)
      const existingIds = new Set(state.sessions.map((s) => s.id));
      const newSessions = action.sessions.filter((s) => !existingIds.has(s.id));
      return {
        ...state,
        sessions: [...state.sessions, ...newSessions],
      };
    }

    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a short human-readable label from a raw hook payload.
 * Tries to extract the first line of the prompt, falls back to sessionId.
 */
function deriveTaskLabel(payload: HookPayload): string {
  if (payload.prompt) {
    const firstLine = payload.prompt.split('\n')[0].trim();
    if (firstLine.length > 0) {
      return firstLine.length > 72 ? firstLine.slice(0, 72) + '…' : firstLine;
    }
  }
  return `Session ${payload.sessionId.slice(0, 8)}`;
}

/**
 * Build a short text summary of a tool's input object for display.
 * Only uses safe string operations — no dangerouslySetInnerHTML anywhere.
 */
function summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
  // Per-tool heuristics for the most useful single field
  const heuristics: Record<string, string[]> = {
    Read: ['file_path', 'path'],
    Edit: ['file_path', 'path'],
    Write: ['file_path', 'path'],
    Glob: ['pattern', 'path'],
    Grep: ['pattern', 'path'],
    Bash: ['command'],
    mcp__arcflow: ['query'],
  };

  const keys = heuristics[toolName] ?? Object.keys(input);

  for (const key of keys) {
    const val = input[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.length > 80 ? val.slice(0, 80) + '…' : val;
    }
  }

  // Fallback: JSON-stringify and truncate
  const raw = JSON.stringify(input);
  return raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
}

/**
 * Coerce a raw AgentEvent payload (from IPC) into a typed HookPayload,
 * returning null if the shape is not recognisable.
 */
function toHookPayload(raw: unknown): HookPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const obj = raw as Record<string, unknown>;
  const validTypes = ['agent_start', 'pre_tool_use', 'post_tool_use', 'agent_end', 'agent_stop', 'session_start', 'session_stop'];

  if (typeof obj['type'] !== 'string' || !validTypes.includes(obj['type'])) return null;
  if (typeof obj['sessionId'] !== 'string') return null;
  if (typeof obj['timestamp'] !== 'number') return null;

  // Parse usage from explicit field or from nested output.usage
  let usage: TokenUsage | undefined;
  if (isRecord(obj['usage'])) {
    usage = obj['usage'] as TokenUsage;
  } else if (isRecord(obj['output']) && isRecord((obj['output'] as Record<string, unknown>)['usage'])) {
    usage = (obj['output'] as Record<string, unknown>)['usage'] as TokenUsage;
  }

  // Parse model from explicit field or from nested output.model
  let model: string | undefined;
  if (typeof obj['model'] === 'string') {
    model = obj['model'];
  } else if (isRecord(obj['output']) && typeof (obj['output'] as Record<string, unknown>)['model'] === 'string') {
    model = (obj['output'] as Record<string, unknown>)['model'] as string;
  }

  return {
    type: obj['type'] as HookPayload['type'],
    sessionId: obj['sessionId'] as string,
    timestamp: obj['timestamp'] as number,
    toolName: typeof obj['toolName'] === 'string' ? obj['toolName'] : undefined,
    toolCallId: typeof obj['toolCallId'] === 'string' ? obj['toolCallId'] : undefined,
    input: isRecord(obj['input']) ? obj['input'] : undefined,
    output: isRecord(obj['output']) ? obj['output'] : undefined,
    prompt: typeof obj['prompt'] === 'string' ? obj['prompt'] : undefined,
    error: typeof obj['error'] === 'string' ? obj['error'] : undefined,
    parentSessionId: typeof obj['parentSessionId'] === 'string' ? obj['parentSessionId'] : undefined,
    usage,
    model,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAgentEventsReturn {
  agents: AgentSession[];
  activeCount: number;
  clearCompleted: () => void;
  dismiss: (sessionId: string) => void;
  currentSessions: AgentSession[];
  historicalSessions: AgentSession[];
}

export function useAgentEvents(): UseAgentEventsReturn {
  const [state, dispatch] = useReducer(reducer, { sessions: [], pendingSubagentLinks: {} });

  // Track which session IDs started in this app run (not restored from disk)
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  // Track which completed session IDs we've already saved to avoid duplicate writes
  const savedSessionIdsRef = useRef<Set<string>>(new Set());

  // Load persisted sessions on mount
  useEffect(() => {
    if (!window.electronAPI?.sessions?.load) return;

    window.electronAPI.sessions.load().then((result) => {
      if (!result.success || !result.sessions) return;

      const sessions: AgentSession[] = [];
      for (const raw of result.sessions) {
        if (typeof raw !== 'object' || raw === null) continue;
        const obj = raw as Record<string, unknown>;
        if (typeof obj['id'] !== 'string') continue;
        if (typeof obj['taskLabel'] !== 'string') continue;
        if (typeof obj['status'] !== 'string') continue;
        if (typeof obj['startedAt'] !== 'number') continue;

        sessions.push({
          id: obj['id'],
          taskLabel: obj['taskLabel'],
          status: obj['status'] as AgentSession['status'],
          startedAt: obj['startedAt'],
          completedAt: typeof obj['completedAt'] === 'number' ? obj['completedAt'] : undefined,
          toolCalls: Array.isArray(obj['toolCalls']) ? obj['toolCalls'] as ToolCallEvent[] : [],
          error: typeof obj['error'] === 'string' ? obj['error'] : undefined,
          parentSessionId: typeof obj['parentSessionId'] === 'string' ? obj['parentSessionId'] : undefined,
          inputTokens: typeof obj['inputTokens'] === 'number' ? obj['inputTokens'] : 0,
          outputTokens: typeof obj['outputTokens'] === 'number' ? obj['outputTokens'] : 0,
          cacheReadTokens: typeof obj['cacheReadTokens'] === 'number' ? obj['cacheReadTokens'] : undefined,
          cacheWriteTokens: typeof obj['cacheWriteTokens'] === 'number' ? obj['cacheWriteTokens'] : undefined,
          model: typeof obj['model'] === 'string' ? obj['model'] : undefined,
          restored: true,
        });

        // Mark as already saved so we don't re-save on re-render
        savedSessionIdsRef.current.add(obj['id']);
      }

      if (sessions.length > 0) {
        dispatch({ type: 'LOAD_PERSISTED', sessions });
      }
    }).catch(() => {
      // Non-fatal — ignore load errors
    });
  }, []);

  // Save sessions when they complete or error
  useEffect(() => {
    if (!window.electronAPI?.sessions?.save) return;

    for (const session of state.sessions) {
      if (
        (session.status === 'complete' || session.status === 'error') &&
        !savedSessionIdsRef.current.has(session.id) &&
        liveSessionIdsRef.current.has(session.id)
      ) {
        savedSessionIdsRef.current.add(session.id);
        window.electronAPI.sessions.save(session).catch(() => {
          // Non-fatal — ignore save errors
        });
      }
    }
  }, [state.sessions]);

  useEffect(() => {
    if (!window.electronAPI?.hooks?.onAgentEvent) return;

    const cleanup = window.electronAPI.hooks.onAgentEvent((event) => {
      // hooks.ts sends HookPayload directly — not wrapped in AgentEvent.payload
      console.log('[useAgentEvents] IPC event received:', JSON.stringify(event))
      const payload = toHookPayload(event);
      if (!payload) {
        console.warn('[useAgentEvents] toHookPayload returned null for:', JSON.stringify(event))
        return;
      }
      console.log('[useAgentEvents] processing payload:', payload.type, 'session:', payload.sessionId)

      switch (payload.type) {
        case 'agent_start': {
          liveSessionIdsRef.current.add(payload.sessionId);
          dispatch({
            type: 'AGENT_START',
            sessionId: payload.sessionId,
            taskLabel: deriveTaskLabel(payload),
            timestamp: payload.timestamp,
            parentSessionId: payload.parentSessionId,
            model: payload.model,
          });
          break;
        }

        case 'pre_tool_use': {
          if (!payload.toolName) break;

          const toolCallId = payload.toolCallId ?? `${payload.sessionId}-${payload.timestamp}`;
          const input = payload.input ?? {};
          const toolCall: ToolCallEvent = {
            id: toolCallId,
            toolName: payload.toolName,
            input: summarizeToolInput(payload.toolName, input),
            timestamp: payload.timestamp,
            status: 'pending',
          };

          dispatch({ type: 'TOOL_START', sessionId: payload.sessionId, toolCall });

          // Heuristic: if a "Task" or "Agent" tool is invoked with a session_id,
          // record a pending parent→child link so the subagent tree can be built
          const subagentTools = ['Task', 'Agent', 'Subagent', 'task', 'agent', 'subagent'];
          if (subagentTools.includes(payload.toolName)) {
            const childId = typeof input['session_id'] === 'string'
              ? input['session_id']
              : typeof input['sessionId'] === 'string'
                ? input['sessionId']
                : undefined;
            if (childId) {
              dispatch({
                type: 'LINK_SUBAGENT',
                parentSessionId: payload.sessionId,
                childSessionId: childId,
              });
            }
          }
          break;
        }

        case 'post_tool_use': {
          if (!payload.toolCallId) break;

          // Duration: if output contains a timestamp we can diff; else estimate
          const outputTs = isRecord(payload.output) && typeof payload.output['timestamp'] === 'number'
            ? payload.output['timestamp'] as number
            : payload.timestamp;

          const hasError = isRecord(payload.output) && payload.output['error'] !== undefined;

          // Extract output text for display
          let outputText: string | undefined;
          if (isRecord(payload.output)) {
            const out = payload.output;
            // Try common output fields first
            if (typeof out['content'] === 'string') {
              outputText = out['content'];
            } else if (typeof out['result'] === 'string') {
              outputText = out['result'];
            } else if (typeof out['error'] === 'string') {
              outputText = out['error'];
            } else if (typeof out['output'] === 'string') {
              outputText = out['output'];
            } else {
              // Fallback: stringify the whole output object
              try {
                const raw = JSON.stringify(out, null, 2);
                if (raw !== '{}') outputText = raw;
              } catch {
                // ignore
              }
            }
          }

          dispatch({
            type: 'TOOL_END',
            sessionId: payload.sessionId,
            toolCallId: payload.toolCallId,
            duration: Math.max(0, outputTs - payload.timestamp),
            status: hasError ? 'error' : 'success',
            output: outputText,
          });
          break;
        }

        case 'agent_end':
        case 'agent_stop': {
          dispatch({
            type: 'AGENT_END',
            sessionId: payload.sessionId,
            timestamp: payload.timestamp,
            error: payload.error,
          });
          break;
        }
      }

      // Dispatch token usage update if present on any event type
      if (payload.usage) {
        dispatch({
          type: 'TOKEN_UPDATE',
          sessionId: payload.sessionId,
          usage: payload.usage,
          model: payload.model,
        });
      }
    });

    return cleanup;
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPLETED' });
  }, []);

  const dismiss = useCallback((sessionId: string) => {
    dispatch({ type: 'DISMISS', sessionId });
    // Also remove from disk
    if (window.electronAPI?.sessions?.delete) {
      window.electronAPI.sessions.delete(sessionId).catch(() => {});
    }
  }, []);

  const activeCount = state.sessions.filter((s) => s.status === 'running').length;

  const currentSessions = state.sessions.filter((s) => !s.restored);
  const historicalSessions = state.sessions.filter((s) => s.restored === true);

  return { agents: state.sessions, activeCount, clearCompleted, dismiss, currentSessions, historicalSessions };
}
