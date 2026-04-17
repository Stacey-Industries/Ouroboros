/**
 * contextSelectorFeatures.ts — Pure feature extraction for the context ranker.
 *
 * Produces a ContextFeatureVec whose keys and order match contextClassifierDefaults.ts
 * exactly:
 *   recencyScore, pagerankScore, importDistance, keywordOverlap,
 *   prevUsedCount, toolKindHint_read, toolKindHint_edit,
 *   toolKindHint_write, toolKindHint_other
 *
 * All values are normalized to [0, 1].
 * This module has no side effects and no I/O.
 */

import type { ContextFeatureVec } from './contextClassifier';
import type { MutableCandidate } from './contextSelectorHelpers';
import type { OrchestrationMode, TaskRequest } from './types';

/** Context passed to computeFeatures alongside the candidate. */
export interface FeatureCtx {
  /** Request that triggered selection. */
  request: TaskRequest;
  /** Maximum additive score observed across all candidates in this cycle. */
  maxAdditiveScore: number;
  /** Maximum pagerank score observed across all candidates in this cycle. */
  maxPagerankScore: number;
  /** Maximum keyword hit count observed across all candidates (for normalization). */
  maxKeywordHits: number;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return clamp01(numerator / denominator);
}

// ─── Feature derivations ──────────────────────────────────────────────────────

const RECENCY_KINDS = new Set(['recent_user_edit', 'recent_edit', 'recent_agent_edit']);

function deriveRecencyScore(candidate: MutableCandidate): number {
  let maxW = 0;
  for (const r of candidate.reasons) {
    if (RECENCY_KINDS.has(r.kind) && r.weight > maxW) maxW = r.weight;
  }
  return safeDivide(maxW, 32); // recent_user_edit max weight = 32
}

function derivePagerankScore(candidate: MutableCandidate, ctx: FeatureCtx): number {
  const raw = candidate.pagerank_score ?? 0;
  return safeDivide(raw, ctx.maxPagerankScore > 0 ? ctx.maxPagerankScore : 1);
}

function deriveImportDistance(candidate: MutableCandidate): number {
  // import_adjacency = distance 1 (closest); dependency = distance 2.
  // Invert: 1 = very close, 0 = not reachable.
  for (const r of candidate.reasons) {
    if (r.kind === 'import_adjacency') return 1;
  }
  for (const r of candidate.reasons) {
    if (r.kind === 'dependency') return 0.5;
  }
  return 0;
}

function deriveKeywordOverlap(candidate: MutableCandidate, ctx: FeatureCtx): number {
  for (const r of candidate.reasons) {
    if (r.kind === 'keyword_match') {
      // weight = base(26) + hitCount - 1; recover hitCount
      const hitCount = Math.max(1, r.weight - 25);
      return safeDivide(hitCount, ctx.maxKeywordHits > 0 ? ctx.maxKeywordHits : 1);
    }
  }
  return 0;
}

function derivePrevUsedCount(candidate: MutableCandidate): number {
  // Approximated from number of distinct reasons — more reasons ≈ more prior usage.
  return safeDivide(candidate.reasons.length, 8); // 8+ reasons → saturated
}

// ─── toolKindHint one-hot ─────────────────────────────────────────────────────

type ToolHint = 'read' | 'edit' | 'write' | 'other';

function resolveToolHint(mode: OrchestrationMode): ToolHint {
  if (mode === 'edit') return 'edit';
  if (mode === 'review') return 'read';
  return 'other';
}

interface ToolOneHot {
  toolKindHint_read: number;
  toolKindHint_edit: number;
  toolKindHint_write: number;
  toolKindHint_other: number;
}

function toolKindOneHot(hint: ToolHint): ToolOneHot {
  return {
    toolKindHint_read: hint === 'read' ? 1 : 0,
    toolKindHint_edit: hint === 'edit' ? 1 : 0,
    toolKindHint_write: hint === 'write' ? 1 : 0,
    toolKindHint_other: hint === 'other' ? 1 : 0,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the feature vector for a single candidate.
 *
 * Feature order matches BUNDLED_CONTEXT_WEIGHTS.featureOrder exactly:
 *   recencyScore, pagerankScore, importDistance, keywordOverlap,
 *   prevUsedCount, toolKindHint_read, toolKindHint_edit,
 *   toolKindHint_write, toolKindHint_other
 */
export function computeFeatures(
  candidate: MutableCandidate,
  ctx: FeatureCtx,
): ContextFeatureVec {
  const hint = resolveToolHint(ctx.request.mode);
  return {
    recencyScore: deriveRecencyScore(candidate),
    pagerankScore: derivePagerankScore(candidate, ctx),
    importDistance: deriveImportDistance(candidate),
    keywordOverlap: deriveKeywordOverlap(candidate, ctx),
    prevUsedCount: derivePrevUsedCount(candidate),
    ...toolKindOneHot(hint),
  };
}

function maxKeywordHitsForCandidate(c: MutableCandidate): number {
  for (const r of c.reasons) {
    if (r.kind === 'keyword_match') return Math.max(1, r.weight - 25);
  }
  return 0;
}

/**
 * Build a FeatureCtx from the full candidate set for the current cycle.
 * Call once before iterating candidates.
 */
export function buildFeatureCtx(
  request: TaskRequest,
  candidates: Map<string, MutableCandidate>,
): FeatureCtx {
  let maxPagerankScore = 0;
  let maxKeywordHits = 0;
  let maxAdditiveScore = 0;

  for (const c of candidates.values()) {
    const pr = c.pagerank_score ?? 0;
    if (pr > maxPagerankScore) maxPagerankScore = pr;

    const kwHits = maxKeywordHitsForCandidate(c);
    if (kwHits > maxKeywordHits) maxKeywordHits = kwHits;

    const total = c.reasons.reduce((s, r) => s + r.weight, 0);
    if (total > maxAdditiveScore) maxAdditiveScore = total;
  }

  return { request, maxAdditiveScore, maxPagerankScore, maxKeywordHits };
}
