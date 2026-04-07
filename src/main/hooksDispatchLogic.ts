/**
 * hooksDispatchLogic.ts — Pure-logic dispatch functions extracted from hooks.ts.
 *
 * Zero Electron dependencies. All state is passed as arguments so these
 * functions are testable without mocks.
 */

import type { HookPayload } from './hooks';

const MAX_PAYLOAD_FIELD_BYTES = 10_240; // 10 KB

export function truncateField(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= MAX_PAYLOAD_FIELD_BYTES) return value;
  return `${str.slice(0, MAX_PAYLOAD_FIELD_BYTES)}…[truncated]`;
}

export function truncatePayloadForDispatch(payload: HookPayload): HookPayload {
  const needsInput = payload.input !== undefined;
  const needsOutput = payload.output !== undefined;
  if (!needsInput && !needsOutput) return payload;
  return {
    ...payload,
    ...(needsInput && { input: truncateField(payload.input) }),
    ...(needsOutput && { output: truncateField(payload.output) }),
  };
}

// ── Session tracking ──────────────────────────────────────────────────

export function trackSessionStart(
  activeSessions: Map<string, number>,
  sessionCwdMap: Map<string, string>,
  payload: HookPayload,
): void {
  activeSessions.set(payload.sessionId, payload.timestamp);
  if (payload.cwd) {
    sessionCwdMap.set(payload.sessionId, payload.cwd);
  }
}

export function trackKnownSessionEvent(
  activeSessions: Map<string, number>,
  sessionCwdMap: Map<string, string>,
  payload: HookPayload,
): void {
  activeSessions.set(payload.sessionId, payload.timestamp);
  if (payload.cwd && !sessionCwdMap.has(payload.sessionId)) {
    sessionCwdMap.set(payload.sessionId, payload.cwd);
  }
}

export function trackSessionLifecycle(
  activeSessions: Map<string, number>,
  sessionCwdMap: Map<string, string>,
  payload: HookPayload,
): void {
  const isStart = payload.type === 'session_start' || payload.type === 'agent_start';
  if (isStart) {
    trackSessionStart(activeSessions, sessionCwdMap, payload);
    return;
  }

  const isEnd =
    payload.type === 'session_stop' ||
    payload.type === 'session_end' ||
    payload.type === 'agent_end';
  if (isEnd) {
    activeSessions.delete(payload.sessionId);
    return;
  }

  const isKnown = payload.sessionId !== 'unknown' && payload.sessionId !== '';
  if (isKnown && activeSessions.has(payload.sessionId)) {
    trackKnownSessionEvent(activeSessions, sessionCwdMap, payload);
  }
}

// ── Session inference ─────────────────────────────────────────────────

export function inferSessionId(
  activeSessions: Map<string, number>,
  payload: HookPayload,
): HookPayload {
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
    return { ...payload, sessionId: bestId };
  }

  return payload;
}

// ── Orphan eviction ───────────────────────────────────────────────────

const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

export function evictOrphanedSessions(
  activeSessions: Map<string, number>,
  sessionCwdMap: Map<string, string>,
  now: number = Date.now(),
): string[] {
  const evicted: string[] = [];
  for (const [id, timestamp] of activeSessions) {
    if (now - timestamp > MAX_SESSION_AGE_MS) {
      activeSessions.delete(id);
      sessionCwdMap.delete(id);
      evicted.push(id);
    }
  }
  return evicted;
}

// ── Queue management ──────────────────────────────────────────────────

const MAX_PENDING_QUEUE = 500;

export function queuePayload(queue: HookPayload[], payload: HookPayload): boolean {
  if (queue.length >= MAX_PENDING_QUEUE) return false;
  queue.push(payload);
  return true;
}

export function drainQueue(queue: HookPayload[]): HookPayload[] {
  if (queue.length === 0) return [];
  return queue.splice(0);
}
