/**
 * ToolCallFeed.test.ts — Unit tests for ToolCallFeed helpers.
 */

import { describe, expect, it } from 'vitest';

import { buildFeedItems } from './ToolCallFeed';
import type { ConversationTurn, ToolCallEvent } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeToolCall(id: string, timestamp: number): ToolCallEvent {
  return { id, toolName: 'Read', input: 'file.ts', timestamp, status: 'success' };
}

function makeTurn(type: ConversationTurn['type'], timestamp: number): ConversationTurn {
  return { type, content: 'hello', timestamp };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildFeedItems', () => {
  it('returns only tool items when no conversationTurns provided', () => {
    const calls = [makeToolCall('a', 100), makeToolCall('b', 200)];
    const items = buildFeedItems(calls, undefined);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'tool')).toBe(true);
  });

  it('returns only tool items when conversationTurns is empty', () => {
    const calls = [makeToolCall('a', 100)];
    const items = buildFeedItems(calls, []);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('tool');
  });

  it('merges and sorts by timestamp ascending', () => {
    const calls = [makeToolCall('t1', 300), makeToolCall('t2', 100)];
    const turns = [makeTurn('prompt', 200)];
    const items = buildFeedItems(calls, turns);
    expect(items).toHaveLength(3);
    expect(items[0].item.timestamp).toBe(100);
    expect(items[1].item.timestamp).toBe(200);
    expect(items[2].item.timestamp).toBe(300);
  });

  it('correctly labels kind for each item type', () => {
    const calls = [makeToolCall('t1', 100)];
    const turns = [makeTurn('elicitation', 200)];
    const items = buildFeedItems(calls, turns);
    const tool = items.find((i) => i.kind === 'tool');
    const turn = items.find((i) => i.kind === 'turn');
    expect(tool).toBeDefined();
    expect(turn).toBeDefined();
  });

  it('returns empty array when both inputs are empty', () => {
    expect(buildFeedItems([], [])).toEqual([]);
  });

  it('handles turns-only scenario (no tool calls)', () => {
    const turns = [makeTurn('prompt', 50), makeTurn('elicitation', 150)];
    const items = buildFeedItems([], turns);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'turn')).toBe(true);
  });

  it('preserves tool call id on tool items', () => {
    const calls = [makeToolCall('my-id', 100)];
    const items = buildFeedItems(calls, undefined);
    const fi = items[0];
    if (fi.kind === 'tool') {
      expect(fi.item.id).toBe('my-id');
    }
  });
});
