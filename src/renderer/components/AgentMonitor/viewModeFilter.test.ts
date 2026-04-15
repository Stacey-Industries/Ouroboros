/**
 * viewModeFilter.test.ts — Unit tests for viewModeFilter helpers.
 */

import { describe, expect, it } from 'vitest';

import { filterByViewMode, isEventTypeVisible } from './viewModeFilter';

// ─── isEventTypeVisible ───────────────────────────────────────────────────────

describe('isEventTypeVisible — verbose', () => {
  it('shows all event types', () => {
    expect(isEventTypeVisible('file_changed', 'verbose')).toBe(true);
    expect(isEventTypeVisible('cwd_changed', 'verbose')).toBe(true);
    expect(isEventTypeVisible('pre_tool_use', 'verbose')).toBe(true);
    expect(isEventTypeVisible('anything_unknown', 'verbose')).toBe(true);
  });
});

describe('isEventTypeVisible — normal', () => {
  it('hides file_changed', () => {
    expect(isEventTypeVisible('file_changed', 'normal')).toBe(false);
  });

  it('hides cwd_changed', () => {
    expect(isEventTypeVisible('cwd_changed', 'normal')).toBe(false);
  });

  it('shows pre_tool_use', () => {
    expect(isEventTypeVisible('pre_tool_use', 'normal')).toBe(true);
  });

  it('shows notification', () => {
    expect(isEventTypeVisible('notification', 'normal')).toBe(true);
  });

  it('shows unknown event types', () => {
    expect(isEventTypeVisible('some_other_event', 'normal')).toBe(true);
  });
});

describe('isEventTypeVisible — summary', () => {
  it('shows pre_tool_use', () => {
    expect(isEventTypeVisible('pre_tool_use', 'summary')).toBe(true);
  });

  it('shows post_tool_use_failure', () => {
    expect(isEventTypeVisible('post_tool_use_failure', 'summary')).toBe(true);
  });

  it('shows user_prompt_submit', () => {
    expect(isEventTypeVisible('user_prompt_submit', 'summary')).toBe(true);
  });

  it('shows notification', () => {
    expect(isEventTypeVisible('notification', 'summary')).toBe(true);
  });

  it('shows session_start', () => {
    expect(isEventTypeVisible('session_start', 'summary')).toBe(true);
  });

  it('shows session_end', () => {
    expect(isEventTypeVisible('session_end', 'summary')).toBe(true);
  });

  it('hides file_changed', () => {
    expect(isEventTypeVisible('file_changed', 'summary')).toBe(false);
  });

  it('hides cwd_changed', () => {
    expect(isEventTypeVisible('cwd_changed', 'summary')).toBe(false);
  });

  it('hides post_tool_use (non-failure)', () => {
    expect(isEventTypeVisible('post_tool_use', 'summary')).toBe(false);
  });

  it('hides unknown event types', () => {
    expect(isEventTypeVisible('some_other_event', 'summary')).toBe(false);
  });
});

// ─── filterByViewMode ─────────────────────────────────────────────────────────

describe('filterByViewMode', () => {
  const events = [
    { type: 'file_changed', id: 1 },
    { type: 'cwd_changed', id: 2 },
    { type: 'pre_tool_use', id: 3 },
    { type: 'notification', id: 4 },
    { type: 'some_other', id: 5 },
  ];

  it('verbose returns all items unchanged', () => {
    expect(filterByViewMode(events, 'verbose')).toHaveLength(5);
  });

  it('normal removes file_changed and cwd_changed', () => {
    const result = filterByViewMode(events, 'normal');
    expect(result).toHaveLength(3);
    expect(result.some((e) => e.type === 'file_changed')).toBe(false);
    expect(result.some((e) => e.type === 'cwd_changed')).toBe(false);
  });

  it('summary returns only allowed types', () => {
    const result = filterByViewMode(events, 'summary');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.type)).toEqual(['pre_tool_use', 'notification']);
  });

  it('handles empty array', () => {
    expect(filterByViewMode([], 'normal')).toEqual([]);
  });
});
