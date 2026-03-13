/**
 * costCalculator.ts — Token cost estimation and formatting utilities.
 *
 * Pricing constants are imported from the shared module (@shared/pricing)
 * to avoid duplication with the main process's usageReader.ts.
 */

import { getPricing, detectPricingKey } from '@shared/pricing';

// Re-export detectPricingKey so existing consumers don't break
export { detectPricingKey };

// ─── Cost estimation ────────────────────────────────────────────────────────

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

export interface EstimateCostOptions {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function estimateCost(options: EstimateCostOptions): CostEstimate {
  const { inputTokens, outputTokens, model, cacheReadTokens, cacheWriteTokens } = options;
  const pricing = getPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  const cacheReadCost = cacheReadTokens
    ? (cacheReadTokens / 1_000_000) * pricing.cacheReadPer1M
    : 0;
  const cacheWriteCost = cacheWriteTokens
    ? (cacheWriteTokens / 1_000_000) * pricing.cacheWritePer1M
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
