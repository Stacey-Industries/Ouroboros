import React from 'react';

import type { CodexModelOption, ModelProvider } from '../../types/electron';
import { SelectPill } from './SelectPill';

export interface ChatOverrides {
  model: string;
  effort: string;
  permissionMode: string;
}

type OptionItem = { value: string; label: string };
type OptionGroup = { label: string; options: OptionItem[] };
type ChatControlProvider = 'claude-code' | 'codex' | 'anthropic-api';
type ModelUsageEntry = { model: string; inputTokens: number; outputTokens: number };

function formatProviderModelName(providerId: string, modelName: string): string {
  if (providerId === 'minimax') {
    const match = modelName.match(/m2\.(5|7)/i);
    if (match) {
      return `M2.${match[1]}`;
    }
  }
  return modelName;
}

function modelDisplayName(modelId: string): string {
  if (!modelId) return 'CLI default';
  if (modelId.includes(':')) {
    const modelPart = modelId.slice(modelId.indexOf(':') + 1);
    return modelPart.length > 20 ? `${modelPart.slice(0, 18)}...` : modelPart;
  }
  const is1m = modelId.includes('[1m]');
  const suffix = is1m ? ' 1M' : '';
  if (modelId.includes('opus')) return `Opus${suffix}`;
  if (modelId.includes('haiku')) return 'Haiku';
  if (modelId.includes('sonnet')) return `Sonnet${suffix}`;
  return modelId;
}

function getDisplayModelName(modelId: string): string {
  if (!modelId) return 'CLI default';
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

function extractDefaultModelName(label: string): string {
  const match = label.match(/^Default \((.+)\)$/);
  if (match) return match[1];
  return label.replace(/^Default\s*/, '').trim() || 'CLI default';
}

const ANTHROPIC_OPTIONS: OptionItem[] = [
  { value: 'opus[1m]', label: 'Opus 4.6 1M' },
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

const CLAUDE_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

const CODEX_EFFORT_OPTIONS: ReadonlyArray<OptionItem> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Extra High' },
];

const CLAUDE_PERMISSION_MODES: ReadonlyArray<OptionItem> = [
  { value: 'default', label: 'Ask First' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass' },
];

const CODEX_PERMISSION_MODES: ReadonlyArray<OptionItem> = [
  { value: 'default', label: 'Workspace Ask' },
  { value: 'plan', label: 'Read Only' },
  { value: 'auto', label: 'Workspace Auto' },
  { value: 'bypassPermissions', label: 'Bypass' },
];

function buildProviderGroups(providers?: ModelProvider[]): OptionGroup[] {
  if (!providers?.length) return [];
  return providers
    .filter((provider) => provider.enabled && provider.models.length > 0)
    .map((provider) => ({
      label: provider.name,
      options: provider.models.map((model) => ({
        value: `${provider.id}:${model.id}`,
        label: formatProviderModelName(provider.id, model.name),
      })),
    }));
}

function buildModelOptions(
  defaultProvider: ChatControlProvider,
  settingsModel: string,
  codexSettingsModel: string,
  codexModels?: CodexModelOption[],
  providers?: ModelProvider[],
): { defaultOption: OptionItem; groups: OptionGroup[] } {
  const defaultModel = defaultProvider === 'codex' ? codexSettingsModel : settingsModel;
  const defaultOption: OptionItem = {
    value: '',
    label: `Default (${getDisplayModelName(defaultModel)})`,
  };

  return {
    defaultOption,
    groups: [
      { label: 'Anthropic', options: ANTHROPIC_OPTIONS },
      ...buildProviderGroups(providers),
      ...(codexModels?.length
        ? [{ label: 'Codex', options: codexModels.map((model) => ({ value: model.id, label: model.name })) }]
        : []),
    ],
  };
}

function getEffortOptions(provider: ChatControlProvider): ReadonlyArray<OptionItem> {
  return provider === 'codex' ? CODEX_EFFORT_OPTIONS : CLAUDE_EFFORT_OPTIONS;
}

function getPermissionModes(provider: ChatControlProvider): ReadonlyArray<OptionItem> {
  return provider === 'codex' ? CODEX_PERMISSION_MODES : CLAUDE_PERMISSION_MODES;
}

export function resolveChatControlProvider(
  model: string,
  defaultProvider: ChatControlProvider,
  codexModels?: CodexModelOption[],
): ChatControlProvider {
  if (model && (codexModels ?? []).some((entry) => entry.id === model)) {
    return 'codex';
  }
  return defaultProvider;
}

export function cyclePermissionMode(current: string, provider: ChatControlProvider): string {
  const modes = getPermissionModes(provider);
  const idx = modes.findIndex((mode) => mode.value === current);
  if (idx === -1) {
    return modes[0]?.value ?? current;
  }
  return modes[(idx + 1) % modes.length].value;
}

function resolveActiveModel(args: {
  activeProvider: ChatControlProvider;
  selectedModel: string;
  settingsModel?: string;
  codexSettingsModel?: string;
}): string {
  if (args.selectedModel) {
    return args.selectedModel;
  }
  return args.activeProvider === 'codex'
    ? (args.codexSettingsModel ?? '')
    : (args.settingsModel ?? '');
}

function getSelectedModelLabel(
  value: string,
  defaultOption: OptionItem,
  groups: OptionGroup[],
): string {
  if (!value) {
    return extractDefaultModelName(defaultOption.label);
  }
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value);
    if (match) {
      return match.label;
    }
  }
  return getDisplayModelName(value);
}

