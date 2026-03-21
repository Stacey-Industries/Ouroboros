/**
 * useProvidersSection.ts — Model hook for the Providers settings tab.
 *
 * Manages provider CRUD and model slot assignments via the draft system.
 */

import { useMemo } from 'react';

import type { AppConfig, ModelProvider, ModelSlotAssignments, ProviderModel } from '../../types/electron';

export interface ProviderModelOption {
  label: string;
  value: string;
}

export interface ProvidersSectionModel {
  providers: ModelProvider[];
  slots: ModelSlotAssignments;
  allModels: ProviderModelOption[];
  addProvider: (provider: ModelProvider) => void;
  updateProvider: (id: string, patch: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  updateSlot: (key: keyof ModelSlotAssignments, value: string) => void;
}

type ConfigChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

const EMPTY_PROVIDERS: ModelProvider[] = [];

const DEFAULT_SLOTS: ModelSlotAssignments = {
  terminal: '',
  agentChat: '',
  claudeMdGeneration: '',
};

const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'opus', name: 'Opus (latest)', provider: 'anthropic' },
  { id: 'sonnet', name: 'Sonnet (latest)', provider: 'anthropic' },
  { id: 'haiku', name: 'Haiku (latest)', provider: 'anthropic' },
];

export const BUILTIN_ANTHROPIC: ModelProvider = {
  id: 'anthropic',
  name: 'Anthropic',
  baseUrl: '',
  apiKey: '',
  models: ANTHROPIC_MODELS,
  enabled: true,
  builtIn: true,
};

function buildAllModels(providers: ModelProvider[]): ProviderModelOption[] {
  const options: ProviderModelOption[] = [];
  for (const provider of [BUILTIN_ANTHROPIC, ...providers]) {
    if (!provider.enabled) continue;
    for (const model of provider.models) {
      options.push({
        label: `${provider.name} / ${model.name}`,
        value: `${provider.id}:${model.id}`,
      });
    }
  }
  return options;
}

export function useProvidersSectionModel(
  draft: AppConfig,
  onChange: ConfigChangeHandler,
): ProvidersSectionModel {
  const providers = draft.modelProviders ?? EMPTY_PROVIDERS;
  const slots = draft.modelSlots ?? DEFAULT_SLOTS;

  const allModels = useMemo(
    () => buildAllModels(providers),
    [providers],
  );

  const addProvider = (provider: ModelProvider): void => {
    onChange('modelProviders', [...providers, provider]);
  };

  const updateProvider = (id: string, patch: Partial<ModelProvider>): void => {
    onChange('modelProviders', providers.map(
      (p) => (p.id === id ? { ...p, ...patch } : p),
    ));
  };

  const removeProvider = (id: string): void => {
    onChange('modelProviders', providers.filter((p) => p.id !== id));
  };

  const updateSlot = (key: keyof ModelSlotAssignments, value: string): void => {
    onChange('modelSlots', { ...slots, [key]: value });
  };

  return { providers, slots, allModels, addProvider, updateProvider, removeProvider, updateSlot };
}
