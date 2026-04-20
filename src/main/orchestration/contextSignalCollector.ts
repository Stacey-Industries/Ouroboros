/**
 * contextSignalCollector.ts — Transforms ranked file lists into ContextDecision
 * records and hands them to the JSONL writer.
 *
 * Two public functions:
 *   initContextSignalCollector(writer) — inject writer (defaults to production singleton)
 *   emitContextDecisions(traceId, features, final) — emit decisions for one packet build
 *
 * Respects the `context.decisionLogging` feature flag — if false, all calls are no-ops.
 */

import { randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';

import { getConfigValue } from '../config';
import log from '../logger';
import type { DecisionWriter } from './contextDecisionWriter';
import { getDecisionWriter } from './contextDecisionWriter';
import type { ContextDecision, ContextFeatures } from './contextTypes';

// ─── Feature-flag accessor (injected for testability) ─────────────────────────

type FlagGetter = () => boolean;

let getFlagValue: FlagGetter = defaultFlagGetter;

interface ContextConfig {
  decisionLogging?: boolean;
}

function defaultFlagGetter(): boolean {
  try {
    const ctx = getConfigValue('context') as ContextConfig | null | undefined;
    if (ctx && typeof ctx.decisionLogging === 'boolean') {
      return ctx.decisionLogging;
    }
  } catch {
    // Config not ready yet (e.g. during unit tests) — default on
  }
  return true;
}

/** @internal Override the flag getter (used in tests). */
export function _setFlagGetterForTests(getter: FlagGetter): void {
  getFlagValue = getter;
}

/** @internal Reset the flag getter to production default. */
export function _resetFlagGetterForTests(): void {
  getFlagValue = defaultFlagGetter;
}

// ─── Writer injection ─────────────────────────────────────────────────────────

let injectedWriter: DecisionWriter | null = null;

/**
 * Inject a specific writer. Call once at startup (after initDecisionWriter).
 * In tests, pass a mock writer directly.
 */
export function initContextSignalCollector(writer: DecisionWriter): void {
  injectedWriter = writer;
}

function resolveWriter(): DecisionWriter | null {
  return injectedWriter ?? getDecisionWriter();
}

// ─── Decision building ────────────────────────────────────────────────────────

interface FinalDecision {
  fileId: string;
  score: number;
  included: boolean;
}

function buildDecision(
  traceId: string,
  features: ContextFeatures,
  final: FinalDecision,
): ContextDecision {
  return {
    id: randomUUID(),
    traceId,
    fileId: final.fileId,
    features,
    score: final.score,
    included: final.included,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit one ContextDecision per entry in `final`, merging in the corresponding
 * ContextFeatures by index. If `features` is shorter than `final`, the
 * remaining entries get a synthetic zero-score feature vector.
 */
export function emitContextDecisions(
  traceId: string,
  features: ContextFeatures[],
  final: FinalDecision[],
): void {
  if (!getFlagValue()) return;

  const writer = resolveWriter();
  if (!writer) {
    // The writer singleton is only initialised in the main process. Worker
    // threads (e.g. the proactive context warm-up worker) intentionally do not
    // own a writer because two writers would race on the same JSONL file.
    // Silently drop in workers; warn loudly only in main where it indicates a
    // missing initDecisionWriter call.
    if (isMainThread) {
      log.warn('[contextSignalCollector] no writer — decisions dropped');
    }
    return;
  }

  for (let i = 0; i < final.length; i++) {
    const entry = final.at(i);
    if (!entry) continue;
    const feat: ContextFeatures = features.at(i) ?? {
      score: entry.score,
      reasons: [],
      pagerank_score: null,
      included: entry.included,
    };
    const decision = buildDecision(traceId, feat, entry);
    writer.recordDecision(decision);
  }
}
