/**
 * effortEstimator.ts — Heuristic cost and latency estimator for a chat turn (Wave 26 Phase C).
 *
 * Estimates turn cost in USD and predicted latency in ms based on profile inference
 * params and estimated context tokens.
 *
 * Pricing (per million tokens, input/output) and speed (tokens/sec) are hardcoded
 * heuristics — the provider adapter ignores unknown fields anyway, so we err toward
 * being useful rather than perfectly accurate.
 */

import type { Profile } from '@shared/types/profile';

// ─── Model price table ────────────────────────────────────────────────────────

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Approximate streaming tokens/second for latency estimate */
  tokensPerSecond: number;
}

const DEFAULT_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
  tokensPerSecond: 80,
};

function lookupPricing(model: string | undefined): ModelPricing {
  if (!model) return DEFAULT_PRICING;
  const m = model.toLowerCase();
  if (m.includes('opus')) {
    return { inputPerMillion: 15, outputPerMillion: 75, tokensPerSecond: 50 };
  }
  if (m.includes('haiku')) {
    return { inputPerMillion: 0.8, outputPerMillion: 4, tokensPerSecond: 140 };
  }
  // sonnet (default)
  return DEFAULT_PRICING;
}

// ─── Effort → output-token estimate ──────────────────────────────────────────

function outputTokensForEffort(effort: string | undefined): number {
  if (effort === 'low') return 500;
  if (effort === 'high') return 8000;
  return 2000; // medium / undefined
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface TurnCostEstimate {
  estimatedMs: number;
  estimatedUsd: number;
}

/**
 * estimateTurnCost — Heuristic estimate of latency and cost for one chat turn.
 *
 * @param profile        The active profile (supplies model + effort).
 * @param contextTokens  Approximate input token count for the turn.
 */
export function estimateTurnCost(
  profile: Pick<Profile, 'model' | 'effort'>,
  contextTokens: number,
): TurnCostEstimate {
  const pricing = lookupPricing(profile.model);
  const inputTokens = Math.max(0, contextTokens);
  const outputTokens = outputTokensForEffort(profile.effort);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const estimatedUsd = inputCost + outputCost;

  const estimatedMs = Math.round((outputTokens / pricing.tokensPerSecond) * 1000);

  return { estimatedMs, estimatedUsd };
}
