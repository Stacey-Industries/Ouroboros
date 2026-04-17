/**
 * triggerEvaluatorSupport.ts — Helpers for the trigger evaluator.
 *
 * Exports:
 *   - normalizeImportToLibrary: strips sub-paths and returns the root package name
 *   - evaluateRuleLayer:        staleness-matrix check for a single import
 *   - evaluateCorrectionLayer:  enhanced-library (correction store) check for a single import
 *
 * All functions are pure — no I/O, no side effects.
 */

import { getConfigValue } from '../config';
import { getModelCutoffDate } from './modelTrainingCutoffs';
import { isStale } from './stalenessMatrix';
import type { TriggerContext, TriggerDecision } from './triggerEvaluator';

// ─── Import normalisation ─────────────────────────────────────────────────────

/**
 * Convert a raw import string into an npm package name.
 *
 * Examples:
 *   'next/navigation'         → 'next'
 *   '@radix-ui/react-dialog'  → '@radix-ui/react-dialog'
 *   '@scope/pkg/sub'          → '@scope/pkg'
 *   './utils'                 → ''   (relative — ignored)
 *   '../helpers/foo'          → ''   (relative — ignored)
 */
export function normalizeImportToLibrary(imp: string): string {
  if (imp.startsWith('./') || imp.startsWith('../')) {
    return '';
  }
  if (imp.startsWith('@')) {
    const parts = imp.split('/');
    if (parts.length < 2) {
      return '';
    }
    return `${parts[0]}/${parts[1]}`;
  }
  return imp.split('/')[0] ?? '';
}

// ─── Partial decision types ───────────────────────────────────────────────────

/**
 * Result from a layer evaluation. `undefined` means "no opinion — continue".
 * A returned object means the layer has reached a final decision for this import.
 */
export type LayerResult = Pick<TriggerDecision, 'fire' | 'reason' | 'triggerSource' | 'library'> | undefined;

// ─── Correction layer ─────────────────────────────────────────────────────────

/**
 * Checks whether `library` is in the session-enhanced set.
 *
 * Enhanced + cached  → cache-hit (don't refire)
 * Enhanced + !cached → fire with reason:'enhanced-library', triggerSource:'correction'
 * Not enhanced       → undefined (rule layer should decide)
 */
export function evaluateCorrectionLayer(library: string, ctx: TriggerContext): LayerResult {
  if (!ctx.sessionFlags.enhancedLibraries.has(library)) {
    return undefined;
  }
  if (ctx.cacheCheck(library)) {
    // Cached — record hit but don't fire; caller will surface cache-hit if nothing else fires.
    return { fire: false, reason: 'cache-hit', triggerSource: 'none', library };
  }
  return { fire: true, reason: 'enhanced-library', triggerSource: 'correction', library };
}

// ─── Confidence floor ─────────────────────────────────────────────────────────

/** Numeric map for confidence string comparison. */
const CONFIDENCE_VALUE: Record<'high' | 'medium' | 'low', number> = {
  high: 1.0,
  medium: 0.5,
  low: 0.25,
};

/** Read the staleness confidence floor from config at call time. */
function resolveConfidenceFloor(): number {
  try {
    const cfg = getConfigValue('researchSettings' as keyof import('../config').AppConfig) as
      | { stalenessConfidenceFloor?: number }
      | undefined;
    return cfg?.stalenessConfidenceFloor ?? 0.0;
  } catch {
    return 0.0;
  }
}

// ─── Rule layer ───────────────────────────────────────────────────────────────

/**
 * Checks whether `library` is stale according to the staleness matrix,
 * relative to the session model's training cutoff (Phase J).
 *
 * Stale + cached  → cache-hit (don't fire; caller aggregates)
 * Stale + !cached → fire with reason:'staleness-match', triggerSource:'rule'
 * Not stale       → undefined (no opinion)
 *
 * Phase I: curated entries whose confidence maps below the config
 * `stalenessConfidenceFloor` are treated as not-stale.
 */
export function evaluateRuleLayer(
  library: string,
  ctx: TriggerContext,
  modelCutoffDate?: string,
): LayerResult {
  const result = isStale(library, undefined, modelCutoffDate);
  if (!result.stale) {
    return undefined;
  }
  const floor = resolveConfidenceFloor();
  if (floor > 0.0 && result.entry !== null) {
    const confidence = result.entry.confidence as 'high' | 'medium' | 'low';
    // eslint-disable-next-line security/detect-object-injection -- confidence is a string literal from the type union
    const confidenceValue = CONFIDENCE_VALUE[confidence] ?? 0.25;
    if (confidenceValue < floor) {
      return undefined; // below floor — treat as not-stale
    }
  }
  if (ctx.cacheCheck(library)) {
    return { fire: false, reason: 'cache-hit', triggerSource: 'none', library };
  }
  return { fire: true, reason: 'staleness-match', triggerSource: 'rule', library };
}

/**
 * Resolve the model cutoff date for a TriggerContext.
 * Exported so triggerEvaluator.ts can resolve once and pass to evaluateRuleLayer.
 */
export function resolveModelCutoffDate(ctx: TriggerContext): string {
  return getModelCutoffDate(ctx.modelId);
}
