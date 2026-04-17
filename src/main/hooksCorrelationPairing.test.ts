/**
 * hooksCorrelationPairing.test.ts — Unit tests for correlation pairing map.
 *
 * Acceptance criteria:
 * - pre_tool_use (mintCorrelationId) mints a UUID and stores it
 * - post_tool_use (resolveCorrelationId) returns the same id for a matching pair
 * - mismatched post (no prior mint) mints a fresh fallback id
 * - TTL eviction removes stale entries
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _pairMapSize,
  _resetPairMapForTests,
  mintCorrelationId,
  resolveCorrelationId,
} from './hooksCorrelationPairing';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  _resetPairMapForTests();
  vi.useRealTimers();
});

describe('mintCorrelationId', () => {
  it('returns a valid UUID v4', () => {
    const id = mintCorrelationId('sess-1', 'tool-1');
    expect(id).toMatch(UUID_RE);
  });

  it('stores the entry so the map size grows', () => {
    mintCorrelationId('sess-1', 'tool-A');
    mintCorrelationId('sess-1', 'tool-B');
    expect(_pairMapSize()).toBe(2);
  });

  it('different (session, toolUseId) pairs get different ids', () => {
    const a = mintCorrelationId('sess-1', 'tool-A');
    const b = mintCorrelationId('sess-1', 'tool-B');
    expect(a).not.toBe(b);
  });
});

describe('resolveCorrelationId', () => {
  it('returns the same id that was minted for matching pre/post pair', () => {
    const minted = mintCorrelationId('sess-1', 'tool-1');
    const resolved = resolveCorrelationId('sess-1', 'tool-1');
    expect(resolved).toBe(minted);
  });

  it('consumes the entry — resolving twice yields different ids', () => {
    const minted = mintCorrelationId('sess-2', 'tool-2');
    const first = resolveCorrelationId('sess-2', 'tool-2');
    const second = resolveCorrelationId('sess-2', 'tool-2');
    expect(first).toBe(minted);
    expect(second).toMatch(UUID_RE);
    expect(second).not.toBe(minted);
  });

  it('mints a fresh fallback UUID when no prior mint exists (mismatched post)', () => {
    const fallback = resolveCorrelationId('sess-unknown', 'tool-unknown');
    expect(fallback).toMatch(UUID_RE);
  });

  it('map size decreases after a successful resolve', () => {
    mintCorrelationId('sess-3', 'tool-3');
    expect(_pairMapSize()).toBe(1);
    resolveCorrelationId('sess-3', 'tool-3');
    expect(_pairMapSize()).toBe(0);
  });
});

describe('TTL eviction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('evicts entries older than 10 minutes on the next mint call', () => {
    vi.setSystemTime(0);
    mintCorrelationId('sess-old', 'tool-old');
    expect(_pairMapSize()).toBe(1);

    // Advance past TTL (10 min + 1ms)
    vi.setSystemTime(10 * 60 * 1000 + 1);

    // Next mint triggers eviction
    mintCorrelationId('sess-new', 'tool-new');
    expect(_pairMapSize()).toBe(1); // old evicted, new added

    // Evicted entry resolves as fallback
    const fallback = resolveCorrelationId('sess-old', 'tool-old');
    expect(fallback).toMatch(UUID_RE);
  });

  it('does not evict entries within TTL', () => {
    vi.setSystemTime(0);
    mintCorrelationId('sess-live', 'tool-live');

    // Advance to just before TTL
    vi.setSystemTime(10 * 60 * 1000 - 1);

    mintCorrelationId('sess-other', 'tool-other');
    expect(_pairMapSize()).toBe(2); // both still present

    const id = resolveCorrelationId('sess-live', 'tool-live');
    expect(id).toMatch(UUID_RE);
  });
});
