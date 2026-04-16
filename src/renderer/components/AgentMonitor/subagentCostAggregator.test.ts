/**
 * subagentCostAggregator.test.ts — Unit tests for parent+subagent cost aggregation.
 *
 * Covers:
 *   - combineCosts: zero-subagent case matches parent-only total exactly
 *   - combineCosts: non-zero rollup adds subagent cost to parent
 *   - combineCosts: null rollup treated same as zero-subagent
 *   - formatRollupDisclosure: null when no children
 *   - formatRollupDisclosure: correct label format with 1 subagent
 *   - formatRollupDisclosure: plural form for N > 1 subagents
 */

import { describe, expect, it } from 'vitest';

import type { SubagentCostRollup } from '../../types/electron';
import { combineCosts, formatRollupDisclosure } from './subagentCostAggregator';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRollup(overrides: Partial<SubagentCostRollup> = {}): SubagentCostRollup {
  return {
    inputTokens: 1000,
    outputTokens: 500,
    usdCost: 0.02,
    childCount: 1,
    ...overrides,
  };
}

// ─── combineCosts ─────────────────────────────────────────────────────────────

describe('combineCosts', () => {
  it('zero-subagent case — totalUsd equals parentUsd exactly', () => {
    const combined = combineCosts(0.05, null);
    expect(combined.totalUsd).toBe(0.05);
    expect(combined.parentUsd).toBe(0.05);
    expect(combined.subagentUsd).toBe(0);
    expect(combined.childCount).toBe(0);
  });

  it('zero-subagent case — undefined rollup equals parent-only', () => {
    const combined = combineCosts(0.1, undefined);
    expect(combined.totalUsd).toBe(0.1);
    expect(combined.subagentUsd).toBe(0);
  });

  it('childCount=0 rollup treated as zero subagents', () => {
    const rollup = makeRollup({ childCount: 0, usdCost: 0 });
    const combined = combineCosts(0.03, rollup);
    expect(combined.totalUsd).toBe(0.03);
    expect(combined.childCount).toBe(0);
  });

  it('adds subagent cost to parent when children present', () => {
    const rollup = makeRollup({ usdCost: 0.02, childCount: 2 });
    const combined = combineCosts(0.03, rollup);
    expect(combined.parentUsd).toBeCloseTo(0.03);
    expect(combined.subagentUsd).toBeCloseTo(0.02);
    expect(combined.totalUsd).toBeCloseTo(0.05);
    expect(combined.childCount).toBe(2);
  });

  it('parent cost of zero still adds subagent cost correctly', () => {
    const rollup = makeRollup({ usdCost: 0.04, childCount: 3 });
    const combined = combineCosts(0, rollup);
    expect(combined.totalUsd).toBeCloseTo(0.04);
    expect(combined.parentUsd).toBe(0);
  });

  it('large amounts sum without floating point catastrophe', () => {
    const rollup = makeRollup({ usdCost: 1.23456, childCount: 5 });
    const combined = combineCosts(2.34567, rollup);
    expect(combined.totalUsd).toBeCloseTo(3.58023, 4);
  });
});

// ─── formatRollupDisclosure ───────────────────────────────────────────────────

describe('formatRollupDisclosure', () => {
  it('returns null when childCount is 0', () => {
    const combined = combineCosts(0.05, null);
    expect(formatRollupDisclosure(combined)).toBeNull();
  });

  it('returns singular "subagent" for childCount=1', () => {
    const rollup = makeRollup({ usdCost: 0.02, childCount: 1 });
    const combined = combineCosts(0.03, rollup);
    const label = formatRollupDisclosure(combined);
    expect(label).not.toBeNull();
    expect(label).toContain('1 subagent $');
    expect(label).not.toContain('subagents');
  });

  it('returns plural "subagents" for childCount > 1', () => {
    const rollup = makeRollup({ usdCost: 0.04, childCount: 3 });
    const combined = combineCosts(0.03, rollup);
    const label = formatRollupDisclosure(combined);
    expect(label).toContain('3 subagents $');
  });

  it('label starts with "total $" and contains parent and subagent breakdown', () => {
    const rollup = makeRollup({ usdCost: 0.0200, childCount: 2 });
    const combined = combineCosts(0.0300, rollup);
    const label = formatRollupDisclosure(combined);
    expect(label).toMatch(/^total \$0\.0500/);
    expect(label).toContain('parent $0.0300');
    expect(label).toContain('subagents $0.0200');
  });
});
