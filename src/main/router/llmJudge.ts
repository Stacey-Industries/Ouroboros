/**
 * llmJudge.ts — Batch-scores routing decisions using Haiku as an LLM judge.
 *
 * Disabled by default (sampleRate: 0). When enabled, samples a fraction of
 * routing decisions and asks Haiku to rate the response quality on a 1–5 scale,
 * which maps to tier labels for training data.
 *
 * Uses the same OAuth-managed client as llmFallback.ts — no direct API key.
 */

import { createAnthropicClient } from '../orchestration/providers/anthropicAuth';
import type { ModelTier } from './routerTypes';

/* ── Constants ───────────────────────────────────────────────────────── */

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 100;
const TIMEOUT_MS = 5_000;

const JUDGE_SYSTEM_PROMPT =
  `You are a quality judge for an AI coding assistant. Given a user prompt and the model tier used, ` +
  `rate how appropriate the tier choice was on a 1-5 scale:\n\n` +
  `1-2: Over-powered — a simpler model would suffice\n` +
  `3: Adequate — the tier matched the task complexity\n` +
  `4-5: Under-powered — a more capable model was needed\n\n` +
  `Respond with ONLY a JSON object: {"score": 1-5, "reason": "10 words max"}`;

const VALID_SCORES = new Set([1, 2, 3, 4, 5]);

/* ── Types ───────────────────────────────────────────────────────────── */

export interface JudgeCandidate {
  traceId: string;
  prompt: string;
  tier: ModelTier;
}

export interface JudgeResult {
  traceId: string;
  score: number;
  suggestedTier: ModelTier;
  reason: string;
}

export interface JudgeOptions {
  /** Max entries to judge per batch. Default: 50. */
  maxBatch?: number;
  /** Fraction of entries to sample (0-1). Default: 0 (disabled). */
  sampleRate?: number;
}

/* ── Score → tier mapping ────────────────────────────────────────────── */

function scoreToTier(score: number, originalTier: ModelTier): ModelTier {
  if (score <= 2) {
    if (originalTier === 'OPUS') return 'SONNET';
    if (originalTier === 'SONNET') return 'HAIKU';
    return 'HAIKU';
  }
  if (score >= 4) {
    if (originalTier === 'HAIKU') return 'SONNET';
    if (originalTier === 'SONNET') return 'OPUS';
    return 'OPUS';
  }
  return originalTier; // score 3 = adequate
}

/* ── Sampling ────────────────────────────────────────────────────────── */

function sampleEntries(entries: JudgeCandidate[], rate: number, max: number): JudgeCandidate[] {
  if (rate <= 0 || max <= 0) return [];
  const sampled: JudgeCandidate[] = [];
  for (const entry of entries) {
    if (Math.random() < rate) sampled.push(entry);
    if (sampled.length >= max) break;
  }
  return sampled;
}

/* ── API call ────────────────────────────────────────────────────────── */

async function judgeOne(candidate: JudgeCandidate): Promise<JudgeResult | null> {
  try {
    const client = await createAnthropicClient();
    const userMsg = `Tier used: ${candidate.tier}\nPrompt: ${candidate.prompt}`;
    const response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: MAX_TOKENS,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('');

    return parseJudgeResponse(text, candidate);
  } catch {
    return null; // API errors are silently skipped
  }
}

function parseJudgeResponse(text: string, candidate: JudgeCandidate): JudgeResult | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const score = Number(parsed['score']);
    if (!VALID_SCORES.has(score)) return null;
    return {
      traceId: candidate.traceId,
      score,
      suggestedTier: scoreToTier(score, candidate.tier),
      reason: typeof parsed['reason'] === 'string' ? (parsed['reason'] as string) : '',
    };
  } catch {
    return null;
  }
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Batch-judge a set of routing decisions using Haiku.
 * Returns only successfully judged entries. Skips API errors silently.
 * When sampleRate is 0 (default), returns an empty array with zero API calls.
 */
export async function batchJudgeEntries(
  entries: JudgeCandidate[],
  opts?: JudgeOptions,
): Promise<JudgeResult[]> {
  const rate = opts?.sampleRate ?? 0;
  const max = opts?.maxBatch ?? 50;
  const sampled = sampleEntries(entries, rate, max);
  if (sampled.length === 0) return [];

  const results: JudgeResult[] = [];
  for (const candidate of sampled) {
    const result = await judgeOne(candidate);
    if (result) results.push(result);
  }
  return results;
}

// Re-export TIMEOUT_MS for testing
export const _TIMEOUT_MS = TIMEOUT_MS;
