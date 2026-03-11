/**
 * costCalculator.ts — Token cost estimation and formatting utilities.
 *
 * Pricing is hardcoded per model family. Detects model from the model
 * identifier string (e.g. "claude-sonnet-4-20250514" → Sonnet 4 pricing).
 */

// ─── Pricing table (USD per 1M tokens) ──────────────────────────────────────

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
}

const PRICING: Record<string, ModelPricing> = {
  'opus-4': { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  'sonnet-4': { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  'haiku-3.5': { inputPer1M: 0.8, outputPer1M: 4, cacheReadPer1M: 0.08, cacheWritePer1M: 1 },
};

/** Default pricing when model is unknown — uses Sonnet 4 as most common. */
const DEFAULT_PRICING = PRICING['sonnet-4'];

// ─── Model detection ────────────────────────────────────────────────────────

/**
 * Extract a pricing key from a model identifier string.
 * Examples:
 *   "claude-opus-4-20250514" → "opus-4"
 *   "claude-sonnet-4-20250514" → "sonnet-4"
 *   "claude-3-5-haiku-20241022" → "haiku-3.5"
 */
export function detectPricingKey(model?: string): string | null {
  if (!model) return null;
  const m = model.toLowerCase();

  if (m.includes('opus-4') || m.includes('opus4')) return 'opus-4';
  if (m.includes('sonnet-4') || m.includes('sonnet4')) return 'sonnet-4';
  if (m.includes('haiku-3') || m.includes('haiku3')) return 'haiku-3.5';

  return null;
}

function getPricing(model?: string): ModelPricing {
  const key = detectPricingKey(model);
  return key ? PRICING[key] : DEFAULT_PRICING;
}

// ─── Cost estimation ────────────────────────────────────────────────────────

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model?: string,
  cacheReadTokens?: number,
  cacheWriteTokens?: number,
): CostEstimate {
  const pricing = getPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheReadCost = cacheReadTokens
    ? (cacheReadTokens / 1_000_000) * (pricing.cacheReadPer1M ?? pricing.inputPer1M * 0.1)
    : 0;
  const cacheWriteCost = cacheWriteTokens
    ? (cacheWriteTokens / 1_000_000) * (pricing.cacheWritePer1M ?? pricing.inputPer1M * 1.25)
    : 0;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

/**
 * Format a token count compactly: 0, 342, 1.2K, 15.3K, 1.2M
 */
export function formatTokenCount(count: number): string {
  if (count === 0) return '0';
  if (count < 1_000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1_000;
    return k >= 10 ? `${k.toFixed(1)}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1_000_000;
  return `${m.toFixed(1)}M`;
}

/**
 * Format a USD cost estimate: "$0.00", "$0.05", "$1.23"
 * Shows more precision for small amounts.
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(2)}`;
}
