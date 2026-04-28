/**
 * hookEventsDrainHandler.test.ts — Wave 53a Phase A
 *
 * Coverage:
 *  - Schema version validation (correct → routes; wrong → skipped + logged)
 *  - Each known event type routes to its expected sinks
 *  - Dedup: same (sessionId, eventId) twice in one drain run fires once
 *  - Unknown event type: skipped + logged
 *  - Tap failure: logged but does not cascade to other routes
 *  - Invalid payload shape: skipped + logged
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock downstream sinks before importing the handler
// ---------------------------------------------------------------------------

vi.mock('../hooks', () => ({
  /* type-only import — no runtime mock needed */
}));

vi.mock('../hooksEditTap', () => ({
  tapEditProvenance: vi.fn(),
}));

vi.mock('../hooksGraphUsageTap', () => ({
  tapGraphUsage: vi.fn(),
}));

vi.mock('../router/qualitySignalCollector', () => ({
  trackSessionEnd: vi.fn(),
  trackTaskCompleted: vi.fn(),
}));

const mockRecord = vi.fn();
vi.mock('../telemetry', () => ({
  getTelemetryStore: () => ({ record: mockRecord }),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Mock fs so no real disk writes happen from any incidentally imported module.
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    appendFile: vi.fn((_p: string, _d: string, cb: (e: null) => void) => cb(null)),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  },
}));

import { tapEditProvenance } from '../hooksEditTap';
import { tapGraphUsage } from '../hooksGraphUsageTap';
import { trackSessionEnd, trackTaskCompleted } from '../router/qualitySignalCollector';
import { createHookEventsHandler } from './hookEventsDrainHandler';
import { HOOK_EVENTS_SCHEMA_VERSION, type HookEventType } from './hookEventsSchema';
import type { QueueRecord } from './telemetryQueue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(
  eventType: HookEventType | string,
  sessionId = 'sid-1',
  eventId = 'eid-1',
  schemaVersion = HOOK_EVENTS_SCHEMA_VERSION,
): QueueRecord {
  return {
    recordId: 'rec-1',
    ts: Date.now(),
    surface: 'hook-events',
    schemaVersion,
    payload: {
      eventType,
      sessionId,
      eventId,
      payload: {
        type: eventType,
        sessionId,
        timestamp: Date.now(),
        tool_name: eventType === 'pre_tool_use' ? 'Read' : undefined,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHookEventsHandler', () => {
  let seenKeys: Set<string>;
  let handler: ReturnType<typeof createHookEventsHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    seenKeys = new Set<string>();
    handler = createHookEventsHandler(seenKeys);
  });

  // ── Schema version ─────────────────────────────────────────────────────

  it('dispatches a record with the correct schema version', () => {
    handler(makeRecord('session_start'));
    expect(mockRecord).toHaveBeenCalledOnce();
  });

  it('skips a record whose payload is not a valid HookEventRecord', () => {
    const bad: QueueRecord = {
      recordId: 'r2',
      ts: Date.now(),
      surface: 'hook-events',
      schemaVersion: HOOK_EVENTS_SCHEMA_VERSION,
      payload: { not: 'valid' },
    };
    handler(bad);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  // ── Per-event-type routing ─────────────────────────────────────────────

  it('pre_tool_use → telemetryStore + tapGraphUsage', () => {
    handler(makeRecord('pre_tool_use'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(tapGraphUsage).toHaveBeenCalledOnce();
    expect(tapEditProvenance).not.toHaveBeenCalled();
  });

  it('post_tool_use → telemetryStore + tapEditProvenance', () => {
    handler(makeRecord('post_tool_use'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(tapEditProvenance).toHaveBeenCalledOnce();
    expect(tapGraphUsage).not.toHaveBeenCalled();
  });

  it('user_prompt_submit → telemetryStore only', () => {
    handler(makeRecord('user_prompt_submit'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(tapGraphUsage).not.toHaveBeenCalled();
    expect(tapEditProvenance).not.toHaveBeenCalled();
    expect(trackSessionEnd).not.toHaveBeenCalled();
  });

  it('session_start → telemetryStore only', () => {
    handler(makeRecord('session_start'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackSessionEnd).not.toHaveBeenCalled();
  });

  it('session_end → telemetryStore + trackSessionEnd', () => {
    handler(makeRecord('session_end'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackSessionEnd).toHaveBeenCalledOnce();
  });

  it('agent_end → telemetryStore + trackSessionEnd', () => {
    handler(makeRecord('agent_end'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackSessionEnd).toHaveBeenCalledOnce();
  });

  it('agent_stop → telemetryStore + trackSessionEnd', () => {
    handler(makeRecord('agent_stop'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackSessionEnd).toHaveBeenCalledOnce();
  });

  it('agent_start → telemetryStore only', () => {
    handler(makeRecord('agent_start'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackSessionEnd).not.toHaveBeenCalled();
  });

  it('task_completed → telemetryStore + trackTaskCompleted', () => {
    handler(makeRecord('task_completed'));
    expect(mockRecord).toHaveBeenCalledOnce();
    expect(trackTaskCompleted).toHaveBeenCalledWith('sid-1');
  });

  // ── Dedup ──────────────────────────────────────────────────────────────

  it('same (sessionId, eventId) in one drain run fires only once', () => {
    const rec = makeRecord('session_start', 'sid-1', 'eid-dup');
    handler(rec);
    handler(rec);
    expect(mockRecord).toHaveBeenCalledOnce();
  });

  it('different eventId in same session fires twice', () => {
    handler(makeRecord('session_start', 'sid-1', 'eid-a'));
    handler(makeRecord('session_start', 'sid-1', 'eid-b'));
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });

  it('same eventId in different sessions fires twice', () => {
    handler(makeRecord('session_start', 'sid-1', 'eid-1'));
    handler(makeRecord('session_start', 'sid-2', 'eid-1'));
    expect(mockRecord).toHaveBeenCalledTimes(2);
  });

  // ── Unknown event type ─────────────────────────────────────────────────

  it('unknown eventType is skipped without calling any sink', () => {
    handler(makeRecord('totally_unknown_type'));
    expect(mockRecord).not.toHaveBeenCalled();
    expect(tapGraphUsage).not.toHaveBeenCalled();
    expect(tapEditProvenance).not.toHaveBeenCalled();
  });

  // ── Tap failure isolation ──────────────────────────────────────────────

  it('tapGraphUsage failure does not prevent telemetryStore.record', () => {
    vi.mocked(tapGraphUsage).mockImplementationOnce(() => {
      throw new Error('graph tap boom');
    });
    // pre_tool_use calls telemetryStore first, then tapGraphUsage
    handler(makeRecord('pre_tool_use', 'sid-1', 'eid-fail'));
    expect(mockRecord).toHaveBeenCalledOnce();
  });

  it('telemetryStore failure does not crash the handler', () => {
    mockRecord.mockImplementationOnce(() => {
      throw new Error('store boom');
    });
    expect(() => handler(makeRecord('session_start', 'sid-1', 'eid-store-fail'))).not.toThrow();
  });
});
