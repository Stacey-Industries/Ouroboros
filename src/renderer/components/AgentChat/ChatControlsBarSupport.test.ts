import { describe, expect, it } from 'vitest';

import { buildDisplayUsage, buildThreadModelUsage } from './ChatControlsBarSupport';

describe('buildDisplayUsage', () => {
  it('returns persisted usage when not streaming', () => {
    const usage = buildDisplayUsage({
      activeModel: 'openai:gpt-5.4',
      threadModelUsage: [{ model: 'gpt-5.4', inputTokens: 1200, outputTokens: 300 }],
    });

    expect(usage).toEqual([{ model: 'gpt-5.4', inputTokens: 1200, outputTokens: 300 }]);
  });

  it('uses streaming token usage as override, not addition', () => {
    const usage = buildDisplayUsage({
      activeModel: 'openai:gpt-5.4',
      threadModelUsage: [{ model: 'gpt-5.4', inputTokens: 1200, outputTokens: 300 }],
      streamingTokenUsage: { inputTokens: 5000, outputTokens: 150 },
    });

    expect(usage).toEqual([{ model: 'openai:gpt-5.4', inputTokens: 5000, outputTokens: 150 }]);
  });

  it('returns empty when no persisted usage and not streaming', () => {
    const usage = buildDisplayUsage({
      activeModel: 'openai:gpt-5.4',
    });

    expect(usage).toEqual([]);
  });
});

describe('buildThreadModelUsage', () => {
  it('uses the highest input token value per model (high-water mark)', () => {
    const usage = buildThreadModelUsage([
      {
        id: 'm1',
        threadId: 't1',
        role: 'assistant',
        content: 'first',
        createdAt: 1,
        model: 'gpt-5.4',
        tokenUsage: { inputTokens: 5000, outputTokens: 100 },
      },
      {
        id: 'm2',
        threadId: 't1',
        role: 'assistant',
        content: 'second',
        createdAt: 2,
        model: 'gpt-5.4',
        tokenUsage: { inputTokens: 18000, outputTokens: 300 },
      },
      {
        id: 'm3',
        threadId: 't1',
        role: 'assistant',
        content: 'third (after compaction)',
        createdAt: 3,
        model: 'gpt-5.4',
        tokenUsage: { inputTokens: 1200, outputTokens: 50 },
      },
    ]);

    expect(usage).toEqual([{ model: 'gpt-5.4', inputTokens: 18000, outputTokens: 300 }]);
  });

  it('keeps separate high-water entries for different models', () => {
    const usage = buildThreadModelUsage([
      {
        id: 'm1',
        threadId: 't1',
        role: 'assistant',
        content: 'codex',
        createdAt: 1,
        model: 'gpt-5.4',
        tokenUsage: { inputTokens: 900, outputTokens: 100 },
      },
      {
        id: 'm2',
        threadId: 't1',
        role: 'assistant',
        content: 'claude',
        createdAt: 2,
        model: 'claude-opus-4-6',
        tokenUsage: { inputTokens: 1800, outputTokens: 200 },
      },
    ]);

    expect(usage).toEqual([
      { model: 'gpt-5.4', inputTokens: 900, outputTokens: 100 },
      { model: 'claude-opus-4-6', inputTokens: 1800, outputTokens: 200 },
    ]);
  });
});
