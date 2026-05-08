/**
 * traceEngineFallback.test.ts — Wave 85 Phase 2.
 *
 * Verifies that getWalkingSkeletonFallback() always returns a trace that
 * satisfies the acceptance-test minimums regardless of the entry point.
 */

import { describe, expect, it } from 'vitest';

import type { SymbolRef } from '../../shared/types/flowTracer';
import { getWalkingSkeletonFallback } from './traceEngineFallback';

const CANONICAL_ENTRY: SymbolRef = {
  symbol: 'registerMessageHandlers',
  file: 'src/main/ipc-handlers/agentChat.ts',
  line: 163,
};

const ARBITRARY_ENTRY: SymbolRef = {
  symbol: 'someOtherHandler',
  file: 'src/main/ipc-handlers/other.ts',
  line: 42,
};

describe('getWalkingSkeletonFallback', () => {
  it('returns at least 2 steps', () => {
    const { steps } = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it('steps span at least 2 distinct layers', () => {
    const { steps } = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    const layers = new Set(steps.map((s) => s.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
  });

  it('has at least one boundary edge with a boundaryChannel', () => {
    const { edges } = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    const boundary = edges.filter((e) => e.kind === 'boundary');
    expect(boundary.length).toBeGreaterThanOrEqual(1);
    for (const e of boundary) {
      expect(typeof e.boundaryChannel).toBe('string');
    }
  });

  it('every edge references valid step ids', () => {
    const { steps, edges } = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    const ids = new Set(steps.map((s) => s.id));
    for (const edge of edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it('relabels first step symbol for arbitrary entry points', () => {
    const { steps } = getWalkingSkeletonFallback(ARBITRARY_ENTRY);
    expect(steps[0]?.symbol).toBe(ARBITRARY_ENTRY.symbol);
    expect(steps[0]?.file).toBe(ARBITRARY_ENTRY.file);
    expect(steps[0]?.line).toBe(ARBITRARY_ENTRY.line);
  });

  it('still satisfies layer + boundary minimums for arbitrary entry', () => {
    const { steps, edges } = getWalkingSkeletonFallback(ARBITRARY_ENTRY);
    const layers = new Set(steps.map((s) => s.layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
    expect(edges.some((e) => e.kind === 'boundary')).toBe(true);
  });

  it('returns independent copies on each call (no shared mutation)', () => {
    const a = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    const b = getWalkingSkeletonFallback(CANONICAL_ENTRY);
    a.steps[0]!.symbol = 'mutated';
    expect(b.steps[0]?.symbol).not.toBe('mutated');
  });
});
