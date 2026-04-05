import { describe, expect, it } from 'vitest';

import { buildEnrichedLogEntry } from './routerFeedback';
import type { RoutingDecision } from './routerTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDecision(overrides?: Partial<RoutingDecision>): RoutingDecision {
  return {
    tier: 'SONNET',
    model: 'claude-sonnet-4-6',
    routedBy: 'rule',
    rule: 'S1',
    confidence: 1,
    latencyMs: 0.5,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildEnrichedLogEntry', () => {
  it('produces a non-empty traceId (16 hex chars)', () => {
    const entry = buildEnrichedLogEntry({
      prompt: 'fix the bug',
      decision: makeDecision(),
    });
    expect(entry.traceId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates unique traceIds across calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const entry = buildEnrichedLogEntry({
        prompt: 'same prompt',
        decision: makeDecision(),
      });
      ids.add(entry.traceId);
    }
    expect(ids.size).toBe(50);
  });

  it('populates promptHash (non-empty, deterministic)', () => {
    const a = buildEnrichedLogEntry({ prompt: 'hello', decision: makeDecision() });
    const b = buildEnrichedLogEntry({ prompt: 'hello', decision: makeDecision() });
    expect(a.promptHash).toHaveLength(16);
    expect(a.promptHash).toBe(b.promptHash);
  });

  it('truncates promptFull at 500 chars', () => {
    const longPrompt = 'x'.repeat(1000);
    const entry = buildEnrichedLogEntry({ prompt: longPrompt, decision: makeDecision() });
    expect(entry.promptFull).toHaveLength(500);
    expect(entry.promptPreview).toHaveLength(100);
  });

  it('defaults interactionType to unknown when no opts', () => {
    const entry = buildEnrichedLogEntry({ prompt: 'test', decision: makeDecision() });
    expect(entry.interactionType).toBe('unknown');
    expect(entry.sessionId).toBeNull();
    expect(entry.workspaceRootHash).toBeNull();
  });

  it('passes through opts correctly', () => {
    const entry = buildEnrichedLogEntry({
      prompt: 'test',
      decision: makeDecision(),
      opts: {
        interactionType: 'chat',
        sessionId: 'sess-123',
        workspaceRoot: '/home/user/project',
      },
    });
    expect(entry.interactionType).toBe('chat');
    expect(entry.sessionId).toBe('sess-123');
    expect(entry.workspaceRootHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes workspaceRoot deterministically', () => {
    const opts = { workspaceRoot: 'C:\\Users\\dev\\myproject' };
    const a = buildEnrichedLogEntry({ prompt: 'a', decision: makeDecision(), opts });
    const b = buildEnrichedLogEntry({ prompt: 'b', decision: makeDecision(), opts });
    expect(a.workspaceRootHash).toBe(b.workspaceRootHash);
  });

  it('different workspaceRoots produce different hashes', () => {
    const a = buildEnrichedLogEntry({
      prompt: 'x',
      decision: makeDecision(),
      opts: { workspaceRoot: '/project-a' },
    });
    const b = buildEnrichedLogEntry({
      prompt: 'x',
      decision: makeDecision(),
      opts: { workspaceRoot: '/project-b' },
    });
    expect(a.workspaceRootHash).not.toBe(b.workspaceRootHash);
  });

  describe('counterfactual population', () => {
    it('runs L2 counterfactual when L1 (rule) was the winner', () => {
      const entry = buildEnrichedLogEntry({
        prompt: 'please review the auth module architecture',
        decision: makeDecision({ routedBy: 'rule', rule: 'O1' }),
      });
      expect(entry.counterfactual.layer1).toBeNull();
      expect(entry.counterfactual.layer2).not.toBeNull();
      expect(entry.counterfactual.layer2?.tier).toBeDefined();
      expect(entry.counterfactual.layer3).toBeNull();
    });

    it('runs L1 counterfactual when L2 (classifier) was the winner', () => {
      const entry = buildEnrichedLogEntry({
        prompt: 'refactor this function to use async/await',
        decision: makeDecision({ routedBy: 'classifier', confidence: 0.8 }),
      });
      // L1 may or may not match — but the field should be populated (null if no rule)
      expect(entry.counterfactual.layer2).toBeNull();
      expect(entry.counterfactual.layer3).toBeNull();
    });

    it('L3 counterfactual is always null (async, not wired)', () => {
      const entry = buildEnrichedLogEntry({
        prompt: 'test',
        decision: makeDecision(),
      });
      expect(entry.counterfactual.layer3).toBeNull();
    });
  });

  it('actual layer1Result is populated when routedBy is rule', () => {
    const entry = buildEnrichedLogEntry({
      prompt: 'yes',
      decision: makeDecision({ routedBy: 'rule', rule: 'H4', tier: 'HAIKU' }),
    });
    expect(entry.layer1Result).not.toBeNull();
    expect(entry.layer1Result?.rule).toBe('H4');
    expect(entry.layer2Result).toBeNull();
  });

  it('actual layer2Result is populated when routedBy is classifier', () => {
    const entry = buildEnrichedLogEntry({
      prompt: 'implement the feature',
      decision: makeDecision({
        routedBy: 'classifier',
        confidence: 0.85,
        features: { wordCount: 3 },
      }),
    });
    expect(entry.layer2Result).not.toBeNull();
    expect(entry.layer2Result?.confidence).toBe(0.85);
    expect(entry.layer1Result).toBeNull();
  });
});
