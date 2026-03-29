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
import { getConfigValue } from './config';
import { getContextLayerController } from './contextLayer/contextLayerController';
import { dispatchActivationEvent } from './extensions';
import { getHooksNetAddress, startHooksNetServer, stopHooksNetServer } from './hooksNet';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './ipc-handlers/agentChat';
import log from './logger';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'agent_start'
  | 'agent_stop'
  | 'agent_end'
  | 'session_start'
  | 'session_stop'
  | 'instructions_loaded';

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

export function beginChatSessionLaunch(): void { chatLaunchesInFlight++; }
export function endChatSessionLaunch(): void { if (chatLaunchesInFlight > 0) chatLaunchesInFlight--; }

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
  // Only infer for tool events
  if (payload.type !== 'pre_tool_use' && payload.type !== 'post_tool_use') {
    return payload;
  }

  // If the session ID is already tracked (registered via session_start or
  // agent_start), keep it — the event belongs to a known session.
  const isTracked =
    payload.sessionId &&
    payload.sessionId !== 'unknown' &&
    activeSessions.has(payload.sessionId);
  if (isTracked) return payload;

  // Session ID is unknown or untracked (e.g. chat-spawned Claude Code uses a
  // different session ID domain than the synthetic agent_start). Map the tool
  // event to the most recently active tracked session.
  let bestId: string | null = null;
  let bestTime = -1;
  for (const [id, lastSeen] of activeSessions) {
    if (lastSeen > bestTime) {
      bestTime = lastSeen;
      bestId = id;
    }
  }

  if (bestId) {
    log.info(`inferred session for tool event: ${payload.sessionId} → ${bestId}`);
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
      log.info(
        `Skipping auto-generation — cannot determine project root for session ${payload.sessionId}`,
      );
      return;
    }

    log.info(`Auto-generating for ${projectRoot} (session ${payload.sessionId})`);

    generateClaudeMd(projectRoot).catch((err: unknown) => {
      log.error('Auto-generation failed:', err);
    });
  } catch {
    // Config not available yet — ignore
  }
}

function handleSessionStart(payload: HookPayload): void {
  dispatchActivationEvent('onSessionStart', { sessionId: payload.sessionId }).catch(() => {});
  // Internal sessions (Haiku summarizer, CLAUDE.md generator) should not
  // trigger re-indexing — they never change the codebase.
  if (!payload.internal) {
    getContextLayerController()?.onSessionStart();
    getGraphController()?.onSessionStart();
  }
}

function handleSessionEnd(payload: HookPayload): void {
  dispatchActivationEvent('onSessionEnd', { sessionId: payload.sessionId }).catch(() => {});
}

function handleSessionStop(payload: HookPayload): void {
  // Only treat a session_stop as a potential git commit when it came from a
  // real user PTY session.  Internal sessions (Haiku summarizer, CLAUDE.md
  // generator) never commit files and must not mark modules dirty — doing so
  // caused a feedback loop where each summarizer completion re-dirtied every
  // module, triggering another round of summarization.
  if (!payload.internal) {
    getContextLayerController()?.onGitCommit();
    getGraphController()?.onGitCommit();
    invalidateAgentChatCache();
    triggerClaudeMdGeneration('post-session', payload);
  }
}

function dispatchLifecycleEvent(payload: HookPayload): void {
  if (payload.type === 'session_start') {
    handleSessionStart(payload);
    return;
  }

  const isEndEvent =
    payload.type === 'session_stop' ||
    payload.type === 'agent_stop' ||
    payload.type === 'agent_end';

  if (isEndEvent) handleSessionEnd(payload);
  if (payload.type === 'session_stop') handleSessionStop(payload);
}

function handleApprovalRequest(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use' || !payload.toolName || !payload.requestId) {
    return;
  }

  // Internal sessions (Haiku summarizer, CLAUDE.md generator) auto-approve
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
  // While a chat session is launching or streaming, suppress ALL Claude Code
  // hook events from reaching the renderer. The chat bridge's synthetic events
  // are the sole source for the agent monitor during chat sessions. Approval
  // handling still runs so pre_tool_use response-file polling works.
  if (chatLaunchesInFlight > 0 || syntheticSessionIds.size > 0) {
    log.info(`suppressing hook event during active chat session: ${rawPayload.type} session=${rawPayload.sessionId}`);
    handleApprovalRequest(rawPayload);
    return;
  }

  // Track sessions from lifecycle events, then infer session for tool events
  trackSessionLifecycle(rawPayload);
  const payload = inferSessionId(rawPayload);

  const windows = getDispatchWindows();
  if (windows.length === 0) {
    queuePendingPayload(payload);
    return;
  }

  flushPendingQueue(windows);
  log.info(
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

  // Track synthetic session lifecycle so dispatchToRenderer can suppress
  // competing lifecycle events from Claude Code hook scripts.
  if (payload.type === 'agent_start') syntheticSessionIds.add(payload.sessionId);
  if (payload.type === 'agent_end') {
    // Delay removal to suppress trailing hook events from the Claude Code
    // process that arrive after stream-json completion but before the process
    // fully exits (session_stop, agent_end hooks fire asynchronously).
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