function getSelectedOptionLabel(
  value: string,
  options: ReadonlyArray<OptionItem>,
): string {
  const match = options.find((option) => option.value === value);
  return match?.label ?? options[0]?.label ?? value;
}

function buildDisplayUsage(args: {
  activeModel: string;
  threadModelUsage?: ModelUsageEntry[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
}): ModelUsageEntry[] {
  // If streaming token usage exists for the active model, use it as the display value
  // even if persisted usage hasn't arrived yet — it represents current state.
  if (args.streamingTokenUsage && args.activeModel) {
    return [{ model: args.activeModel, ...args.streamingTokenUsage }];
  }
  const usage = args.threadModelUsage ?? [];
  // Don't pre-add the active model with 0 tokens — only show actual usage data.
  // This prevents the context ring from appearing at 0% at the start of a conversation.
  if (!args.activeModel) return usage;
  if (usage.some((entry) => entry.model === args.activeModel)) return usage;
  return usage;
}

function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

function getContextLimit(modelId: string, codexModels?: CodexModelOption[]): number {
  const codexModel = (codexModels ?? []).find((entry) => entry.id === modelId);
  if (codexModel?.contextWindow) return codexModel.contextWindow;
  if (modelId.includes('[1m]')) return 1_000_000;
  return 200_000;
}

function getContextTone(pct: number): string {
  if (pct >= 90) return 'var(--error, #ef4444)';
  if (pct >= 70) return 'var(--warning, #f59e0b)';
  return 'var(--accent)';
}

const pillStyle: React.CSSProperties = {
  borderRadius: '9999px',
  padding: '2px 8px',
};

function ModelSelect(props: {
  value: string;
  defaultOption: OptionItem;
  groups: OptionGroup[];
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <SelectPill
      label="Model"
      value={props.value}
      defaultOption={props.defaultOption}
      groups={props.groups}
      onChange={props.onChange}
      title={getSelectedModelLabel(props.value, props.defaultOption, props.groups)}
    />
  );
}

function ControlSelect(props: {
  label: string;
  value: string;
  options: ReadonlyArray<OptionItem>;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <SelectPill
      label={props.label}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
      title={getSelectedOptionLabel(props.value, props.options)}
    />
  );
}

function PermissionModeIndicator(props: {
  provider: ChatControlProvider;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const modes = getPermissionModes(props.provider);
  const current = modes.find((mode) => mode.value === props.value) ?? modes[0];

  return (
    <button
      type="button"
      onClick={() => props.onChange(cyclePermissionMode(props.value, props.provider))}
      className="flex items-center gap-1 text-[11px] text-text-semantic-muted transition-colors duration-150 hover:bg-[rgba(128,128,128,0.15)]"
      style={{ ...pillStyle, fontFamily: 'var(--font-ui)' }}
      title="Permission mode (Shift+Tab to cycle)"
    >
      <span className="text-text-semantic-primary">{current.label}</span>
    </button>
  );
}

function ContextRing(props: {
  pct: number;
  tone: string;
  label: string;
  size?: number;
  stroke?: number;
}): React.ReactElement {
  const size = props.size ?? 26;
  const stroke = props.stroke ?? 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (props.pct / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ pointerEvents: 'none' }}>
      <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={props.tone}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
      </g>
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        style={{ fontSize: '8px', fontFamily: 'var(--font-mono)' }}
      >
        {props.label}
      </text>
    </svg>
  );
}

