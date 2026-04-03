/**
 * llmFallback.ts — Layer 3 of the model router cascade.
 *
 * Calls Haiku to classify prompts when the rule engine and ML classifier
 * don't have enough confidence. Results are cached in-memory to avoid
 * repeated API calls for identical prompts.
 */

import { createAnthropicClient } from '../orchestration/providers/anthropicAuth';
import type { LLMFallbackResult, ModelTier } from './routerTypes';

// ── Constants ────────────────────────────────────────────────────────────────

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 50;
const TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 100;
const PROMPT_CACHE_KEY_LENGTH = 200;

const SYSTEM_PROMPT =
  `You are a model routing classifier. Given a user prompt from a coding IDE, classify it into the minimum model tier needed:\n\n` +
  `HAIKU — Mechanical tasks: lookups, status checks, simple edits, confirmations\n` +
  `SONNET — Competent implementation: bug fixes, features, refactoring, multi-file edits\n` +
  `OPUS — Judgment required: architecture, planning, ambiguous problems, tradeoff evaluation\n\n` +
  `Respond with ONLY a JSON object: {"tier": "HAIKU" or "SONNET" or "OPUS", "reason": "5 words max"}`;

const FALLBACK_ERROR: LLMFallbackResult = { tier: 'SONNET', reason: 'fallback-on-error' };

const VALID_TIERS = new Set<string>(['HAIKU', 'SONNET', 'OPUS']);

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: LLMFallbackResult;
  expiresAt: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildUserMessage(prompt: string, context?: string): string {
  if (!context) return prompt;
  return `Previous context: ${context}\n\nUser prompt: ${prompt}`;
}

function parseClassification(text: string): LLMFallbackResult {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const tier = parsed['tier'];
  const reason = parsed['reason'];
  if (typeof tier !== 'string' || !VALID_TIERS.has(tier)) {
    throw new Error(`Invalid tier: ${String(tier)}`);
  }
  return { tier: tier as ModelTier, reason: typeof reason === 'string' ? reason : '' };
}

function evictOldestEntry(cache: Map<string, CacheEntry>): void {
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

function getCached(cache: Map<string, CacheEntry>, key: string): LLMFallbackResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(
  cache: Map<string, CacheEntry>,
  key: string,
  result: LLMFallbackResult,
): void {
  if (cache.size >= CACHE_MAX_SIZE) evictOldestEntry(cache);
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function callApi(prompt: string, context?: string): Promise<LLMFallbackResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const client = await createAnthropicClient();
    const response = await client.messages.create(
      {
        model: CLASSIFIER_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(prompt, context) }],
      },
      { signal: controller.signal },
    );

    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('No text content in response');
    return parseClassification(block.text);
  } finally {
    clearTimeout(timer);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createLLMFallback(): {
  classify(prompt: string, context?: string): Promise<LLMFallbackResult>;
} {
  const cache = new Map<string, CacheEntry>();

  return {
    async classify(prompt: string, context?: string): Promise<LLMFallbackResult> {
      const cacheKey = prompt.slice(0, PROMPT_CACHE_KEY_LENGTH);
      const cached = getCached(cache, cacheKey);
      if (cached) return cached;

      try {
        const result = await callApi(prompt, context);
        setCached(cache, cacheKey, result);
        return result;
      } catch (err) {
        console.warn('[llmFallback] Classification failed:', err);
        return FALLBACK_ERROR;
      }
    },
  };
}
