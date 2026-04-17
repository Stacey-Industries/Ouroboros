/**
 * modelTrainingCutoffs.ts — Per-model training cutoff registry.
 *
 * Wave 30 Phase J. Provides model-relative cutoff dates so the staleness
 * matrix can give model-specific answers instead of using a single global
 * baseline.
 *
 * Sources: Anthropic model release announcements and public documentation.
 * Quarterly review should update these alongside CURATED_STALENESS_ENTRIES.
 */

// ─── Known model IDs (built-in registry) ─────────────────────────────────────
//
// These are the static model IDs declared in providers.ts (ANTHROPIC_PROVIDER
// + PROVIDER_PRESETS). Dynamic/user-added providers are handled by the
// fallback path in getModelCutoffDate.

export type BuiltInModelId =
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5-20251001'
  | 'opus'
  | 'sonnet'
  | 'haiku'
  | 'MiniMax-M2.7'
  | 'MiniMax-M2.5';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModelTrainingInfo {
  /** ISO 8601 date — approximate end of training data window */
  cutoffDate: string;
  /** Optional explanation of the estimate's source or confidence */
  notes?: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
//
// Typed as Record<BuiltInModelId, ...> so tsc errors if a BuiltInModelId is
// added to the union without a corresponding entry here.

export const MODEL_TRAINING_CUTOFFS: Record<BuiltInModelId, ModelTrainingInfo> = {
  'claude-opus-4-6': {
    cutoffDate: '2025-09-01',
    notes: 'Opus 4.6 — estimated training cutoff based on release cycle',
  },
  'claude-sonnet-4-6': {
    cutoffDate: '2025-09-01',
    notes: 'Sonnet 4.6 — estimated training cutoff; same generation as Opus 4.6',
  },
  'claude-haiku-4-5-20251001': {
    cutoffDate: '2025-07-01',
    notes: 'Haiku 4.5 (Oct 2025 release) — conservative estimate, smaller model',
  },
  opus: {
    cutoffDate: '2025-09-01',
    notes: 'Alias for latest Opus — inherits Opus 4.6 cutoff estimate',
  },
  sonnet: {
    cutoffDate: '2025-09-01',
    notes: 'Alias for latest Sonnet — inherits Sonnet 4.6 cutoff estimate',
  },
  haiku: {
    cutoffDate: '2025-07-01',
    notes: 'Alias for latest Haiku — inherits Haiku 4.5 cutoff estimate',
  },
  'MiniMax-M2.7': {
    cutoffDate: '2025-06-01',
    notes: 'MiniMax M2.7 — conservative estimate; limited public information',
  },
  'MiniMax-M2.5': {
    cutoffDate: '2025-06-01',
    notes: 'MiniMax M2.5 — conservative estimate; limited public information',
  },
};

// ─── Log-once deduplication ───────────────────────────────────────────────────

const warnedModelIds = new Set<string>();

// ─── Fallback date helper ─────────────────────────────────────────────────────

function todayMinus180dISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the training cutoff date for a given model ID.
 *
 * - Known BuiltInModelId → entry.cutoffDate
 * - Unknown or undefined → logs a warning exactly once per unique ID per
 *   process, then returns (today − 180 days) as a conservative fallback.
 *
 * The 180-day fallback is intentionally conservative: an unknown model is
 * assumed to have a stale picture of any library whose cutoffDate is within
 * the last 6 months.
 */
export function getModelCutoffDate(modelId: string | undefined): string {
  const key = modelId ?? '__undefined__';
  const registry = MODEL_TRAINING_CUTOFFS as Record<string, ModelTrainingInfo>;
  // eslint-disable-next-line security/detect-object-injection -- modelId comes from internal session state, not user-controlled renderer input
  const entry = modelId !== undefined ? registry[modelId] : undefined;

  if (entry !== undefined) {
    return entry.cutoffDate;
  }

  if (!warnedModelIds.has(key)) {
    warnedModelIds.add(key);
    console.warn(
      `[research] Unknown modelId "${key}" — falling back to today-180d cutoff. ` +
      'Add an entry to MODEL_TRAINING_CUTOFFS in modelTrainingCutoffs.ts.',
    );
  }

  return todayMinus180dISO();
}

/** @internal Test-only — clear the log-once dedup set. */
export function resetWarnedModelIdsForTests(): void {
  warnedModelIds.clear();
}
