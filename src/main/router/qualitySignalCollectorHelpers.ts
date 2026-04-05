/**
 * qualitySignalCollectorHelpers.ts — Pure helpers for quality signal detection.
 *
 * No side effects, no I/O, no state. Used by qualitySignalCollector.ts.
 */

import type { QualityAnnotation, QualitySignalKind } from './qualitySignalTypes';

/* ── Jaccard similarity for regeneration detection ───────────────────── */

const MIN_WORDS_FOR_SIMILARITY = 5;

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().trim().split(/\s+/).filter(Boolean));
}

/**
 * Jaccard similarity between two texts (word-level).
 * Returns 0 for very short texts (< 5 words) to avoid false positives
 * on confirmations like "yes" / "ok".
 */
export function computeJaccardOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size < MIN_WORDS_FOR_SIMILARITY || setB.size < MIN_WORDS_FOR_SIMILARITY) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ── Correction prefix detection ─────────────────────────────────────── */

const CORRECTION_PREFIXES = [
  'actually',
  'actually,',
  'no wait',
  'no,',
  'i meant',
  'i mean',
  'wait,',
  'sorry,',
  'scratch that',
  'never mind',
  'not that',
];

/** Returns true if the prompt starts with a correction phrase. */
export function isCorrectionPrefix(prompt: string): boolean {
  const lower = prompt.toLowerCase().trimStart();
  return CORRECTION_PREFIXES.some((p) => lower.startsWith(p));
}

/* ── Annotation builder ──────────────────────────────────────────────── */

interface AnnotationArgs {
  kind: QualitySignalKind;
  traceId?: string | null;
  sessionId?: string | null;
  value: number;
  meta?: Record<string, unknown>;
}

export function buildAnnotation(args: AnnotationArgs): QualityAnnotation {
  return {
    traceId: args.traceId ?? null,
    sessionId: args.sessionId ?? null,
    signalKind: args.kind,
    timestamp: new Date().toISOString(),
    value: args.value,
    meta: args.meta,
  };
}

/* ── Path validation ─────────────────────────────────────────────────── */

import path from 'node:path';

/** Validates that a cwd string is an absolute path (guards child_process calls). */
export function isValidCwd(cwd: string | undefined): cwd is string {
  if (!cwd) return false;
  return path.isAbsolute(cwd);
}
