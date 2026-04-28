/**
 * hookEventsDrainHandler.ts — Wave 53a Phase A
 *
 * Drain handler for the 'hook-events' telemetry parity surface. Routes each
 * queued hook event to its existing downstream sink(s), mirroring what
 * `dispatchToRenderer` / `runHookTaps` does in `hooks.ts` for live events.
 *
 * Sinks by event type
 * ───────────────────
 * pre_tool_use            → telemetryStore.record + tapGraphUsage
 * post_tool_use           → telemetryStore.record + tapEditProvenance
 *                           (+ tapGraphUsage skipped — only fires on pre)
 * user_prompt_submit      → telemetryStore.record only
 *                           (Phase C adds shadow-router routing)
 * session_start           → telemetryStore.record
 * session_end             → telemetryStore.record
 * agent_start/end/stop    → telemetryStore.record + trackSessionEnd
 * task_completed          → telemetryStore.record + trackTaskCompleted
 *
 * Dedup key: (sessionId, eventId) — NOT the default (sessionId, surface).
 * Hook events fire N times per session; each has a unique eventId UUID.
 * An in-memory Set covers within-run dedup (queue files are processed once).
 *
 * Conflict outcomes (#6 conflict half) fold in automatically: tapEditProvenance
 * on post_tool_use triggers `getConflictMonitor().recordEdit` via hooksEditTap
 * which is called from here for Edit/Write/MultiEdit post_tool_use events.
 */

import type { HookPayload } from '../hooks';
import { tapEditProvenance } from '../hooksEditTap';
import { tapGraphUsage } from '../hooksGraphUsageTap';
import log from '../logger';
import { trackSessionEnd, trackTaskCompleted } from '../router/qualitySignalCollector';
import { getTelemetryStore } from '../telemetry';
import {
  HOOK_EVENTS_SCHEMA_VERSION,
  type HookEventRecord,
  type HookEventType,
} from './hookEventsSchema';
import { registerSurfaceHandler } from './telemetryDrain';
import type { QueueRecord } from './telemetryQueue';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HOOK_EVENTS_SURFACE = 'hook-events';

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

function isValidHookEventRecord(p: unknown): p is HookEventRecord {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.eventType === 'string' &&
    typeof obj.sessionId === 'string' &&
    typeof obj.eventId === 'string' &&
    typeof obj.payload === 'object' &&
    obj.payload !== null
  );
}

// ---------------------------------------------------------------------------
// Payload → HookPayload adapter
// ---------------------------------------------------------------------------

/**
 * Adapt a `HookEventRecord.payload` (the raw Claude Code event JSON) into a
 * `HookPayload` for the downstream taps. The raw payload already has the right
 * shape; we only need to ensure the required fields are present.
 */
function toHookPayload(record: HookEventRecord): HookPayload {
  const raw = record.payload;
  // Spread raw first so explicit fields below take precedence.
  return {
    ...(raw as Partial<HookPayload>),
    type: record.eventType as HookPayload['type'],
    sessionId: record.sessionId,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    toolName: typeof raw.tool_name === 'string' ? raw.tool_name : undefined,
    correlationId: typeof raw.correlationId === 'string' ? raw.correlationId : undefined,
    ideSpawned: raw.ideSpawned === true,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
    input: raw.tool_input as Record<string, unknown> | undefined,
  };
}

// ---------------------------------------------------------------------------
// Per-event-type routing
// ---------------------------------------------------------------------------

function routeToTelemetryStore(payload: HookPayload): void {
  try {
    getTelemetryStore()?.record(payload);
  } catch (err) {
    log.warn('[hook-events-drain] telemetryStore.record error:', err);
  }
}

function routeGraphUsage(payload: HookPayload): void {
  try {
    tapGraphUsage(payload);
  } catch (err) {
    log.warn('[hook-events-drain] tapGraphUsage error:', err);
  }
}

function routeEditProvenance(payload: HookPayload): void {
  try {
    tapEditProvenance(payload);
  } catch (err) {
    log.warn('[hook-events-drain] tapEditProvenance error:', err);
  }
}

function routeSessionEnd(payload: HookPayload): void {
  try {
    trackSessionEnd({
      type: payload.type,
      sessionId: payload.sessionId,
      cwd: payload.cwd,
    });
  } catch (err) {
    log.warn('[hook-events-drain] trackSessionEnd error:', err);
  }
}

function routeTaskCompleted(payload: HookPayload): void {
  try {
    trackTaskCompleted(payload.sessionId);
  } catch (err) {
    log.warn('[hook-events-drain] trackTaskCompleted error:', err);
  }
}

const SESSION_END_TYPES: ReadonlySet<HookEventType> = new Set([
  'agent_end',
  'agent_stop',
  'session_end',
]);

function dispatchByType(eventType: HookEventType, payload: HookPayload): void {
  routeToTelemetryStore(payload);

  if (eventType === 'pre_tool_use') {
    routeGraphUsage(payload);
    return;
  }
  if (eventType === 'post_tool_use') {
    routeEditProvenance(payload);
    return;
  }
  if (SESSION_END_TYPES.has(eventType)) {
    routeSessionEnd(payload);
    return;
  }
  if (eventType === 'task_completed') {
    routeTaskCompleted(payload);
    return;
  }
  // session_start, user_prompt_submit, agent_start: telemetryStore only.
}

// ---------------------------------------------------------------------------
// Handler factory — exported for direct testing
// ---------------------------------------------------------------------------

/**
 * Create a standalone handler function with its own dedup set.
 * Tests call this directly without going through `registerSurfaceHandler`.
 */
export function createHookEventsHandler(seenKeys: Set<string>) {
  return function handleHookEventRecord(record: QueueRecord): void {
    if (!isValidHookEventRecord(record.payload)) {
      log.warn('[hook-events-drain] invalid payload shape — skipping', record.recordId);
      return;
    }

    const hr = record.payload;
    const dedupKey = `${hr.sessionId}:${hr.eventId}`;

    if (seenKeys.has(dedupKey)) {
      log.info('[hook-events-drain] dedup: already seen', dedupKey);
      return;
    }
    seenKeys.add(dedupKey);

    const eventType = hr.eventType as HookEventType;
    const knownTypes: ReadonlySet<string> = new Set<HookEventType>([
      'pre_tool_use',
      'post_tool_use',
      'user_prompt_submit',
      'session_start',
      'session_end',
      'agent_start',
      'agent_end',
      'agent_stop',
      'task_completed',
    ]);

    if (!knownTypes.has(eventType)) {
      log.warn('[hook-events-drain] unknown eventType — skipping', eventType, record.recordId);
      return;
    }

    const payload = toHookPayload(hr);
    log.info('[hook-events-drain] dispatching', eventType, hr.sessionId);
    dispatchByType(eventType, payload);
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the hook-events drain handler. Call once at IDE boot, before
 * `runParityQueueDrain()` fires.
 */
export function registerHookEventsHandler(): void {
  const seenKeys = new Set<string>();
  log.info('[hook-events-drain] registering handler (schemaVersion=1)');
  registerSurfaceHandler(HOOK_EVENTS_SURFACE, createHookEventsHandler(seenKeys), [
    HOOK_EVENTS_SCHEMA_VERSION,
  ]);
}
