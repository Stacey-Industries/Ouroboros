/** hooks.ts - Hook event dispatch for Claude Code sessions. Socket/server code is in hooksNet.ts. */

import { BrowserWindow } from 'electron';

import { getConflictMonitor } from './agentConflict/conflictMonitor';
import {
  clearSessionRules,
  requestApproval,
  respondToApproval,
  toolRequiresApproval,
} from './approvalManager';
import { getChatLaunchesInFlight } from './hooksChatLaunch';
import { tapContextOutcomeObserver } from './hooksContextOutcome';
import {
  drainQueue,
  evictOrphanedSessions as evictOrphanedSessionsLogic,
  inferSessionId as inferSessionIdLogic,
  queuePayload,
  trackSessionLifecycle as trackSessionLifecycleLogic,
  truncatePayloadForDispatch,
} from './hooksDispatchLogic';
import {
  enrichFromPermissionRequest,
  handleConfigChange,
  handleCwdChanged,
  handleFileChanged,
  type HookEventType,
} from './hooksLifecycleHandlers';
import { getHooksNetAddress, startHooksNetServer, stopHooksNetServer } from './hooksNet';
import { handleSessionEnd, handleSessionStart, handleSessionStop } from './hooksSessionHandlers';
import log from './logger';
import { getEditProvenanceStore } from './orchestration/editProvenance';
import { shadowRouteHookEvent } from './router/routerShadow';
import { getOutcomeObserver, getTelemetryStore } from './telemetry';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

// HookEventType is defined in hooksLifecycleHandlers.ts to avoid a circular
// dependency. Re-export it here so callers that import from hooks.ts still work.
export type { HookEventType } from './hooksLifecycleHandlers';

export interface HookPayload {
  type: HookEventType;
  sessionId: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  output?: unknown;
  taskLabel?: string;
  durationMs?: number;
  timestamp: number;
  requestId?: string;
  parentSessionId?: string;
  prompt?: string;
  model?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  /** Provider-reported cost in USD (set on agent_end for chat bridge sessions). */
  costUsd?: number;
  /** Working directory of the Claude Code session — set by hook scripts */
  cwd?: string;
  /** True when the session was spawned internally by the IDE (e.g. Haiku summarizer, CLAUDE.md generator) */
  internal?: boolean;
  /** True when the event originates from a Claude Code process spawned inside the IDE (terminal or agent PTY). */
  ideSpawned?: boolean;
  /** Correlation ID for linking related events (e.g. pre_tool_use → post_tool_use). */
  correlationId?: string;
  /** Catch-all for event-specific data forwarded from Claude Code stdin JSON. */
  data?: Record<string, unknown>;
}

export interface AgentEvent {
  type: 'tool_call' | 'tool_result' | 'message' | 'error' | 'status';
  sessionId?: string;
  agentId?: string;
  timestamp: number;
  payload: unknown;
}

export interface ToolCallEvent extends AgentEvent {
  type: 'tool_call';
  payload: {
    tool: string;
    input: Record<string, unknown>;
    callId: string;
  };
}

// truncatePayloadForDispatch is imported from hooksDispatchLogic.ts

let mainWindow: BrowserWindow | null = null;

const pendingQueue: HookPayload[] = [];

// Session inference: maps sessionId→lastSeen and sessionId→cwd for tool events with unknown IDs
const activeSessions = new Map<string, number>();
const sessionCwdMap = new Map<string, string>();

// Tracks session IDs created by synthetic events (chat bridge). While any
// synthetic session is active, lifecycle events from Claude Code hook scripts
// are suppressed to prevent phantom sessions in the Agent Monitor.
const syntheticSessionIds = new Set<string>();

// beginChatSessionLaunch / endChatSessionLaunch are re-exported from hooksChatLaunch.ts
export { beginChatSessionLaunch, endChatSessionLaunch } from './hooksChatLaunch';

function trackSessionLifecycle(payload: HookPayload): void {
  trackSessionLifecycleLogic(activeSessions, sessionCwdMap, payload);
}

function inferSessionId(payload: HookPayload): HookPayload {
  const result = inferSessionIdLogic(activeSessions, payload);
  if (result.sessionId !== payload.sessionId) {
    log.debug(`inferred session for tool event: ${payload.sessionId} → ${result.sessionId}`);
  }
  return result;
}

function isRenderableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function queuePendingPayload(payload: HookPayload): void {
  log.info(`queuing event (no window): ${payload.type} session=${payload.sessionId}`);
  queuePayload(pendingQueue, payload);
}

function getDispatchWindows(): BrowserWindow[] {
  const activeWindows = getAllActiveWindows().filter((window) => !window.isDestroyed());
  if (activeWindows.length > 0) return activeWindows;
  return isRenderableWindow(mainWindow) ? [mainWindow] : [];
}

function sendPayload(windows: BrowserWindow[], payload: HookPayload): void {
  // Truncate large fields before crossing IPC — original payload stays intact for other consumers.
  const ipcPayload = truncatePayloadForDispatch(payload);
  for (const window of windows) {
    try {
      // Use mainFrame.send directly — webContents.send wraps this in its own
      // try-catch that console.errors before re-throwing, producing noisy logs
      // when the render frame is disposed during navigation/reload.
      window.webContents.mainFrame.send('hooks:event', ipcPayload);
    } catch {
      // Render frame disposed — silently skip this window
    }
  }
  broadcastToWebClients('hooks:event', ipcPayload);
}

function flushPendingQueue(windows: BrowserWindow[]): void {
  for (const payload of drainQueue(pendingQueue)) {
    sendPayload(windows, payload);
  }
}

function dispatchNewEventType(payload: HookPayload): boolean {
  if (payload.type === 'session_end') {
    handleSessionEnd(payload);
    return true;
  }
  if (payload.type === 'cwd_changed') {
    handleCwdChanged(sessionCwdMap, payload);
    return true;
  }
  if (payload.type === 'file_changed') {
    handleFileChanged(payload);
    return true;
  }
  if (payload.type === 'config_change') {
    handleConfigChange(payload.sessionId);
    return true;
  }
  if (payload.type === 'permission_request') {
    enrichFromPermissionRequest(payload);
    return true;
  }
  return false;
}

function dispatchLifecycleEvent(payload: HookPayload): void {
  if (payload.type === 'session_start') {
    handleSessionStart(payload);
    return;
  }
  if (dispatchNewEventType(payload)) return;

  const isEndEvent =
    payload.type === 'session_stop' ||
    payload.type === 'agent_stop' ||
    payload.type === 'agent_end';

  if (isEndEvent) handleSessionEnd(payload);
  if (payload.type === 'session_stop') handleSessionStop(payload, sessionCwdMap);
}

function handleApprovalRequest(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use' || !payload.toolName || !payload.requestId) return;

  if (payload.internal || !toolRequiresApproval(payload.toolName, payload.sessionId)) {
    void respondToApproval(payload.requestId, { decision: 'approve' });
    return;
  }

  requestApproval({
    requestId: payload.requestId,
    toolName: payload.toolName,
    toolInput: (payload.input ?? {}) as Record<string, unknown>,
    sessionId: payload.sessionId,
    timestamp: payload.timestamp,
  });
}

function clearApprovalRulesForEndedSession(payload: HookPayload): void {
  if (payload.type === 'agent_stop' || payload.type === 'agent_end') {
    clearSessionRules(payload.sessionId);
  }
}

const CONFLICT_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function tapConflictMonitor(payload: HookPayload): void {
  if (payload.type !== 'post_tool_use') return;
  if (!payload.toolName || !CONFLICT_EDIT_TOOLS.has(payload.toolName)) return;
  const filePath =
    (payload.input as Record<string, unknown> | undefined)?.file_path as string | undefined ??
    (payload.input as Record<string, unknown> | undefined)?.path as string | undefined;
  if (!filePath) return;
  const cwd = sessionCwdMap.get(payload.sessionId) ?? '';
  log.info(
    `[trace:conflict] emission session=${payload.sessionId} tool=${payload.toolName} file=${filePath}`,
  );
  // Detach from hook pipe response — must not block the named-pipe handler
  setImmediate(() => {
    try {
      getConflictMonitor().recordEdit(cwd, payload.sessionId, filePath);
    } catch (err) {
      log.warn('[conflictMonitor] recordEdit error:', err);
    }
  });
}

