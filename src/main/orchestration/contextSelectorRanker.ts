/**
 * contextSelectorRanker.ts — Classifier-based ranking helpers for contextSelector.
 *
 * Provides:
 *   - classifierRankCandidates: replaces additive sort with classifier score.
 *   - runShadowMode: logs classifier vs additive comparison without affecting ranking.
 *
 * Wave 31 Phase D. Flag off = shadow only. Flag on = classifier drives top-N.
 */

import log from '../logger';
import { score } from './contextClassifier';
import { toPathKey } from './contextSelectionSupport';
import { buildFeatureCtx, computeFeatures } from './contextSelectorFeatures';
import type { MutableCandidate } from './contextSelectorHelpers';
import { rankCandidates } from './contextSelectorHelpers';
import type { RankedContextFile, TaskRequest } from './types';

// ─── Shadow mode guard ────────────────────────────────────────────────────────

/** Logged once per process to avoid log spam on classifier errors in shadow mode. */
let shadowErrorLogged = false;

/** @internal Reset for tests only. */
export function resetShadowErrorForTests(): void {
  shadowErrorLogged = false;
}

// ─── Classifier ranking ───────────────────────────────────────────────────────

interface ScoredRanked {
  ranked: RankedContextFile;
  classifierScore: number;
}

function attachClassifierScores(
  additiveRanked: RankedContextFile[],
  candidates: Map<string, MutableCandidate>,
  request: TaskRequest,
): ScoredRanked[] {
  const ctx = buildFeatureCtx(request, candidates);
  return additiveRanked.map((ranked) => {
    const key = toPathKey(ranked.filePath);
    const candidate = candidates.get(key) ?? { filePath: ranked.filePath, reasons: [] };
    return { ranked, classifierScore: score(computeFeatures(candidate, ctx)) };
  });
}

/**
 * Rank candidates using classifier score as the primary sort key.
 * Ties broken by additive score, then filePath.
 */
export function classifierRankCandidates(
  candidates: Map<string, MutableCandidate>,
  request: TaskRequest,
): RankedContextFile[] {
  const additiveRanked = rankCandidates(candidates);
  const scored = attachClassifierScores(additiveRanked, candidates, request);

  scored.sort((a, b) => {
    if (b.classifierScore !== a.classifierScore) return b.classifierScore - a.classifierScore;
    if (b.ranked.score !== a.ranked.score) return b.ranked.score - a.ranked.score;
    return a.ranked.filePath.localeCompare(b.ranked.filePath);
  });

  return scored.map((x) => x.ranked);
}

// ─── Shadow mode ──────────────────────────────────────────────────────────────

function topNIds(files: RankedContextFile[], n: number): string[] {
  return files.slice(0, n).map((f) => toPathKey(f.filePath));
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0) return 1;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id)).length / a.length;
}

function computeShadowLog(
  additiveRanked: RankedContextFile[],
  candidates: Map<string, MutableCandidate>,
  request: TaskRequest,
): void {
  const scored = attachClassifierScores(additiveRanked, candidates, request);
  const classifierSorted = [...scored].sort((a, b) => b.classifierScore - a.classifierScore);
  const classifierRanked = classifierSorted.map((x) => x.ranked);

  const n = Math.min(10, additiveRanked.length);
  const additiveTopN = topNIds(additiveRanked, n);
  const classifierTopN = topNIds(classifierRanked, n);
  log.info('[context-ranker] shadow', {
    additiveTopN,
    classifierTopN,
    overlap: overlapRatio(additiveTopN, classifierTopN),
  });
}

/**
 * Run shadow mode: compute classifier ranking alongside additive ranking,
 * log the comparison for offline AUC analysis. Never throws; errors logged once.
 */
export function runShadowMode(
  additiveRanked: RankedContextFile[],
  candidates: Map<string, MutableCandidate>,
  request: TaskRequest,
): void {
  try {
    computeShadowLog(additiveRanked, candidates, request);
  } catch (err) {
    if (!shadowErrorLogged) {
      shadowErrorLogged = true;
      log.info('[context-ranker] shadow classifier error (logged once)', { err: String(err) });
    }
  }
}
