/**
 * contextClassifier.ts — Logistic regression scorer for context file ranking.
 *
 * Scores a feature vector against the active weights and returns a sigmoid
 * probability in [0, 1]. Weights are hot-swappable at runtime via
 * reloadContextWeights() — the module starts with BUNDLED_CONTEXT_WEIGHTS and
 * swaps in retrained weights once train-context.py produces them.
 *
 * Phase B scope: pure classifier + bundled defaults + hot-swap API.
 * Selector integration is Phase D. Retrain trigger is Phase C.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import { BUNDLED_CONTEXT_WEIGHTS } from './contextClassifierDefaults';

/* ── Public types ─────────────────────────────────────────────────────── */

export interface ContextRankerMetrics {
  samples: number;
  syntheticNegatives: number;
  heldOutAuc: number;
  trainedAt: string;
  belowMinSamples: boolean;
  classBalance: { pos: number; neg: number };
}

export interface ContextRankerWeights {
  version: string;
  featureOrder: readonly string[];
  weights: readonly number[];
  bias: number;
  metrics: ContextRankerMetrics;
}

/** Flat dict keyed by feature name. Classifier aligns to weights.featureOrder. */
export type ContextFeatureVec = Record<string, number>;

/* ── Module state ─────────────────────────────────────────────────────── */

let activeWeights: ContextRankerWeights = BUNDLED_CONTEXT_WEIGHTS;

/** Feature names that have already triggered a warn-once log. Reset by resetForTests(). */
const warnedMissingFeatures = new Set<string>();

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Safe feature lookup — avoids security/detect-object-injection lint rule. */
function featureVal(vec: ContextFeatureVec, name: string): number {
  for (const [k, v] of Object.entries(vec)) {
    if (k === name) return v;
  }
  return 0;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/* ── score() ──────────────────────────────────────────────────────────── */

/**
 * Score a feature vector against the active (or supplied) weights.
 *
 * Returns sigmoid probability in [0, 1].
 * Missing features default to 0.0 with a warn-once log per feature name.
 * Features present in the input but absent from weights.featureOrder are ignored.
 */
export function score(features: ContextFeatureVec, weights?: ContextRankerWeights): number {
  const w = weights ?? activeWeights;
  let z = w.bias;

  for (let i = 0; i < w.featureOrder.length; i++) {
    const name = w.featureOrder.at(i) ?? '';
    const present = Object.keys(features).includes(name);
    if (!present && !warnedMissingFeatures.has(name)) {
      warnedMissingFeatures.add(name);
      console.warn(`[context-ranker] feature "${name}" missing from input — defaulting to 0.0`);
    }
    const val = featureVal(features, name);
    z += (w.weights.at(i) ?? 0) * val;
  }

  return sigmoid(z);
}

/* ── getActiveWeights() ───────────────────────────────────────────────── */

/** Returns the currently active weights (bundled defaults or last hot-swapped). */
export function getActiveWeights(): ContextRankerWeights {
  return activeWeights;
}

/* ── Schema validation ────────────────────────────────────────────────── */

function isValidMetrics(m: unknown): m is ContextRankerMetrics {
  if (!m || typeof m !== 'object') return false;
  const obj = m as Record<string, unknown>;
  return (
    typeof obj.samples === 'number' &&
    typeof obj.syntheticNegatives === 'number' &&
    typeof obj.heldOutAuc === 'number' &&
    typeof obj.trainedAt === 'string' &&
    typeof obj.belowMinSamples === 'boolean' &&
    !!obj.classBalance &&
    typeof (obj.classBalance as Record<string, unknown>).pos === 'number' &&
    typeof (obj.classBalance as Record<string, unknown>).neg === 'number'
  );
}

type ValidationResult =
  | { ok: true; weights: ContextRankerWeights }
  | { ok: false; reason: string };

const MISMATCH = { ok: false as const, reason: 'schema-mismatch' };

function checkTopLevelShape(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.version === 'string' &&
    obj.version.length > 0 &&
    Array.isArray(obj.featureOrder) &&
    Array.isArray(obj.weights) &&
    (obj.featureOrder as unknown[]).length === (obj.weights as unknown[]).length &&
    typeof obj.bias === 'number' &&
    Number.isFinite(obj.bias)
  );
}

function allWeightsFinite(weights: unknown[]): boolean {
  for (const w of weights) {
    if (typeof w !== 'number' || !Number.isFinite(w)) return false;
  }
  return true;
}

function validateWeights(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== 'object') return MISMATCH;
  const obj = parsed as Record<string, unknown>;
  if (!checkTopLevelShape(obj)) return MISMATCH;
  if (!allWeightsFinite(obj.weights as unknown[])) return MISMATCH;
  if (!isValidMetrics(obj.metrics)) return MISMATCH;
  return { ok: true, weights: obj as unknown as ContextRankerWeights };
}

/* ── reloadContextWeights() ───────────────────────────────────────────── */

/** Default weights file name within userData. */
const WEIGHTS_FILENAME = 'context-retrained-weights.json';

function getUserDataPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return app.getPath('userData');
}

/**
 * Replace the active weights from disk.
 *
 * Reads <userData>/context-retrained-weights.json by default, or the
 * explicit filePath if provided. On any failure the current weights are
 * preserved and { loaded: false, reason } is returned.
 */
export async function reloadContextWeights(
  filePath?: string,
): Promise<{ loaded: boolean; version: string; reason?: string }> {
  const target = filePath ?? path.join(getUserDataPath(), WEIGHTS_FILENAME);

  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is app.getPath('userData') derived
    raw = await fs.readFile(target, 'utf8');
  } catch {
    return { loaded: false, version: activeWeights.version, reason: 'file-missing' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[context-ranker] failed to parse weights file — keeping current weights');
    return { loaded: false, version: activeWeights.version, reason: 'parse-error' };
  }

  const result = validateWeights(parsed);
  if (!result.ok) {
    console.warn(`[context-ranker] weights schema invalid (${result.reason}) — keeping current weights`);
    return { loaded: false, version: activeWeights.version, reason: result.reason };
  }

  activeWeights = result.weights;
  log.info(
    `[context-ranker] weights reloaded version=${result.weights.version} auc=${result.weights.metrics.heldOutAuc}`,
  );
  return { loaded: true, version: result.weights.version };
}

/* ── resetForTests() ──────────────────────────────────────────────────── */

/** @internal Test-only: resets module state to initial conditions. */
export function resetForTests(): void {
  activeWeights = BUNDLED_CONTEXT_WEIGHTS;
  warnedMissingFeatures.clear();
}
