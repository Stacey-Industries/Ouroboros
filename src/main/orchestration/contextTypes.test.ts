/**
 * contextTypes.test.ts — Smoke tests for the Wave 15 Phase F type scaffolding.
 *
 * These types are populated by Waves 18 and 24. This test verifies the
 * storage-path constants export cleanly and that the type shapes compile as
 * runtime objects (smoke test only — behavioural tests land in Wave 24).
 */

import { describe, expect, it } from 'vitest';

import {
  type ContextDecision,
  type ContextFeatures,
  type ContextOutcome,
  type EditProvenance,
  OUTCOMES_DIR,
  TELEMETRY_DIR,
} from './contextTypes';

describe('contextTypes path constants', () => {
  it('exports TELEMETRY_DIR as the expected telemetry subdir', () => {
    expect(TELEMETRY_DIR).toBe('telemetry');
  });

  it('exports OUTCOMES_DIR under the .ouroboros directory', () => {
    expect(OUTCOMES_DIR).toBe('.ouroboros/outcomes');
  });
});

describe('contextTypes shapes compile as values', () => {
  it('ContextFeatures accepts a populated feature vector', () => {
    const features: ContextFeatures = {
      score: 72,
      reasons: [{ kind: 'pinned', weight: 95 }],
      pagerank_score: null,
      included: true,
    };
    expect(features.score).toBe(72);
    expect(features.reasons).toHaveLength(1);
    expect(features.pagerank_score).toBeNull();
    expect(features.included).toBe(true);
  });

  it('ContextDecision references a traceId and fileId', () => {
    const decision: ContextDecision = {
      id: 'dec-1',
      traceId: 'trace-abc',
      fileId: 'src/main/hooks.ts',
      features: { score: 10, reasons: [], pagerank_score: null, included: false },
      score: 10,
      included: false,
    };
    expect(decision.traceId).toBe('trace-abc');
    expect(decision.fileId).toBe('src/main/hooks.ts');
  });

  it('ContextOutcome kind narrows to the three documented values', () => {
    const used: ContextOutcome = { decisionId: 'd1', kind: 'used', toolUsed: 'Edit' };
    const unused: ContextOutcome = { decisionId: 'd2', kind: 'unused' };
    const missed: ContextOutcome = { decisionId: 'd3', kind: 'missed' };
    expect(used.kind).toBe('used');
    expect(unused.kind).toBe('unused');
    expect(missed.kind).toBe('missed');
  });

  it('EditProvenance captures sessionId, editedAt, editTool, correlationId', () => {
    const agentEdit: EditProvenance = {
      sessionId: 'sess-1',
      editedAt: '2026-04-15T00:00:00Z',
      editTool: 'Write',
      correlationId: 'corr-1',
    };
    expect(agentEdit.sessionId).toBe('sess-1');
    expect(agentEdit.editTool).toBe('Write');
    expect(agentEdit.correlationId).toBe('corr-1');
  });
});
