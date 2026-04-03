/**
 * CompactionIndicator.test.ts — Unit tests for CompactionIndicator helpers.
 */

import { describe, expect, it } from 'vitest';

import { formatCompactionTokens } from './CompactionIndicator';
import type { CompactionEvent } from './types';

// ─── Inline mostRecent (pure helper) ─────────────────────────────────────────

function mostRecent(compactions: CompactionEvent[]): CompactionEvent {
  return compactions.reduce((best, c) => (c.timestamp > best.timestamp ? c : best));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('formatCompactionTokens', () => {
  it('formats numbers below 1000 as plain strings', () => {
    expect(formatCompactionTokens(500)).toBe('500');
  });

  it('formats 1000 as 1K', () => {
    expect(formatCompactionTokens(1000)).toBe('1K');
  });

  it('rounds to nearest K', () => {
    expect(formatCompactionTokens(180_000)).toBe('180K');
    expect(formatCompactionTokens(95_500)).toBe('96K');
  });

  it('formats 0 as "0"', () => {
    expect(formatCompactionTokens(0)).toBe('0');
  });
});

describe('mostRecent', () => {
  const makeEvent = (ts: number): CompactionEvent => ({
    preTokens: 100_000,
    postTokens: 50_000,
    timestamp: ts,
  });

  it('returns the single item when array has one element', () => {
    const events = [makeEvent(1000)];
    expect(mostRecent(events)).toBe(events[0]);
  });

  it('returns the event with the highest timestamp', () => {
    const events = [makeEvent(1000), makeEvent(3000), makeEvent(2000)];
    expect(mostRecent(events).timestamp).toBe(3000);
  });

  it('handles two events correctly', () => {
    const early = makeEvent(100);
    const late = makeEvent(999);
    expect(mostRecent([early, late])).toBe(late);
    expect(mostRecent([late, early])).toBe(late);
  });
});
