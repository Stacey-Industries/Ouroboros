import { describe, expect, it } from 'vitest';

import { applyModelSettingsConfig } from './useAgentChatWorkspace.settings';

describe('applyModelSettingsConfig', () => {
  it('extracts settings model from claude cli settings', () => {
    const setters = {
      setSettingsModel: (v: string) => {
        captured.settingsModel = v;
      },
      setCodexSettingsModel: (v: string) => {
        captured.codexSettingsModel = v;
      },
      setDefaultProvider: (v: string) => {
        captured.defaultProvider = v;
      },
      setModelProviders: (v: unknown[]) => {
        captured.modelProviders = v;
      },
    };
    const captured: Record<string, unknown> = {};

    applyModelSettingsConfig(
      {
        claudeCliSettings: { model: 'claude-opus-4' },
        codexCliSettings: { model: 'gpt-4o' },
        agentChatSettings: { defaultProvider: 'codex' },
        modelProviders: [],
      } as unknown as Parameters<typeof applyModelSettingsConfig>[0],
      setters as Parameters<typeof applyModelSettingsConfig>[1],
    );

    expect(captured.settingsModel).toBe('claude-opus-4');
    expect(captured.codexSettingsModel).toBe('gpt-4o');
    expect(captured.defaultProvider).toBe('codex');
  });

  it('falls back to empty string when claude model is missing', () => {
    const captured: Record<string, unknown> = {};
    const setters = {
      setSettingsModel: (v: string) => {
        captured.settingsModel = v;
      },
      setCodexSettingsModel: (v: string) => {
        captured.codexSettingsModel = v;
      },
      setDefaultProvider: (v: string) => {
        captured.defaultProvider = v;
      },
      setModelProviders: (v: unknown[]) => {
        captured.modelProviders = v;
      },
    };

    applyModelSettingsConfig(
      {} as unknown as Parameters<typeof applyModelSettingsConfig>[0],
      setters as Parameters<typeof applyModelSettingsConfig>[1],
    );

    expect(captured.settingsModel).toBe('');
    expect(captured.defaultProvider).toBe('claude-code');
  });
});
