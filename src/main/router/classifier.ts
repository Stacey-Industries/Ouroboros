/**
 * classifier.ts — ML classifier for model tier routing (Layer 2).
 *
 * Inlines a logistic regression model from router-weights.json (bundled
 * by Vite) and predicts the tier (HAIKU/SONNET/OPUS) with a confidence
 * score. Pure TypeScript inference — no Python or ONNX at runtime.
 */

import fs from 'node:fs';

import weightsJson from './model/router-weights.json';
import type { ClassifierResult, ModelTier } from './routerTypes';

/* ── Model weight types ───────────────────────────────────────────── */

export interface LRWeights {
  type: 'logistic_regression';
  feature_names: string[];
  label_names: string[];
  coefficients: number[][];
  intercept: number[];
  scaler_mean: number[];
  scaler_scale: number[];
}

/* ── Weights (inlined by bundler, replaceable at runtime) ────────── */

let weights = weightsJson as unknown as LRWeights;

/* ── Numeric helpers (use .at() to satisfy security/detect-object-injection) */

/** Standardize a single feature value: (x - mean) / scale. */
function scaleValue(val: number, mean: number, scale: number): number {
  return scale === 0 ? 0 : (val - mean) / scale;
}

/** Softmax: convert logits to probabilities. */
function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Safe feature lookup by iterating entries (avoids security/detect-object-injection). */
function featureVal(features: Record<string, number>, name: string): number {
  for (const [key, val] of Object.entries(features)) {
    if (key === name) return val;
  }
  return 0;
}

/* ── Public API ───────────────────────────────────────────────────── */

/**
 * Classify a prompt's features into a model tier.
 */
export function classifyFeatures(features: Record<string, number>): ClassifierResult {
  const w = weights;

  const raw = w.feature_names.map((n) => featureVal(features, n));
  const scaled = raw.map((v, i) =>
    scaleValue(v, w.scaler_mean.at(i) ?? 0, w.scaler_scale.at(i) ?? 1),
  );
  const logits = computeLogits(scaled, w);
  const probs = softmax(logits);

  return pickBestClass(probs, w.label_names, features);
}

/* ── Internals ────────────────────────────────────────────────────── */

function computeLogits(scaled: number[], w: LRWeights): number[] {
  return w.coefficients.map((row, ci) => {
    let logit = w.intercept.at(ci) ?? 0;
    for (let i = 0; i < row.length; i++) {
      logit += (row.at(i) ?? 0) * (scaled.at(i) ?? 0);
    }
    return logit;
  });
}

function pickBestClass(
  probs: number[],
  labels: string[],
  features: Record<string, number>,
): ClassifierResult {
  let maxProb = 0;
  let maxIdx = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs.at(i) ?? 0;
    if (p > maxProb) {
      maxProb = p;
      maxIdx = i;
    }
  }
  const validTiers = new Set<string>(['HAIKU', 'SONNET', 'OPUS']);
  const label = labels.at(maxIdx) ?? 'SONNET';
  const tier: ModelTier = validTiers.has(label) ? (label as ModelTier) : 'SONNET';
  return { tier, confidence: maxProb, features };
}

/* ── Hot-reload ──────────────────────────────────────────────────── */

/**
 * Replace the in-memory weights with a new set loaded from disk.
 * Returns true on success, false if the file is missing or malformed.
 */
export function reloadWeights(filePath: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is derived from app.getPath('userData'), a trusted internal path
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidLRWeights(parsed)) return false;
    weights = parsed;
    return true;
  } catch {
    return false;
  }
}

function isValidLRWeights(obj: unknown): obj is LRWeights {
  if (!obj || typeof obj !== 'object') return false;
  const w = obj as Record<string, unknown>;
  return (
    w.type === 'logistic_regression' &&
    Array.isArray(w.feature_names) &&
    Array.isArray(w.label_names) &&
    Array.isArray(w.coefficients) &&
    Array.isArray(w.intercept)
  );
}
