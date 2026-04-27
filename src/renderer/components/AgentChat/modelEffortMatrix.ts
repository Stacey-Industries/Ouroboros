/**
 * modelEffortMatrix.ts — Wave 59 Phase G
 *
 * Single source of truth for per-model effort options and display labels.
 * Uses the short model ID shorthands that are stored in ANTHROPIC_OPTIONS /
 * user config (e.g. 'opus', 'sonnet', 'haiku', 'opus[1m]', '__anthropic_auto__').
 */

import { ANTHROPIC_AUTO_MODEL } from './ChatControlsBarSupport';

/** All model ID values that appear in ANTHROPIC_OPTIONS. */
export type AnthropicModelId =
  | typeof ANTHROPIC_AUTO_MODEL
  | 'opus[1m]'
  | 'opus'
  | 'sonnet'
  | 'haiku';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Human-readable display labels for each model ID. */
export const MODEL_LABELS: Record<AnthropicModelId, string> = {
  [ANTHROPIC_AUTO_MODEL]: 'Auto',
  'opus[1m]': 'Opus 4.7 1M',
  opus: 'Opus 4.7',
  sonnet: 'Sonnet 4.6',
  haiku: 'Haiku 4.5',
};

/**
 * Effort levels available per model.
 * null = no effort selector (hide the control entirely).
 */
export const MODEL_EFFORTS: Record<AnthropicModelId, EffortLevel[] | null> = {
  [ANTHROPIC_AUTO_MODEL]: null, // resolved at runtime per underlying model
  'opus[1m]': ['low', 'medium', 'high', 'xhigh', 'max'],
  opus: ['low', 'medium', 'high', 'xhigh', 'max'],
  sonnet: ['low', 'medium', 'high', 'max'],
  haiku: null, // no effort selector
};

/**
 * Returns the display label for a model ID.
 * Falls back to the raw ID if not in the matrix (e.g. third-party providers).
 */
export function getModelLabel(modelId: string): string {
  return MODEL_LABELS[modelId as AnthropicModelId] ?? modelId;
}

/**
 * Returns the effort options for a model ID, or null if effort should be hidden.
 * Returns null for unknown model IDs (conservative: hide effort for unknowns).
 */
export function getEffortOptions(modelId: string): EffortLevel[] | null {
  if (modelId in MODEL_EFFORTS) {
    return MODEL_EFFORTS[modelId as AnthropicModelId];
  }
  return null;
}
