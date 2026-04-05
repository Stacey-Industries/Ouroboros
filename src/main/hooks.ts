/** hooks.ts - Hook event dispatch for Claude Code sessions. Socket/server code is in hooksNet.ts. */

import { BrowserWindow } from 'electron';

import {
  clearSessionRules,
  requestApproval,
  respondToApproval,
  toolRequiresApproval,
} from './approvalManager';
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
import { shadowRouteHookEvent } from './router/routerShadow';
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

const MAX_PENDING_QUEUE = 500;

let mainWindow: BrowserWindow | null = null;

const pendingQueue: HookPayload[] = [];

// Session inference: maps sessionId→lastSeen and sessionId→cwd for tool events with unknown IDs
const activeSessions = new Map<string, number>();
const sessionCwdMap = new Map<string, string>();

// Tracks session IDs created by synthetic events (chat bridge). While any
// synthetic session is active, lifecycle events from Claude Code hook scripts
// are suppressed to prevent phantom sessions in the Agent Monitor.
const syntheticSessionIds = new Set<string>();

// Counter for chat sessions being launched. Set BEFORE Claude Code spawns
// (via beginChatSessionLaunch), cleared when the synthetic agent_start fires
// (via endChatSessionLaunch). Bridges the race between Claude Code hook
// scripts firing and the chat bridge emitting its synthetic session.
let chatLaunchesInFlight = 0;

export function beginChatSessionLaunch(): void {
  chatLaunchesInFlight++;
}
export function endChatSessionLaunch(): void {
  if (chatLaunchesInFlight > 0) chatLaunchesInFlight--;
}

function trackSessionStart(payload: HookPayload): void {
  activeSessions.set(payload.sessionId, payload.timestamp);
  if (payload.cwd) {
    sessionCwdMap.set(payload.sessionId, payload.cwd);
  }
}

function trackKnownSessionEvent(payload: HookPayload): void {
  activeSessions.set(payload.sessionId, payload.timestamp);
  if (payload.cwd && !sessionCwdMap.has(payload.sessionId)) {
    sessionCwdMap.set(payload.sessionId, payload.cwd);
  }
}

function trackSessionLifecycle(payload: HookPayload): void {
  if (payload.type === 'session_start' || payload.type === 'agent_start') {
    trackSessionStart(payload);
    return;
  }
  if (
    payload.type === 'session_stop' ||
    payload.type === 'session_end' ||
    payload.type === 'agent_end'
  ) {
    activeSessions.delete(payload.sessionId);
    // cwd cleanup is deferred — triggerClaudeMdGeneration reads it before we delete
    return;
  }
  const isKnown = payload.sessionId !== 'unknown' && payload.sessionId !== '';
  if (isKnown && activeSessions.has(payload.sessionId)) {
    trackKnownSessionEvent(payload);
  }
}

function inferSessionId(payload: HookPayload): HookPayload {
  if (payload.type !== 'pre_tool_use' && payload.type !== 'post_tool_use') {
    return payload;
  }

  const isTracked =
    payload.sessionId && payload.sessionId !== 'unknown' && activeSessions.has(payload.sessionId);
  if (isTracked) return payload;

  let bestId: string | null = null;
  let bestTime = -1;
  for (const [id, lastSeen] of activeSessions) {
    if (lastSeen > bestTime) {
      bestTime = lastSeen;
      bestId = id;
    }
  }

  if (bestId) {
    log.debug(`inferred session for tool event: ${payload.sessionId} → ${bestId}`);
    return { ...payload, sessionId: bestId };
  }

  return payload;
}

function isRenderableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function queuePendingPayload(payload: HookPayload): void {
  log.info(`queuing event (no window): ${payload.type} session=${payload.sessionId}`);
  if (pendingQueue.length < MAX_PENDING_QUEUE) {
    pendingQueue.push(payload);
  }
}

function getDispatchWindows(): BrowserWindow[] {
  const activeWindows = getAllActiveWindows().filter((window) => !window.isDestroyed());
  if (activeWindows.length > 0) return activeWindows;
  return isRenderableWindow(mainWindow) ? [mainWindow] : [];
}

function sendPayload(windows: BrowserWindow[], payload: HookPayload): void {
  for (const window of windows) {
    try {
      // Use mainFrame.send directly — webContents.send wraps this in its own
      // try-catch that console.errors before re-throwing, producing noisy logs
      // when the render frame is disposed during navigation/reload.
      window.webContents.mainFrame.send('hooks:event', payload);
    } catch {
      // Render frame disposed — silently skip this window
    }
  }
  broadcastToWebClients('hooks:event', payload);
}

function flushPendingQueue(windows: BrowserWindow[]): void {
  if (pendingQueue.length === 0) return;
  const flushing = pendingQueue.splice(0);
  for (const payload of flushing) {
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

function dispatchToRenderer(rawPayload: HookPayload): void {
  if (chatLaunchesInFlight > 0 || syntheticSessionIds.size > 0) {
    log.info(
      `suppressing hook event during active chat session: ${rawPayload.type} session=${rawPayload.sessionId}`,
    );
    handleApprovalRequest(rawPayload);
    return;
  }

  shadowRouteHookEvent(rawPayload);
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
}

export async function startHooksServer(window: BrowserWindow): Promise<{ port: number | string }> {
  mainWindow = window;
  return startHooksNetServer(window, pendingQueue, dispatchToRenderer);
}

export function stopHooksServer(): Promise<void> {
  return stopHooksNetServer();
}

/** Dispatch a synthetic hook event (from chat orchestration). Skips approval — chat sessions manage permissions. */
export function dispatchSyntheticHookEvent(payload: HookPayload): void {
  trackSessionLifecycle(payload);

  if (payload.type === 'agent_start') syntheticSessionIds.add(payload.sessionId);
  if (payload.type === 'agent_end') {
    const id = payload.sessionId;
    setTimeout(() => syntheticSessionIds.delete(id), 10_000);
  }

  const windows = getDispatchWindows();
  if (windows.length === 0) {
    queuePendingPayload(payload);
    return;
  }

  flushPendingQueue(windows);
  sendPayload(windows, payload);
  dispatchLifecycleEvent(payload);
}

export function getHooksAddress(): string | null {
  return getHooksNetAddress();
}
