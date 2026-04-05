import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QualityAnnotation } from './qualitySignalTypes';
import { exportTrainingData } from './routerExporter';
import { buildJudgedRecord, pickHighestConfidence, signalToLabel } from './routerExporterHelpers';
import type { EnrichedRoutingLogEntry } from './routerTypes';

// Mock electron for the logger lazy init
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test-export' } }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-export-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeEnrichedEntry(overrides?: Partial<EnrichedRoutingLogEntry>): EnrichedRoutingLogEntry {
  return {
    timestamp: new Date().toISOString(),
    promptPreview: 'test prompt',
    promptFull: 'test prompt for training',
    promptHash: 'abc123',
    traceId: 'trace-001',
    sessionId: 'sess-001',
    interactionType: 'chat',
    workspaceRootHash: 'workspace123',
    tier: 'SONNET',
    model: 'claude-sonnet-4-6',
    routedBy: 'rule',
    rule: 'S1',
    confidence: 1,
    latencyMs: 0.5,
    layer1Result: { tier: 'SONNET', rule: 'S1', confidence: 'HIGH' },
    layer2Result: null,
    layer3Result: null,
    override: null,
    counterfactual: { layer1: null, layer2: null, layer3: null },
    ...overrides,
  };
}

function makeAnnotation(overrides?: Partial<QualityAnnotation>): QualityAnnotation {
  return {
    traceId: 'trace-001',
    sessionId: 'sess-001',
    signalKind: 'terminal_natural_stop',
    timestamp: new Date().toISOString(),
    value: 1,
    ...overrides,
  };
}

function writeJsonlFile(filePath: string, records: unknown[]): void {
  const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path derived from os.tmpdir()
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJsonlFile<T>(filePath: string): T[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path derived from os.tmpdir()
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

// ─── Helper unit tests ───────────────────────────────────────────────────────

describe('signalToLabel', () => {
  it('maps positive signals to current tier', () => {
    const label = signalToLabel(makeAnnotation({ signalKind: 'terminal_natural_stop' }), 'SONNET');
    expect(label?.judgedTier).toBe('SONNET');
    expect(label?.confidence).toBe('MEDIUM');
  });

  it('maps negative signals to one tier up', () => {
    const label = signalToLabel(makeAnnotation({ signalKind: 'chat_regenerate' }), 'HAIKU');
    expect(label?.judgedTier).toBe('SONNET');
  });

  it('caps tier promotion at OPUS', () => {
    const label = signalToLabel(makeAnnotation({ signalKind: 'chat_correction' }), 'OPUS');
    expect(label?.judgedTier).toBe('OPUS');
  });

  it('maps code_committed to current tier (positive)', () => {
    const label = signalToLabel(makeAnnotation({ signalKind: 'code_committed' }), 'HAIKU');
    expect(label?.judgedTier).toBe('HAIKU');
    expect(label?.confidence).toBe('MEDIUM');
  });
});

describe('pickHighestConfidence', () => {
  it('returns null for empty array', () => {
    expect(pickHighestConfidence([])).toBeNull();
  });

  it('picks HIGH over MEDIUM', () => {
    const result = pickHighestConfidence([
      { judgedTier: 'SONNET', confidence: 'MEDIUM' },
      { judgedTier: 'OPUS', confidence: 'HIGH' },
    ]);
    expect(result?.judgedTier).toBe('OPUS');
    expect(result?.confidence).toBe('HIGH');
  });

  it('returns first entry when all equal confidence', () => {
    const result = pickHighestConfidence([
      { judgedTier: 'HAIKU', confidence: 'MEDIUM' },
      { judgedTier: 'SONNET', confidence: 'MEDIUM' },
    ]);
    expect(result?.judgedTier).toBe('HAIKU');
  });
});

describe('buildJudgedRecord', () => {
  it('produces the correct shape', () => {
    const rec = buildJudgedRecord(
      't1',
      { judgedTier: 'OPUS', confidence: 'HIGH' },
      'user_override',
    );
    expect(rec.id).toBe('t1');
    expect(rec.judged_tier).toBe('OPUS');
    expect(rec.confidence).toBe('HIGH');
    expect(rec.signal_kind).toBe('user_override');
  });
});

// ─── Integration: exportTrainingData ─────────────────────────────────────────

describe('exportTrainingData', () => {
  it('produces two joinable JSONL files from decisions + signals', async () => {
    const decisions = [
      makeEnrichedEntry({ traceId: 't1', tier: 'SONNET' }),
      makeEnrichedEntry({ traceId: 't2', tier: 'HAIKU' }),
    ];
    const signals = [
      makeAnnotation({ traceId: 't1', signalKind: 'terminal_natural_stop' }),
      makeAnnotation({ traceId: 't2', signalKind: 'chat_regenerate' }),
    ];

    writeJsonlFile(path.join(tmpDir, 'router-decisions.jsonl'), decisions);
    writeJsonlFile(path.join(tmpDir, 'router-quality-signals.jsonl'), signals);

    const result = await exportTrainingData({ inputDir: tmpDir });

    expect(result.extractedCount).toBe(2);
    expect(result.judgedCount).toBe(2);

    const extracted = readJsonlFile<Record<string, unknown>>(
      path.join(tmpDir, 'router-full-extracted.jsonl'),
    );
    const judged = readJsonlFile<Record<string, unknown>>(
      path.join(tmpDir, 'router-full-judged.jsonl'),
    );

    expect(extracted).toHaveLength(2);
    expect(judged).toHaveLength(2);

    // IDs should be joinable
    const extractedIds = new Set(extracted.map((r) => r.id));
    const judgedIds = new Set(judged.map((r) => r.id));
    expect(extractedIds).toEqual(judgedIds);
  });

  it('returns zero counts when no decisions file exists', async () => {
    const result = await exportTrainingData({ inputDir: tmpDir });
    expect(result.extractedCount).toBe(0);
    expect(result.judgedCount).toBe(0);
  });

  it('exports extracted records without signals when no signals file', async () => {
    writeJsonlFile(path.join(tmpDir, 'router-decisions.jsonl'), [
      makeEnrichedEntry({ traceId: 't1' }),
    ]);

    const result = await exportTrainingData({ inputDir: tmpDir });
    expect(result.extractedCount).toBe(1);
    expect(result.judgedCount).toBe(0);
  });

  it('respects maxSamples limit', async () => {
    const decisions = Array.from({ length: 10 }, (_, i) => makeEnrichedEntry({ traceId: `t${i}` }));
    writeJsonlFile(path.join(tmpDir, 'router-decisions.jsonl'), decisions);

    const result = await exportTrainingData({ inputDir: tmpDir, maxSamples: 3 });
    expect(result.extractedCount).toBe(3);
  });

  it('skips non-enriched entries (missing traceId)', async () => {
    const decisions = [
      {
        timestamp: 'now',
        promptPreview: 'old',
        promptHash: '',
        tier: 'SONNET',
        model: 'm',
        routedBy: 'rule',
        confidence: 1,
        latencyMs: 0,
        layer1Result: null,
        layer2Result: null,
        layer3Result: null,
        override: null,
      },
      makeEnrichedEntry({ traceId: 't1' }),
    ];
    writeJsonlFile(path.join(tmpDir, 'router-decisions.jsonl'), decisions);

    const result = await exportTrainingData({ inputDir: tmpDir });
    expect(result.extractedCount).toBe(1);
  });
});