function ModelContextUsageIndicator(props: {
  usage: ModelUsageEntry[];
  codexModels?: CodexModelOption[];
}): React.ReactElement | null {
  if (props.usage.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {props.usage.map((entry) => {
        const limit = getContextLimit(entry.model, props.codexModels);
        const pct = Math.min(100, Math.round((entry.inputTokens / limit) * 100));
        const tone = getContextTone(pct);
        const tooltip = `${entry.inputTokens.toLocaleString()} / ${limit.toLocaleString()} Tokens`;

        return (
          <div
            key={entry.model}
            title={tooltip}
            style={{ cursor: 'default' }}
          >
            <ContextRing pct={pct} tone={tone} label={String(pct)} />
          </div>
        );
      })}
    </div>
  );
}

export function ChatControlsBar(props: {
  overrides: ChatOverrides;
  onChange: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  threadModelUsage?: ModelUsageEntry[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  providers?: ModelProvider[];
  codexModels?: CodexModelOption[];
}): React.ReactElement {
  const activeProvider = resolveChatControlProvider(
    props.overrides.model,
    props.defaultProvider ?? 'claude-code',
    props.codexModels,
  );
  const activeModel = resolveActiveModel({
    activeProvider,
    selectedModel: props.overrides.model,
    settingsModel: props.settingsModel,
    codexSettingsModel: props.codexSettingsModel,
  });
  const displayUsage = buildDisplayUsage({
    activeModel,
    threadModelUsage: props.threadModelUsage,
    streamingTokenUsage: props.streamingTokenUsage,
  });
  const effortOptions = getEffortOptions(activeProvider);
  const effortValue = effortOptions.some((option) => option.value === props.overrides.effort)
    ? props.overrides.effort
    : 'medium';
  const { defaultOption, groups } = buildModelOptions(
    props.defaultProvider ?? 'claude-code',
    props.settingsModel ?? '',
    props.codexSettingsModel ?? '',
    props.codexModels,
    props.providers,
  );

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1" data-layout="chat-controls-bar">
      <ModelSelect
        value={props.overrides.model}
        defaultOption={defaultOption}
        groups={groups}
        onChange={(model) => props.onChange({ ...props.overrides, model })}
      />
      <ControlSelect
        label="Effort"
        value={effortValue}
        options={effortOptions}
        onChange={(effort) => props.onChange({ ...props.overrides, effort })}
      />
      <PermissionModeIndicator
        provider={activeProvider}
        value={props.overrides.permissionMode}
        onChange={(permissionMode) => props.onChange({ ...props.overrides, permissionMode })}
      />
      {displayUsage.length > 0 && (
        <>
          <div className="mx-0.5 h-3 w-px bg-border-semantic" />
          <ModelContextUsageIndicator usage={displayUsage} codexModels={props.codexModels} />
        </>
      )}
    </div>
  );
}
