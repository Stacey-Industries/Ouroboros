import { describe, expect, it } from 'vitest';

import { resolveChatControlProvider } from './ChatControlsBar';
import {
  ANTHROPIC_AUTO_MODEL,
  buildModelOptions,
  buildThreadModelUsage,
  getContextLimit,
  getEffortOptions,
  getPermissionModes,
  resolveActiveModel,
} from './ChatControlsBarSupport';

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

describe('buildModelOptions', () => {
  it('includes Auto as the first Anthropic option for Claude-family providers', () => {
    const { defaultOption, groups } = buildModelOptions({
      defaultProvider: 'claude-code',
      settingsModel: '',
      codexSettingsModel: '',
    });

    expect(defaultOption).toBeUndefined();
    expect(groups[0]).toEqual({
      label: 'Anthropic',
      options: [
        { value: ANTHROPIC_AUTO_MODEL, label: 'Auto' },
        { value: 'opus[1m]', label: 'Opus 4.7 1M' },
        { value: 'opus', label: 'Opus 4.7' },
        { value: 'sonnet', label: 'Sonnet 4.6' },
        { value: 'haiku', label: 'Haiku 4.5' },
      ],
    });
  });

  it('keeps a provider-aware default label for Codex', () => {
    const { defaultOption } = buildModelOptions({
      defaultProvider: 'codex',
      settingsModel: '',
      codexSettingsModel: 'gpt-5.4',
    });

    expect(defaultOption).toEqual({ value: '', label: 'Default (gpt-5.4)' });
  });

  it('treats Anthropic Auto as a Claude provider selection even when Codex is default', () => {
    expect(resolveChatControlProvider(ANTHROPIC_AUTO_MODEL, 'codex', [{ id: 'gpt-5.4', name: 'GPT-5.4', reasoningEfforts: [] }])).toBe('claude-code');
  });

  it('resolves the active model for Anthropic Auto from Claude settings', () => {
    expect(
      resolveActiveModel({
        activeProvider: 'claude-code',
        selectedModel: ANTHROPIC_AUTO_MODEL,
        settingsModel: 'claude-opus-4-6',
        codexSettingsModel: 'gpt-5.4',
      }),
    ).toBe('claude-opus-4-6');
  });

  it('resolves the active model for Codex from Codex settings when no override is selected', () => {
    expect(
      resolveActiveModel({
        activeProvider: 'codex',
        selectedModel: '',
        settingsModel: 'claude-sonnet-4-6',
        codexSettingsModel: 'gpt-5.4',
      }),
    ).toBe('gpt-5.4');
  });

  it('filters Codex effort options to the selected model capabilities', () => {
    expect(
      getEffortOptions('codex', 'gpt-5.1-codex-mini', [
        {
          id: 'gpt-5.1-codex-mini',
          name: 'gpt-5.1-codex-mini',
          reasoningEfforts: ['medium', 'high'],
        },
      ]),
    ).toEqual([
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ]);
  });

  it('includes Accept Edits in Codex permission modes', () => {
    expect(getPermissionModes('codex')).toContainEqual({
      value: 'acceptEdits',
      label: 'Accept Edits',
    });
  });

  it('uses the effective Codex context window percent when available', () => {
    expect(
      getContextLimit('gpt-5.4', [
        {
          id: 'gpt-5.4',
          name: 'gpt-5.4',
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          contextWindow: 272000,
          effectiveContextWindowPercent: 95,
        },
      ]),
    ).toBe(258400);
  });
});
