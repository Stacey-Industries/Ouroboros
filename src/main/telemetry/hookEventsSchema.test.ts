/**
 * hookEventsSchema.test.ts — smoke tests for hookEventsSchema.ts
 *
 * The schema module is pure types + constants — no runtime logic.
 * Tests verify the exported constant value and that the HookEventType
 * union covers the expected set of event types (structural contract so
 * any accidental removal is caught).
 */

import { describe, expect, it } from 'vitest';

import {
  HOOK_EVENTS_SCHEMA_VERSION,
  type HookEventRecord,
  type HookEventType,
} from './hookEventsSchema';

describe('HOOK_EVENTS_SCHEMA_VERSION', () => {
  it('is 1', () => {
    expect(HOOK_EVENTS_SCHEMA_VERSION).toBe(1);
  });
});

describe('HookEventRecord shape', () => {
  it('accepts a well-formed record without type error', () => {
    const record: HookEventRecord = {
      eventType: 'pre_tool_use',
      sessionId: 'session-abc',
      eventId: '00000000-0000-0000-0000-000000000001',
      payload: { tool_name: 'Read', tool_input: { file_path: '/foo.ts' } },
    };
    expect(record.eventType).toBe('pre_tool_use');
    expect(record.sessionId).toBe('session-abc');
    expect(typeof record.eventId).toBe('string');
    expect(typeof record.payload).toBe('object');
  });
});

describe('HookEventType coverage', () => {
  // Enumerate each type so removing one from the union fails the test.
  const expected: HookEventType[] = [
    'pre_tool_use',
    'post_tool_use',
    'user_prompt_submit',
    'session_start',
    'session_end',
    'agent_start',
    'agent_end',
    'agent_stop',
    'task_completed',
  ];

  it.each(expected)('"%s" is a valid HookEventType', (eventType) => {
    const record: HookEventRecord = {
      eventType,
      sessionId: 's1',
      eventId: 'eid-1',
      payload: {},
    };
    expect(record.eventType).toBe(eventType);
  });
});