function tapEditProvenance(payload: HookPayload): void {
  if (payload.type !== 'post_tool_use') return;
  if (!payload.toolName || !CONFLICT_EDIT_TOOLS.has(payload.toolName)) return;
  const filePath =
    (payload.input as Record<string, unknown> | undefined)?.file_path as string | undefined ??
    (payload.input as Record<string, unknown> | undefined)?.path as string | undefined;
  if (!filePath) return;
  setImmediate(() => {
    try {
      getEditProvenanceStore()?.markAgentEdit(filePath, payload.correlationId);
    } catch (err) {
      log.warn('[editProvenance] markAgentEdit error:', err);
    }
  });
}

function dispatchToRenderer(rawPayload: HookPayload): void {
  if (getChatLaunchesInFlight() > 0 || syntheticSessionIds.size > 0) {
    log.info(
      `suppressing hook event during active chat session: ${rawPayload.type} session=${rawPayload.sessionId}`,
    );
    handleApprovalRequest(rawPayload);
    return;
  }

  shadowRouteHookEvent(rawPayload);
  getTelemetryStore()?.record(rawPayload);
  if (rawPayload.type === 'post_tool_use') {
    getOutcomeObserver()?.noteToolUseEvent(
      rawPayload.sessionId,
      rawPayload.correlationId ?? '',
      rawPayload.timestamp,
    );
  }
  trackSessionLifecycle(rawPayload);
  const payload = inferSessionId(rawPayload);

  const windows = getDispatchWindows();
  if (windows.length === 0) {
    queuePendingPayload(payload);
    return;
  }

  flushPendingQueue(windows);
  log.debug(
    `dispatching to ${windows.length} renderer(s): ${payload.type} session=${payload.sessionId} tool=${payload.toolName ?? ''}`,
  );
  sendPayload(windows, payload);
  dispatchLifecycleEvent(payload);
  handleApprovalRequest(payload);
  clearApprovalRulesForEndedSession(payload);
  tapConflictMonitor(payload);
  tapEditProvenance(payload);
  tapContextOutcomeObserver(payload);
}

function evictOrphanedSessions(): void {
  const evicted = evictOrphanedSessionsLogic(activeSessions, sessionCwdMap);
  for (const id of evicted) {
    log.info(`evicting orphaned session: ${id}`);
  }
}

export async function startHooksServer(window: BrowserWindow): Promise<{ port: number | string }> {
  mainWindow = window;
  setInterval(evictOrphanedSessions, 5 * 60 * 1000);
  return startHooksNetServer(window, pendingQueue, dispatchToRenderer);
}

export function stopHooksServer(): Promise<void> {
  return stopHooksNetServer();
}

/** Dispatch a synthetic hook event (from chat orchestration). Skips approval — chat sessions manage permissions. */
export function dispatchSyntheticHookEvent(rawPayload: HookPayload): void {
  const payload: HookPayload = { ...rawPayload, ideSpawned: true };
  getTelemetryStore()?.record(payload);
  if (payload.type === 'post_tool_use') {
    getOutcomeObserver()?.noteToolUseEvent(
      payload.sessionId,
      payload.correlationId ?? '',
      payload.timestamp,
    );
  }
  trackSessionLifecycle(payload);

  if (payload.type === 'agent_start') syntheticSessionIds.add(payload.sessionId);
  if (payload.type === 'agent_end') {
    const id = payload.sessionId;
    // 2-second delay: long enough to absorb in-flight hook events arriving
    // after agent_end (pipe/network latency), short enough to stop suppressing
    // legitimate events with the same session ID quickly.
    setTimeout(() => syntheticSessionIds.delete(id), 2_000);
  }

  const windows = getDispatchWindows();
  if (windows.length === 0) {
    queuePendingPayload(payload);
    return;
  }

  flushPendingQueue(windows);
  sendPayload(windows, payload);
  dispatchLifecycleEvent(payload);
  tapConflictMonitor(payload);
  tapEditProvenance(payload);
  tapContextOutcomeObserver(payload);
}

export function getHooksAddress(): string | null {
  return getHooksNetAddress();
}
