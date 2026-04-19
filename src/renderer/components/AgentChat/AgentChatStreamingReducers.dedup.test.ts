/**
 * AgentChatStreamingReducers.dedup.test.ts — Unit tests for the seen-chunk-ID guard.
 */

import { describe, expect, it } from 'vitest';

import { clearSeenChunkIds, isDuplicateChunk } from './AgentChatStreamingReducers.dedup';

describe('isDuplicateChunk', () => {
  it('returns false for a new messageId + chunkId pair', () => {
    const seen = new Map<string, Set<string>>();
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-a')).toBe(false);
  });

  it('returns true for a repeated chunkId on the same messageId', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-a')).toBe(true);
  });

  it('returns false for the same chunkId on a different messageId', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    expect(isDuplicateChunk(seen, 'msg-2', 'chunk-a')).toBe(false);
  });

  it('tracks multiple chunk IDs per message independently', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    isDuplicateChunk(seen, 'msg-1', 'chunk-b');
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-a')).toBe(true);
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-b')).toBe(true);
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-c')).toBe(false);
  });

  it('adds the chunkId to the set on first call', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    expect(seen.get('msg-1')?.has('chunk-a')).toBe(true);
  });
});

describe('clearSeenChunkIds', () => {
  it('removes the entry for the given messageId', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    clearSeenChunkIds(seen, 'msg-1');
    expect(seen.has('msg-1')).toBe(false);
  });

  it('after clearing, chunkId is no longer considered a duplicate', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    clearSeenChunkIds(seen, 'msg-1');
    expect(isDuplicateChunk(seen, 'msg-1', 'chunk-a')).toBe(false);
  });

  it('is a no-op for an unknown messageId', () => {
    const seen = new Map<string, Set<string>>();
    expect(() => clearSeenChunkIds(seen, 'msg-unknown')).not.toThrow();
  });

  it('does not affect other messageIds', () => {
    const seen = new Map<string, Set<string>>();
    isDuplicateChunk(seen, 'msg-1', 'chunk-a');
    isDuplicateChunk(seen, 'msg-2', 'chunk-a');
    clearSeenChunkIds(seen, 'msg-1');
    expect(isDuplicateChunk(seen, 'msg-2', 'chunk-a')).toBe(true);
  });
});
