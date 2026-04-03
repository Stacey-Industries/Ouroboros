/**
 * llmFallback.test.ts — Unit tests for the LLM fallback classifier (Layer 3).
 *
 * Mocks createAnthropicClient so no real API calls are made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock setup ───────────────────────────────────────────────────────────────

// vi.mock factories are hoisted to the top of the file, so mockCreate must
// also be hoisted via vi.hoisted to avoid a TDZ ReferenceError.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('../orchestration/providers/anthropicAuth', () => ({
  createAnthropicClient: vi.fn().mockResolvedValue({
    messages: { create: mockCreate },
  }),
}));

// Import AFTER mock registration
import { createLLMFallback } from './llmFallback';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(tier: string, reason = 'test'): object {
  return {
    content: [{ type: 'text', text: JSON.stringify({ tier, reason }) }],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createLLMFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a valid tier from a successful API response', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('SONNET', 'bug fix needed'));

    const fallback = createLLMFallback();
    const result = await fallback.classify('Fix the login bug');

    expect(result.tier).toBe('SONNET');
    expect(result.reason).toBe('bug fix needed');
  });

  it('returns HAIKU tier when API returns HAIKU', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('HAIKU', 'simple lookup'));

    const fallback = createLLMFallback();
    const result = await fallback.classify('What does fs.readFile do?');

    expect(result.tier).toBe('HAIKU');
  });

  it('returns OPUS tier when API returns OPUS', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('OPUS', 'arch decision needed'));

    const fallback = createLLMFallback();
    const result = await fallback.classify('Design the new auth system');

    expect(result.tier).toBe('OPUS');
  });

  it('returns SONNET fallback when API throws an error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'));

    const fallback = createLLMFallback();
    const result = await fallback.classify('Some prompt');

    expect(result.tier).toBe('SONNET');
    expect(result.reason).toBe('fallback-on-error');
  });

  it('returns SONNET fallback when API returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    const fallback = createLLMFallback();
    const result = await fallback.classify('Some prompt');

    expect(result.tier).toBe('SONNET');
    expect(result.reason).toBe('fallback-on-error');
  });

  it('returns SONNET fallback when JSON has an invalid tier value', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('UNKNOWN_TIER'));

    const fallback = createLLMFallback();
    const result = await fallback.classify('Some prompt');

    expect(result.tier).toBe('SONNET');
    expect(result.reason).toBe('fallback-on-error');
  });

  it('returns cached result for the same prompt without re-calling the API', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('SONNET', 'cached'));

    const fallback = createLLMFallback();
    const first = await fallback.classify('Repeated prompt');
    const second = await fallback.classify('Repeated prompt');

    expect(first).toEqual(second);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('re-calls the API after the cache TTL expires', async () => {
    mockCreate
      .mockResolvedValueOnce(makeResponse('HAIKU', 'first call'))
      .mockResolvedValueOnce(makeResponse('SONNET', 'second call'));

    const fallback = createLLMFallback();
    const first = await fallback.classify('Cache expiry test');

    // Advance time past the 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const second = await fallback.classify('Cache expiry test');

    expect(first.tier).toBe('HAIKU');
    expect(second.tier).toBe('SONNET');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('includes context in the user message when provided', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('OPUS', 'needs context'));

    const fallback = createLLMFallback();
    await fallback.classify('Refactor this module', 'Previously discussed auth system');

    const callArgs = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const userContent = callArgs.messages[0]?.content ?? '';

    expect(userContent).toContain('Previously discussed auth system');
    expect(userContent).toContain('Refactor this module');
  });

  it('uses only the prompt (no context prefix) when context is omitted', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('HAIKU', 'simple'));

    const fallback = createLLMFallback();
    await fallback.classify('Just a plain prompt');

    const callArgs = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const userContent = callArgs.messages[0]?.content ?? '';

    expect(userContent).toBe('Just a plain prompt');
    expect(userContent).not.toContain('Previous context:');
  });
});
