/**
 * pricing.ts — Shared model pricing constants.
 *
 * Single source of truth for Claude model pricing, imported by both
 * the main process (usageReader.ts) and renderer (costCalculator.ts).
 *
 * IMPORTANT: This module must have ZERO dependencies (no Node.js, no Electron,
 * no renderer-specific imports) so it can be bundled into any process.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M: number
  /** USD per 1M output tokens */
  outputPer1M: number
  /** USD per 1M cache-read input tokens */
  cacheReadPer1M: number
  /** USD per 1M cache-write input tokens */
  cacheWritePer1M: number
}

// ─── Pricing table (USD per 1M tokens) ──────────────────────────────────────

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'opus-4':    { inputPer1M: 15,  outputPer1M: 75, cacheReadPer1M: 1.5,  cacheWritePer1M: 18.75 },
  'sonnet-4':  { inputPer1M: 3,   outputPer1M: 15, cacheReadPer1M: 0.3,  cacheWritePer1M: 3.75  },
  'haiku-3.5': { inputPer1M: 0.8, outputPer1M: 4,  cacheReadPer1M: 0.08, cacheWritePer1M: 1     },
}

/** Default pricing when model is unknown — uses Sonnet 4 as most common. */
export const DEFAULT_PRICING: ModelPricing = MODEL_PRICING['sonnet-4']

// ─── Model detection ────────────────────────────────────────────────────────

/**
 * Extract a pricing key from a model identifier string.
 * Examples:
 *   "claude-opus-4-20250514" -> "opus-4"
 *   "claude-sonnet-4-20250514" -> "sonnet-4"
 *   "claude-3-5-haiku-20241022" -> "haiku-3.5"
 */
export function detectPricingKey(model?: string): string | null {
  if (!model) return null
  const m = model.toLowerCase()

  if (m.includes('opus-4') || m.includes('opus4')) return 'opus-4'
  if (m.includes('sonnet-4') || m.includes('sonnet4')) return 'sonnet-4'
  if (m.includes('haiku-3') || m.includes('haiku3')) return 'haiku-3.5'

  return null
}

/**
 * Get pricing for a model identifier string.
 * Falls back to Sonnet 4 pricing if model is unknown.
 */
export function getPricing(model?: string): ModelPricing {
  const key = detectPricingKey(model)
  return key ? MODEL_PRICING[key] : DEFAULT_PRICING
}
