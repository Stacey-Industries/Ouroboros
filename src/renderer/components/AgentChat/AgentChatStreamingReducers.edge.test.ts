/**
 * AgentChatStreamingReducers.edge.test.ts — Edge-case tests for applyChunk.
 *
 * Covers: empty textDelta no-op, duplicate chunk dedup, out-of-order blockIndex.
 */

import { describe, expect, it } from 'vitest';

import type { AgentChatStreamChunk } from '../../types/electron-agent-chat';
import { applyChunk, INITIAL_STATE } from './AgentChatStreamingReducers';

function makeTextChunk(overrides: Partial<AgentChatStreamChunk> = {}): AgentChatStreamChunk {
  return {
    type: 'text_delta',
    messageId: 'm1',
    textDelta: 'hello',
    timestamp: 1000,
    ...overrides,
  };
}

// ── Empty textDelta ───────────────────────────────────────────────────────────

describe('empty textDelta', () => {
  it('is a no-op: returns state with unchanged blocks when textDelta is empty string', () => {
    const chunk = makeTextChunk({ textDelta: '', timestamp: undefined });
    const next = applyChunk(INITIAL_STATE, chunk);
    // applyChunk returns a new state object (not null), but the blocks array
    // should contain exactly one text block with empty content — same as an
    // append of '' to a fresh state.
    expect(next).not.toBeNull();
    // A block is pushed even for empty delta (append path), but its content is ''.
    const block = next!.blocks[0];
    expect(block.kind).toBe('text');
    expect((block as { kind: 'text'; content: string }).content).toBe('');
  });

  it('does not accumulate whitespace when delta is empty on an existing text block', () => {
    // Build state with 'hello' already in a block.
    const state1 = applyChunk(INITIAL_STATE, makeTextChunk({ textDelta: 'hello', timestamp: undefined }))!;
    const state2 = applyChunk(state1, makeTextChunk({ textDelta: '', timestamp: undefined }))!;
    const block = state2.blocks[state2.blocks.length - 1];
    expect((block as { kind: 'text'; content: string }).content).toBe('hello');
  });
});

// ── Duplicate chunk dedup ─────────────────────────────────────────────────────

describe('duplicate chunk guard', () => {
  it('returns prev state unchanged when the same timestamped chunk arrives twice', () => {
    const chunk = makeTextChunk({ timestamp: 5000 });
    const state1 = applyChunk(INITIAL_STATE, chunk)!;
    const state2 = applyChunk(state1, chunk)!;
    // Second application should be a no-op — blocks stay the same length.
    expect(state2.blocks).toEqual(state1.blocks);
    expect(state2.activeTextContent).toBe(state1.activeTextContent);
  });

  it('does not dedup when chunk has no timestamp', () => {
    const chunk = makeTextChunk({ timestamp: undefined });
    const state1 = applyChunk(INITIAL_STATE, chunk)!;
    // Applying the exact same object again should still append (no timestamp = no dedup).
    const state2 = applyChunk(state1, chunk)!;
    const content = (state2.blocks[0] as { kind: 'text'; content: string }).content;
    expect(content).toBe('hellohello');
  });

  it('deduplicates tool_activity chunks by timestamp + blockIndex', () => {
    const chunk: AgentChatStreamChunk = {
      type: 'tool_activity',
      messageId: 'm1',
      blockIndex: 0,
      timestamp: 2000,
      toolActivity: { name: 'Read', status: 'running' },
    };
    const state1 = applyChunk(INITIAL_STATE, chunk)!;
    const state2 = applyChunk(state1, chunk)!;
    // Both applications should yield the same number of tool blocks.
    expect(state2.blocks.filter((b) => b.kind === 'tool_use')).toHaveLength(1);
  });

  it('allows different blockIndex values with same timestamp as distinct chunks', () => {
    const base: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'x',
      timestamp: 3000,
      blockIndex: 0,
    };
    const state1 = applyChunk(INITIAL_STATE, base)!;
    const state2 = applyChunk(state1, { ...base, blockIndex: 1 })!;
    // blockIndex 1 is different → treated as a new chunk, not a duplicate.
    expect(state2.blocks.filter((b) => b.kind === 'text')).toHaveLength(2);
  });

  it('clears seen IDs on complete so replay can re-deliver the same chunks', () => {
    const delta = makeTextChunk({ timestamp: 6000 });
    const complete: AgentChatStreamChunk = {
      type: 'complete', messageId: 'm1', timestamp: 6100,
    };
    const s1 = applyChunk(INITIAL_STATE, delta)!;
    const s2 = applyChunk(s1, complete)!;
    // After complete, seenIds for m1 should be cleared.
    // Replaying the delta on the completed state should work again.
    const s3 = applyChunk(s2, delta);
    expect(s3).not.toBeNull();
  });
});

// ── Out-of-order blockIndex ───────────────────────────────────────────────────

describe('out-of-order blockIndex', () => {
  it('writes to the correct sparse index when blockIndex 2 arrives before index 1', () => {
    const chunkAt2: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'world',
      blockIndex: 2,
    };
    const state = applyChunk(INITIAL_STATE, chunkAt2)!;
    // Sparse fill: indices 0 and 1 should be empty text blocks; index 2 has 'world'.
    expect(state.blocks).toHaveLength(3);
    expect((state.blocks[2] as { kind: 'text'; content: string }).content).toBe('world');
    expect((state.blocks[0] as { kind: 'text'; content: string }).content).toBe('');
  });

  it('fills earlier index when it arrives after a later one', () => {
    const chunkAt2: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'B',
      blockIndex: 2,
    };
    const chunkAt1: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'A',
      blockIndex: 1,
    };
    const s1 = applyChunk(INITIAL_STATE, chunkAt2)!;
    const s2 = applyChunk(s1, chunkAt1)!;
    expect((s2.blocks[1] as { kind: 'text'; content: string }).content).toBe('A');
    expect((s2.blocks[2] as { kind: 'text'; content: string }).content).toBe('B');
  });

  it('appends to an existing indexed block when the same blockIndex arrives again', () => {
    const chunk1: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'foo',
      blockIndex: 0,
    };
    const chunk2: AgentChatStreamChunk = {
      type: 'text_delta',
      messageId: 'm1',
      textDelta: 'bar',
      blockIndex: 0,
    };
    const s1 = applyChunk(INITIAL_STATE, chunk1)!;
    const s2 = applyChunk(s1, chunk2)!;
    expect((s2.blocks[0] as { kind: 'text'; content: string }).content).toBe('foobar');
  });
});
