/**
 * Model settings hook extracted from useAgentChatWorkspace to stay within max-lines.
 * Loads and subscribes to claude/codex model configuration from electron config.
 */
import log from 'electron-log/renderer';
import { useEffect, useState } from 'react';

import type { CodexModelOption, ModelProvider } from '../../types/electron';

type CfgType = Awaited<ReturnType<typeof window.electronAPI.config.getAll>>;

function getSettingsModel(cfg: CfgType): string {
  return cfg?.claudeCliSettings?.model ?? '';
}
function getCodexSettingsModel(cfg: CfgType): string {
  return cfg?.codexCliSettings?.model ?? '';
}
function getDefaultProvider(cfg: CfgType): 'claude-code' | 'codex' | 'anthropic-api' {
  return cfg?.agentChatSettings?.defaultProvider ?? 'claude-code';
}
function getModelProviders(cfg: CfgType): ModelProvider[] {
  return cfg?.modelProviders ?? [];
}

interface ModelSettingsSetters {
  setSettingsModel: (v: string) => void;
  setCodexSettingsModel: (v: string) => void;
  setDefaultProvider: (v: 'claude-code' | 'codex' | 'anthropic-api') => void;
  setModelProviders: (v: ModelProvider[]) => void;
}

export function applyModelSettingsConfig(cfg: CfgType, setters: ModelSettingsSetters): void {
  setters.setSettingsModel(getSettingsModel(cfg));
  setters.setCodexSettingsModel(getCodexSettingsModel(cfg));
  setters.setDefaultProvider(getDefaultProvider(cfg));
  setters.setModelProviders(getModelProviders(cfg));
}

export function useModelSettings() {
  const [settingsModel, setSettingsModel] = useState('');
  const [codexSettingsModel, setCodexSettingsModel] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<'claude-code' | 'codex' | 'anthropic-api'>(
    'claude-code',
  );
  const [modelProviders, setModelProviders] = useState<ModelProvider[]>([]);
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config
        .getAll()
        .then((cfg) => {
          applyModelSettingsConfig(cfg, {
            setSettingsModel,
            setCodexSettingsModel,
            setDefaultProvider,
            setModelProviders,
          });
        })
        .catch((error) => {
          log.error('Failed to load config:', error);
        });
      window.electronAPI.codex
        .listModels()
        .then(setCodexModels)
        .catch((error) => {
          log.error('Failed to load Codex models:', error);
        });
    }
  }, []);

  return {
    settingsModel,
    codexSettingsModel,
    defaultProvider,
    modelProviders,
    codexModels,
  };
}
