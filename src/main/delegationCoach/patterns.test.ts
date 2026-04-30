/**
 * patterns.test.ts — Smoke tests for the seed pattern library.
 *
 * Verifies the seed library is well-formed, ids are unique, all patterns
 * ship at the soft tier (Wave 61 ADR Decision 3), and trigger references
 * to tool names use the canonical Claude Code tool identifiers.
 */

import { describe, expect, it } from 'vitest';

import { activePatterns, SEED_PATTERNS } from './patterns';
import type { PatternDefinition, ToolCallMatcher } from './types';

const KNOWN_TOOLS = new Set([
  'Read',
  'Edit',
  'Write',
  'Grep',
  'Glob',
  'Bash',
  'PowerShell',
  'WebFetch',
  'WebSearch',
  'Agent',
  'Skill',
  'NotebookEdit',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
]);

function toolsOf(matcher: ToolCallMatcher | undefined): string[] {
  if (!matcher?.tool) return [];
  return Array.isArray(matcher.tool) ? matcher.tool : [matcher.tool];
}

function allReferencedTools(p: PatternDefinition): string[] {
  const tools: string[] = [];
  tools.push(...toolsOf(p.trigger.current));
  for (const req of p.trigger.history ?? []) tools.push(...toolsOf(req.match));
  return tools;
}

describe('seed pattern library', () => {
  it('has at least 5 active patterns (Phase A target was 4-6)', () => {
    expect(activePatterns().length).toBeGreaterThanOrEqual(5);
  });

  it('all pattern ids are unique', () => {
    const ids = SEED_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all pattern ids use kebab-case (id-with-dashes)', () => {
    for (const p of SEED_PATTERNS) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('all patterns ship at the soft tier (ADR Decision 3)', () => {
    for (const p of SEED_PATTERNS) {
      expect(p.escalation).toBe('soft');
    }
  });

  it('every pattern has a non-empty suggestion and description', () => {
    for (const p of SEED_PATTERNS) {
      expect(p.suggestion.trim().length).toBeGreaterThan(20);
      expect(p.description.trim().length).toBeGreaterThan(10);
    }
  });

  it('every pattern has at least one trigger constraint', () => {
    for (const p of SEED_PATTERNS) {
      const hasCurrent = p.trigger.current !== undefined;
      const hasHistory = (p.trigger.history?.length ?? 0) > 0;
      expect(hasCurrent || hasHistory).toBe(true);
    }
  });

  it('every history requirement specifies at least one of min/max', () => {
    for (const p of SEED_PATTERNS) {
      for (const req of p.trigger.history ?? []) {
        const hasMin = req.count.min !== undefined;
        const hasMax = req.count.max !== undefined;
        expect(hasMin || hasMax).toBe(true);
        expect(req.withinMs).toBeGreaterThan(0);
      }
    }
  });

  it('all referenced tool names are known Claude Code tools', () => {
    for (const p of SEED_PATTERNS) {
      for (const tool of allReferencedTools(p)) {
        expect(KNOWN_TOOLS.has(tool)).toBe(true);
      }
    }
  });

  it('confidence values stay in (0, 1] when set', () => {
    for (const p of SEED_PATTERNS) {
      if (p.confidence !== undefined) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('cooldownMs is positive when set', () => {
    for (const p of SEED_PATTERNS) {
      if (p.cooldownMs !== undefined) {
        expect(p.cooldownMs).toBeGreaterThan(0);
      }
    }
  });

  it('seed library is JSON-serializable (build step requirement)', () => {
    const serialized = JSON.stringify(SEED_PATTERNS);
    const parsed = JSON.parse(serialized) as PatternDefinition[];
    expect(parsed.length).toBe(SEED_PATTERNS.length);
    expect(parsed[0].id).toBe(SEED_PATTERNS[0].id);
  });

  it('activePatterns filters out enabled:false entries', () => {
    const all: PatternDefinition[] = [
      { ...SEED_PATTERNS[0], id: 'a', enabled: true },
      { ...SEED_PATTERNS[0], id: 'b', enabled: false },
      { ...SEED_PATTERNS[0], id: 'c' /* default = active */ },
    ];
    const active = activePatterns(all);
    expect(active.map((p) => p.id)).toEqual(['a', 'c']);
  });
});
