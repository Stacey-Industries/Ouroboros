/**
 * ChatControlsBarSupport.ts — Pure helpers and constants for ChatControlsBar.
 * Extracted to keep ChatControlsBar.tsx under the 300-line limit.
 */
import type { AgentChatMessageRecord } from '../../../shared/types/agentChat';
import type { CodexModelOption, ModelProvider } from '../../types/electron';

export type OptionItem = { value: string; label: string };
export type OptionGroup = { label: string; options: OptionItem[] };
export type ChatControlProvider = 'claude-code' | 'codex' | 'anthropic-api';
export type ModelUsageEntry = { model: string; inputTokens: number; outputTokens: number };
export const ANTHROPIC_AUTO_MODEL = '__anthropic_auto__';

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
  { value: ANTHROPIC_AUTO_MODEL, label: 'Auto' },
  { value: 'opus[1m]', label: 'Opus 4.6 1M' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

export function isAnthropicAutoModel(modelId: string): boolean {
  return modelId === ANTHROPIC_AUTO_MODEL;
}

/** Opus only — supports extended thinking up to Max budget. */
export const CLAUDE_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

/** Sonnet, Haiku, and third-party provider models — no Max effort tier. */
export const CLAUDE_EFFORT_OPTIONS_LIMITED: ReadonlyArray<OptionItem> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const CODEX_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'extra_high', label: 'Extra High' },
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
}): { defaultOption: OptionItem | undefined; groups: OptionGroup[] } {
  const groups = [
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
  ];
  const defaultOption =
    args.defaultProvider === 'codex'
      ? {
          value: '',
          label: args.codexSettingsModel
            ? `Default (${getDisplayModelName(args.codexSettingsModel)})`
            : 'Default',
        }
      : undefined;
  return { defaultOption, groups };
}

export function getEffortOptions(
  provider: ChatControlProvider,
  activeModel: string,
): ReadonlyArray<OptionItem> {
  if (provider === 'codex') return CODEX_EFFORT_OPTIONS;
  // Third-party models (minimax:*, openrouter:*) don't support Max.
  if (activeModel.includes(':')) return CLAUDE_EFFORT_OPTIONS_LIMITED;
  // Opus supports Max (extended thinking); Sonnet/Haiku do not.
  if (activeModel.includes('opus')) return CLAUDE_EFFORT_OPTIONS;
  return CLAUDE_EFFORT_OPTIONS_LIMITED;
}

export function getPermissionModes(provider: ChatControlProvider): ReadonlyArray<OptionItem> {
  return provider === 'codex' ? CODEX_PERMISSION_MODES : CLAUDE_PERMISSION_MODES;
}

export function getSelectedModelLabel(
  value: string,
  defaultOption: OptionItem | undefined,
  groups: OptionGroup[],
): string {
  if (defaultOption && value === defaultOption.value) {
    return defaultOption.label;
  }
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value);
    if (match) return match.label;
  }
  if (!value) return groups[0]?.options[0]?.label ?? 'Model';
  return getDisplayModelName(value);
}

export function getSelectedOptionLabel(value: string, options: ReadonlyArray<OptionItem>): string {
  const match = options.find((option) => option.value === value);
  return match?.label ?? options[0]?.label ?? value;
}

/** Extract canonical model family keyword for cross-convention comparison. */
function modelFamilyKey(id: string): string {
  if (isAnthropicAutoModel(id)) return 'sonnet';
  const lower = stripProviderPrefix(id).toLowerCase().replace(/\[1m]/, '');
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return lower;
}

function stripProviderPrefix(id: string): string {
  const colonIndex = id.indexOf(':');
  return colonIndex === -1 ? id : id.slice(colonIndex + 1);
}

function modelsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const aUnprefixed = stripProviderPrefix(a);
  const bUnprefixed = stripProviderPrefix(b);
  if (aUnprefixed === bUnprefixed) return true;
  const hasLongCtx = a.includes('[1m]') || b.includes('[1m]');
  const aKey = modelFamilyKey(a);
  const bKey = modelFamilyKey(b);
  if (aKey !== bKey) return false;
  const aLong = a.includes('[1m]');
  const bLong = b.includes('[1m]');
  return hasLongCtx ? aLong === bLong : true;
}

export function buildDisplayUsage(args: {
  activeModel: string;
  threadModelUsage?: ModelUsageEntry[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
}): ModelUsageEntry[] {
  if (!args.activeModel) return [];
  if (args.streamingTokenUsage) {
    return [
      {
        model: args.activeModel,
        inputTokens: args.streamingTokenUsage.inputTokens,
        outputTokens: args.streamingTokenUsage.outputTokens,
      },
    ];
  }
  const persisted = (args.threadModelUsage ?? []).find(
    (entry) => modelsMatch(entry.model, args.activeModel) || !entry.model,
  );
  if (persisted) return [{ ...persisted, model: persisted.model || args.activeModel }];
  return [{ model: args.activeModel, inputTokens: 0, outputTokens: 0 }];
}

export function buildThreadModelUsage(
  messages: AgentChatMessageRecord[] | null | undefined,
): ModelUsageEntry[] | undefined {
  if (!messages?.length) return undefined;

  const maxByModel = new Map<string, ModelUsageEntry>();
  for (const message of messages) {
    if (!message.tokenUsage) continue;
    const key = message.model || '';
    const existing = maxByModel.get(key);
    if (!existing || message.tokenUsage.inputTokens > existing.inputTokens) {
      maxByModel.set(key, {
        model: key,
        inputTokens: message.tokenUsage.inputTokens,
        outputTokens: message.tokenUsage.outputTokens,
      });
    }
  }

  if (maxByModel.size === 0) return undefined;
  return Array.from(maxByModel.values());
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
  if (isAnthropicAutoModel(args.selectedModel)) {
    return args.settingsModel ?? 'sonnet';
  }
  return (
    args.selectedModel ||
    (args.activeProvider === 'codex' ? (args.codexSettingsModel ?? '') : (args.settingsModel ?? '')) ||
    'sonnet'
  );
}
