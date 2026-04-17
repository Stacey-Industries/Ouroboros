/**
 * triggerEvaluator.ts — Pure decision function for research auto-firing.
 *
 * Wave 30 Phase B. No I/O — all dependencies injected via TriggerContext.
 * Consumed by Phase D (PreToolUse hook) and Phase F (fact-claim detector).
 *
 * Decision order:
 *   1. globalFlag off AND mode !== 'aggressive' → disabled
 *   2. mode === 'off' → disabled (slash-command override)
 *   3. Per-import: correction layer (enhanced-library) → rule layer (staleness-match)
 *   4. At least one cache-hit but no fire → cache-hit
 *   5. No stale imports → no-stale-imports
 */

import type { LayerResult } from './triggerEvaluatorSupport';
import {
  evaluateCorrectionLayer,
  evaluateRuleLayer,
  normalizeImportToLibrary,
} from './triggerEvaluatorSupport';

export { normalizeImportToLibrary };

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TriggerContext {
  dirtyFiles: Array<{ path: string; imports: string[] }>;
  sessionFlags: { mode: 'off' | 'conservative' | 'aggressive'; enhancedLibraries: Set<string> };
  cacheCheck: (library: string) => boolean;
  globalFlag: boolean;
}

export interface TriggerDecision {
  fire: boolean;
  reason: 'disabled' | 'no-stale-imports' | 'cache-hit' | 'staleness-match' | 'enhanced-library' | 'forced-on';
  library?: string;
  triggerSource: 'rule' | 'correction' | 'fact-claim' | 'slash' | 'none';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function disabledResult(triggerSource: TriggerDecision['triggerSource']): TriggerDecision {
  return { fire: false, reason: 'disabled', triggerSource };
}

function evaluateImport(library: string, ctx: TriggerContext): LayerResult {
  const correction = evaluateCorrectionLayer(library, ctx);
  if (correction !== undefined) {
    return correction;
  }
  return evaluateRuleLayer(library, ctx);
}

function collectImports(dirtyFiles: TriggerContext['dirtyFiles']): string[] {
  return dirtyFiles.flatMap((f) => f.imports);
}

function scanImports(imports: string[], ctx: TriggerContext): TriggerDecision | null {
  let hadCacheHit = false;
  for (const raw of imports) {
    const library = normalizeImportToLibrary(raw);
    if (library === '') {
      continue;
    }
    const result = evaluateImport(library, ctx);
    if (result === undefined) {
      continue;
    }
    if (result.fire) {
      return { fire: true, reason: result.reason, library: result.library, triggerSource: result.triggerSource };
    }
    if (result.reason === 'cache-hit') {
      hadCacheHit = true;
    }
  }
  if (hadCacheHit) {
    return { fire: false, reason: 'cache-hit', triggerSource: 'none' };
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate whether research should be auto-fired for the current context.
 * Pure function — no network, no filesystem access.
 */
export function evaluateTrigger(context: TriggerContext): TriggerDecision {
  const { globalFlag, sessionFlags } = context;

  if (!globalFlag && sessionFlags.mode !== 'aggressive') {
    return disabledResult('none');
  }

  if (sessionFlags.mode === 'off') {
    return disabledResult('slash');
  }

  const imports = collectImports(context.dirtyFiles);
  const found = scanImports(imports, context);
  if (found !== null) {
    return found;
  }

  return { fire: false, reason: 'no-stale-imports', triggerSource: 'none' };
}
