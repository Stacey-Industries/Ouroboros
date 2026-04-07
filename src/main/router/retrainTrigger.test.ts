/* eslint-disable security/detect-non-literal-fs-filename -- test file; all paths derived from os.tmpdir() */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reloadWeights } from './classifier';
import { countSignalLines, findPython, validateWeightFile } from './retrainTriggerHelpers';

// Mock electron
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test-retrain' } }));

// ─── Temp dir setup ──────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retrain-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── countSignalLines ────────────────────────────────────────────────────────

describe('countSignalLines', () => {
  it('returns 0 when file does not exist', async () => {
    expect(await countSignalLines(tmpDir)).toBe(0);
  });

  it('counts non-empty lines in the signals file', async () => {
    const filePath = path.join(tmpDir, 'router-quality-signals.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n{"b":2}\n{"c":3}\n', 'utf8');
    expect(await countSignalLines(tmpDir)).toBe(3);
  });

  it('ignores blank lines', async () => {
    const filePath = path.join(tmpDir, 'router-quality-signals.jsonl');
    fs.writeFileSync(filePath, '{"a":1}\n\n{"b":2}\n\n', 'utf8');
    expect(await countSignalLines(tmpDir)).toBe(2);
  });
});

// ─── validateWeightFile ──────────────────────────────────────────────────────

describe('validateWeightFile', () => {
  it('returns true for valid logistic regression weights', async () => {
    const weights = {
      type: 'logistic_regression',
      feature_names: ['a', 'b'],
      label_names: ['HAIKU', 'SONNET', 'OPUS'],
      coefficients: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      intercept: [0.1, 0.2, 0.3],
      scaler_mean: [0, 0],
      scaler_scale: [1, 1],
    };
    const filePath = path.join(tmpDir, 'weights.json');
    fs.writeFileSync(filePath, JSON.stringify(weights), 'utf8');
    expect(await validateWeightFile(filePath)).toBe(true);
  });

  it('returns true for valid random forest weights', async () => {
    const weights = {
      type: 'random_forest',
      feature_names: ['a'],
      label_names: ['HAIKU', 'SONNET'],
      n_trees: 1,
      trees: [],
    };
    const filePath = path.join(tmpDir, 'weights.json');
    fs.writeFileSync(filePath, JSON.stringify(weights), 'utf8');
    expect(await validateWeightFile(filePath)).toBe(true);
  });

  it('returns false for missing file', async () => {
    expect(await validateWeightFile(path.join(tmpDir, 'nope.json'))).toBe(false);
  });

  it('returns false for invalid JSON', async () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json', 'utf8');
    expect(await validateWeightFile(filePath)).toBe(false);
  });

  it('returns false for missing required fields', async () => {
    const filePath = path.join(tmpDir, 'incomplete.json');
    fs.writeFileSync(filePath, '{"type":"logistic_regression"}', 'utf8');
    expect(await validateWeightFile(filePath)).toBe(false);
  });
});

// ─── reloadWeights ───────────────────────────────────────────────────────────

// Feature names must match FEATURE_NAMES in routerTypes.ts (19 features) for
// the dimension check in reloadWeights to pass.
const ALL_FEATURE_NAMES = [
  'promptCharLength',
  'wordCount',
  'questionMarkCount',
  'sentenceCount',
  'containsCodeBlock',
  'containsFilePath',
  'filePathCount',
  'judgmentWordCount',
  'planningWordCount',
  'implementationWordCount',
  'lookupWordCount',
  'ambiguityWordCount',
  'scopeWordCount',
  'prevMessageIsAssistant',
  'prevAssistantEndsWithQuestion',
  'prevAssistantLength',
  'prevAssistantIsPlan',
  'isPastedOnly',
  'slashCommandPresent',
];
const N = ALL_FEATURE_NAMES.length;

describe('reloadWeights', () => {
  it('returns true and loads valid weights from disk', () => {
    const weights = {
      type: 'logistic_regression',
      feature_names: ALL_FEATURE_NAMES,
      label_names: ['HAIKU', 'SONNET', 'OPUS'],
      coefficients: [Array(N).fill(1), Array(N).fill(2), Array(N).fill(3)],
      intercept: [0, 0, 0],
      scaler_mean: Array(N).fill(0),
      scaler_scale: Array(N).fill(1),
    };
    const filePath = path.join(tmpDir, 'test-weights.json');
    fs.writeFileSync(filePath, JSON.stringify(weights), 'utf8');
    expect(reloadWeights(filePath)).toBe(true);
  });

  it('returns false for missing file', () => {
    expect(reloadWeights(path.join(tmpDir, 'missing.json'))).toBe(false);
  });

  it('returns false for invalid shape', () => {
    const filePath = path.join(tmpDir, 'bad-shape.json');
    fs.writeFileSync(filePath, '{"type":"unknown"}', 'utf8');
    expect(reloadWeights(filePath)).toBe(false);
  });
});

// ─── findPython ──────────────────────────────────────────────────────────────

describe('findPython', () => {
  it('returns a string or null (platform-dependent)', async () => {
    const result = await findPython();
    // On CI/dev machines Python is usually available; on some it isn't
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
