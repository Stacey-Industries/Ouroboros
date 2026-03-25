/**
 * ChatControlsBarSupport.ts — Pure helpers and constants for ChatControlsBar.
 * Extracted to keep ChatControlsBar.tsx under the 300-line limit.
 */
import type { CodexModelOption, ModelProvider } from '../../types/electron';

export type OptionItem = { value: string; label: string };
export type OptionGroup = { label: string; options: OptionItem[] };
export type ChatControlProvider = 'claude-code' | 'codex' | 'anthropic-api';
export type ModelUsageEntry = { model: string; inputTokens: number; outputTokens: number };

/* ---------- Model name helpers ---------- */

function formatProviderModelName(providerId: string, modelName: string): string {
  if (providerId === 'minimax') {
    const match = modelName.match(/m2\.(5|7)/i);
    if (match) return `M2.${match[1]}`;
  }
  return modelName;
}

function modelDisplayName(modelId: string): string {
  if (!modelId) return 'Default';
  if (modelId.includes(':')) {
    const modelPart = modelId.slice(modelId.indexOf(':') + 1);
    return modelPart.length > 20 ? `${modelPart.slice(0, 18)}...` : modelPart;
  }
  const suffix = modelId.includes('[1m]') ? ' 1M' : '';
  if (modelId.includes('opus')) return `Opus${suffix}`;
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return `Sonnet${suffix}`;
  return modelId;
}

export function getDisplayModelName(modelId: string): string {
  if (!modelId) return 'Default';
  if (modelId.includes(':')) {
    const providerId = modelId.slice(0, modelId.indexOf(':'));
    const modelPart = modelId.slice(modelId.indexOf(':') + 1);
    const display = formatProviderModelName(providerId, modelPart);
    return display.length > 20 ? `${display.slice(0, 18)}...` : display;
  }
  if (modelId.includes('opus') && modelId.includes('[1m]')) return 'Opus Long';
  if (modelId.includes('opus')) return 'Opus';
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return 'Sonnet';
  return modelDisplayName(modelId);
}

export function extractDefaultModelName(label: string): string {
  const match = label.match(/^Default \((.+)\)$/);
  return match ? match[1] : label.replace(/^Default\s*/, '').trim() || 'Default';
}

/* ---------- Constants ---------- */

export const ANTHROPIC_OPTIONS: OptionItem[] = [
  { value: 'opus[1m]', label: 'Opus 4.6 1M' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

export const CLAUDE_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

export const CODEX_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Extra High' },
];

export const CLAUDE_PERMISSION_MODES: ReadonlyArray<OptionItem> = [
  { value: 'default', label: 'Ask First' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass' },
];

export const CODEX_PERMISSION_MODES: ReadonlyArray<OptionItem> = [
  { value: 'default', label: 'Workspace Ask' },
  { value: 'plan', label: 'Read Only' },
  { value: 'auto', label: 'Workspace Auto' },
  { value: 'bypassPermissions', label: 'Bypass' },
];

/* ---------- Option builders ---------- */

function buildProviderGroups(providers?: ModelProvider[]): OptionGroup[] {
  return providers?.length
    ? providers
        .filter((provider) => provider.enabled && provider.models.length > 0)
        .map((provider) => ({
          label: provider.name,
          options: provider.models.map((model) => ({
            value: `${provider.id}:${model.id}`,
            label: formatProviderModelName(provider.id, model.name),
          })),
        }))
    : [];
}

export function buildModelOptions(args: {
  defaultProvider: ChatControlProvider;
  settingsModel: string;
  codexSettingsModel: string;
  codexModels?: CodexModelOption[];
  providers?: ModelProvider[];
}): { defaultOption: OptionItem; groups: OptionGroup[] } {
  const defaultModel =
    args.defaultProvider === 'codex' ? args.codexSettingsModel : args.settingsModel;
  return {
    defaultOption: {
      value: '',
      label: defaultModel ? `Default (${getDisplayModelName(defaultModel)})` : 'Default',
    },
    groups: [
      { label: 'Anthropic', options: ANTHROPIC_OPTIONS },
      ...buildProviderGroups(args.providers),
      ...(args.codexModels?.length
        ? [
            {
              label: 'Codex',
              options: args.codexModels.map((m) => ({ value: m.id, label: m.name })),
            },
          ]
        : []),
    ],
  };
}

export function getEffortOptions(provider: ChatControlProvider): ReadonlyArray<OptionItem> {
  return provider === 'codex' ? CODEX_EFFORT_OPTIONS : CLAUDE_EFFORT_OPTIONS;
}

export function getPermissionModes(provider: ChatControlProvider): ReadonlyArray<OptionItem> {
  return provider === 'codex' ? CODEX_PERMISSION_MODES : CLAUDE_PERMISSION_MODES;
}

export function getSelectedModelLabel(
  value: string,
  defaultOption: OptionItem,
  groups: OptionGroup[],
): string {
  if (!value) return extractDefaultModelName(defaultOption.label);
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value);
    if (match) return match.label;
  }
  return getDisplayModelName(value);
}

export function getSelectedOptionLabel(value: string, options: ReadonlyArray<OptionItem>): string {
  const match = options.find((option) => option.value === value);
  return match?.label ?? options[0]?.label ?? value;
}

export function buildDisplayUsage(args: {
  activeModel: string;
  threadModelUsage?: ModelUsageEntry[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
}): ModelUsageEntry[] {
  if (!args.activeModel) return [];
  const persisted = (args.threadModelUsage ?? []).find((entry) => entry.model === args.activeModel);
  const base = persisted ?? { model: args.activeModel, inputTokens: 0, outputTokens: 0 };
  return args.streamingTokenUsage
    ? [
        {
          model: args.activeModel,
          inputTokens: base.inputTokens + args.streamingTokenUsage.inputTokens,
          outputTokens: base.outputTokens + args.streamingTokenUsage.outputTokens,
        },
      ]
    : [base];
}

export function getContextLimit(modelId: string, codexModels?: CodexModelOption[]): number {
  const codexModel = (codexModels ?? []).find((entry) => entry.id === modelId);
  if (codexModel?.contextWindow) return codexModel.contextWindow;
  return modelId.includes('[1m]') ? 1_000_000 : 200_000;
}

export function getContextTone(pct: number): string {
  return pct >= 90
    ? 'var(--status-error)'
    : pct >= 70
      ? 'var(--status-warning)'
      : 'var(--interactive-accent)';
}

export function resolveActiveModel(args: {
  activeProvider: ChatControlProvider;
  selectedModel: string;
  settingsModel?: string;
  codexSettingsModel?: string;
}): string {
  return (
    args.selectedModel ||
    (args.activeProvider === 'codex' ? (args.codexSettingsModel ?? '') : (args.settingsModel ?? '')) ||
    'sonnet'
  );
}
