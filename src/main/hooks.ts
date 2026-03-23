/** hooks.ts - Hook event dispatch for Claude Code sessions. Socket/server code is in hooksNet.ts. */

import { BrowserWindow } from 'electron';

import {
  clearSessionRules,
  requestApproval,
  respondToApproval,
  toolRequiresApproval,
} from './approvalManager';
import { generateClaudeMd } from './claudeMdGenerator';
import { getGraphController } from './codebaseGraph/graphController';
import { getContextLayerController } from './contextLayer/contextLayerController';
import { dispatchActivationEvent } from './extensions';
import { getHooksNetAddress, startHooksNetServer, stopHooksNetServer } from './hooksNet';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './ipc-handlers/agentChat';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_start'
  | 'agent_stop'
  | 'agent_end'
  | 'session_start'
  | 'session_stop';

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
  /** Working directory of the Claude Code session — set by hook scripts */
  cwd?: string;
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
  if (payload.type === 'session_stop' || payload.type === 'agent_end') {
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
  // Only infer for tool events with unknown/missing session IDs
  if (payload.sessionId !== 'unknown' && payload.sessionId !== '') {
    return payload;
  }
  if (payload.type !== 'pre_tool_use' && payload.type !== 'post_tool_use') {
    return payload;
  }

  // Find the most recently active session
  let bestId: string | null = null;
  let bestTime = -1;
  for (const [id, lastSeen] of activeSessions) {
    if (lastSeen > bestTime) {
      bestTime = lastSeen;
      bestId = id;
    }
  }

  if (bestId) {
    console.log(`[hooks] inferred session for tool event: ${payload.sessionId} → ${bestId}`);
    return { ...payload, sessionId: bestId };
  }

  return payload;
}

function isRenderableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function queuePendingPayload(payload: HookPayload): void {
  console.log(`[hooks] queuing event (no window): ${payload.type} session=${payload.sessionId}`);
  if (pendingQueue.length < MAX_PENDING_QUEUE) {
    pendingQueue.push(payload);
  }
}

function getDispatchWindows(): BrowserWindow[] {
  const activeWindows = getAllActiveWindows().filter((window) => !window.isDestroyed());
  if (activeWindows.length > 0) {
    return activeWindows;
  }
  return isRenderableWindow(mainWindow) ? [mainWindow] : [];
}

function sendPayload(windows: BrowserWindow[], payload: HookPayload): void {
  for (const window of windows) {
    window.webContents.send('hooks:event', payload);
  }
  broadcastToWebClients('hooks:event', payload);
}

function flushPendingQueue(windows: BrowserWindow[]): void {
  if (pendingQueue.length === 0) {
    return;
  }

  const flushing = pendingQueue.splice(0);
  for (const payload of flushing) {
    sendPayload(windows, payload);
  }
}

function triggerClaudeMdGeneration(
  trigger: 'post-session' | 'post-commit',
  payload: HookPayload,
): void {
  try {
    const settings = getConfigValue('claudeMdSettings');
    if (!settings?.enabled || settings.triggerMode !== trigger) return;

    // Determine project root from (in priority order):
    // 1. The cwd field on the hook payload (set by updated hook scripts)
    // 2. The session→cwd registry (populated on session_start/agent_start)
    // 3. Skip generation — we don't know which project this session was in
    const projectRoot = payload.cwd ?? sessionCwdMap.get(payload.sessionId) ?? null;

    // Clean up the registry entry now that the session is done
    sessionCwdMap.delete(payload.sessionId);

    if (!projectRoot) {
      console.log(
        `[claude-md] Skipping auto-generation — cannot determine project root for session ${payload.sessionId}`,
      );
      return;
    }

    console.log(`[claude-md] Auto-generating for ${projectRoot} (session ${payload.sessionId})`);

    generateClaudeMd(projectRoot).catch((err: unknown) => {
      console.error('[claude-md] Auto-generation failed:', err);
    });
  } catch {
    // Config not available yet — ignore
  }
}

function dispatchLifecycleEvent(payload: HookPayload): void {
  if (payload.type === 'session_start') {
    dispatchActivationEvent('onSessionStart', { sessionId: payload.sessionId }).catch(() => {});
    getContextLayerController()?.onSessionStart();
    getGraphController()?.onSessionStart();
    return;
  }

  if (
    payload.type === 'session_stop' ||
    payload.type === 'agent_stop' ||
    payload.type === 'agent_end'
  ) {
    dispatchActivationEvent('onSessionEnd', { sessionId: payload.sessionId }).catch(() => {});
  }

  // Only treat a session_stop as a potential git commit — a PTY Claude Code
  // session may have committed files.  agent_end fires for every sub-agent
  // completion (including internal chat API agents) and does not imply a git
  // state change, so calling onGitCommit() there marks all modules dirty
  // unnecessarily and causes a full re-index on every subsequent message.
  if (payload.type === 'session_stop') {
    getContextLayerController()?.onGitCommit();
    getGraphController()?.onGitCommit();
    invalidateAgentChatCache();
    // Trigger CLAUDE.md generation if configured for post-session
    triggerClaudeMdGeneration('post-session', payload);
  }
}

function handleApprovalRequest(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use' || !payload.toolName || !payload.requestId) {
    return;
  }

  if (!toolRequiresApproval(payload.toolName, payload.sessionId)) {
    respondToApproval(payload.requestId, { decision: 'approve' });
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
  // Track sessions from lifecycle events, then infer session for tool events
  trackSessionLifecycle(rawPayload);
  const payload = inferSessionId(rawPayload);

  const windows = getDispatchWindows();
  if (windows.length === 0) {
    queuePendingPayload(payload);
    return;
  }

  flushPendingQueue(windows);
  console.log(
    `[hooks] dispatching to ${windows.length} renderer(s): ${payload.type} session=${payload.sessionId} tool=${payload.toolName ?? ''}`,
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
