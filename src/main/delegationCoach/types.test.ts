/**
 * types.test.ts — Smoke tests for delegation coach type shapes.
 *
 * Types are erased at runtime; these tests verify that the type definitions
 * accept and reject the shapes we expect, and that representative literals
 * compile cleanly. Failures here surface schema drift between this module
 * and downstream consumers (detector, hook, build step).
 */

import { describe, expect, it } from 'vitest';

import type {
  EscalationTier,
  HistoryRequirement,
  PatternDefinition,
  PatternMatch,
  PatternTrigger,
  ToolCallEvent,
  ToolCallMatcher,
} from './types';

describe('delegation coach types', () => {
  it('ToolCallEvent accepts the expected shape', () => {
    const ev: ToolCallEvent = {
      tool: 'Read',
      input: { file_path: '/foo.ts' },
      timestamp: 1_700_000_000_000,
      sessionId: 'sess-abc',
    };
    expect(ev.tool).toBe('Read');
    expect(ev.input.file_path).toBe('/foo.ts');
  });

  it('EscalationTier accepts the three documented levels', () => {
    const tiers: EscalationTier[] = ['soft', 'acknowledgment', 'hard'];
    expect(tiers).toHaveLength(3);
  });

  it('PatternMatch shape is well-formed', () => {
    const m: PatternMatch = {
      patternId: 'multi-file-scan-no-edit',
      suggestion: 'Consider haiku-explorer.',
      escalation: 'soft',
      confidence: 0.8,
    };
    expect(m.confidence).toBeGreaterThan(0);
    expect(m.confidence).toBeLessThanOrEqual(1);
  });

  it('ToolCallMatcher accepts single or array tool, with optional path matchers', () => {
    const single: ToolCallMatcher = { tool: 'Read' };
    const multi: ToolCallMatcher = { tool: ['Read', 'Grep'] };
    const withPath: ToolCallMatcher = { tool: 'Edit', argPathMatches: '*.ts' };
    const withNeg: ToolCallMatcher = { argPathDoesNotMatch: '*.test.*' };
    expect(single.tool).toBe('Read');
    expect(Array.isArray(multi.tool)).toBe(true);
    expect(withPath.argPathMatches).toBe('*.ts');
    expect(withNeg.argPathDoesNotMatch).toBe('*.test.*');
  });

  it('HistoryRequirement requires count bounds and a window', () => {
    const req: HistoryRequirement = {
      match: { tool: 'Read' },
      count: { min: 3 },
      withinMs: 60_000,
    };
    expect(req.count.min).toBe(3);
    expect(req.withinMs).toBe(60_000);
  });

  it('PatternTrigger composes current + history requirements', () => {
    const trigger: PatternTrigger = {
      current: { tool: 'Read' },
      history: [
        { match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60_000 },
        { match: { tool: 'Edit' }, count: { max: 0 }, withinMs: 60_000 },
      ],
    };
    expect(trigger.history).toHaveLength(2);
  });

  it('PatternDefinition accepts the fully-specified shape', () => {
    const p: PatternDefinition = {
      id: 'multi-file-scan-no-edit',
      name: 'Multi-file scan, no edit',
      description: 'Opus is reading many files without editing.',
      trigger: {
        current: { tool: 'Read' },
        history: [{ match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60_000 }],
      },
      suggestion: 'Consider haiku-explorer.',
      escalation: 'soft',
      cooldownMs: 300_000,
      confidence: 0.8,
      enabled: true,
    };
    expect(p.id).toBe('multi-file-scan-no-edit');
    expect(p.escalation).toBe('soft');
  });

  it('PatternDefinition allows minimal shape (defaults applied by detector)', () => {
    const minimal: PatternDefinition = {
      id: 'p1',
      name: 'Pattern 1',
      description: 'desc',
      trigger: { current: { tool: 'Read' } },
      suggestion: 's',
      escalation: 'soft',
    };
    expect(minimal.cooldownMs).toBeUndefined();
    expect(minimal.confidence).toBeUndefined();
    expect(minimal.enabled).toBeUndefined();
  });
});
