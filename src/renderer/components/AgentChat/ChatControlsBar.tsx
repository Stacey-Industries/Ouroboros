import React from 'react';

import type { CodexModelOption, ModelProvider } from '../../types/electron';

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
}): ModelUsageEntry[] {
  const usage = args.threadModelUsage ?? [];
  if (!args.activeModel) return usage;
  if (usage.some((entry) => entry.model === args.activeModel)) return usage;
  return [{ model: args.activeModel, inputTokens: 0, outputTokens: 0 }, ...usage];
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
  backgroundColor: 'var(--bg-tertiary)',
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
    <div className="flex items-center gap-1" style={pillStyle}>
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Model
      </span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="border-none bg-transparent px-0.5 py-0 text-[11px] text-[var(--text)] focus:outline-none cursor-pointer"
        style={{ fontFamily: 'var(--font-ui)', colorScheme: 'dark' }}
        title={getSelectedModelLabel(props.value, props.defaultOption, props.groups)}
      >
        <option value={props.defaultOption.value}>{props.defaultOption.label}</option>
        {props.groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function ControlSelect(props: {
  label: string;
  value: string;
  options: ReadonlyArray<OptionItem>;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1" style={pillStyle}>
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {props.label}
      </span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="border-none bg-transparent px-0.5 py-0 text-[11px] text-[var(--text)] focus:outline-none cursor-pointer"
        style={{ fontFamily: 'var(--font-ui)', colorScheme: 'dark' }}
        title={getSelectedOptionLabel(props.value, props.options)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
      className="flex items-center gap-1 text-[11px] transition-colors duration-150"
      style={{
        ...pillStyle,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-ui)',
      }}
      title="Permission mode (Shift+Tab to cycle)"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-hover, var(--border))';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
      }}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide">Mode</span>
      <span style={{ color: 'var(--text)' }}>{current.label}</span>
    </button>
  );
}

function ModelContextUsageIndicator(props: {
  usage: ModelUsageEntry[];
  codexModels?: CodexModelOption[];
}): React.ReactElement | null {
  if (props.usage.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-3 text-[11px]"
      style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
    >
      {props.usage.map((entry) => {
        const name = getDisplayModelName(entry.model);
        const limit = getContextLimit(entry.model, props.codexModels);
        const pct = Math.min(100, Math.round((entry.inputTokens / limit) * 100));
        const tone = getContextTone(pct);
        const title = `${name}: ${entry.inputTokens.toLocaleString()} / ${limit.toLocaleString()} context tokens (${pct}%) · ${entry.outputTokens.toLocaleString()} output tokens`;

        return (
          <div key={entry.model} className="flex items-center gap-1.5" title={title}>
            <span style={{ opacity: 0.6 }}>{name}</span>
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'var(--border)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: tone,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span style={{ color: 'var(--text)' }}>{formatTokenCount(entry.inputTokens)}</span>
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
          <div className="mx-0.5 h-3 w-px" style={{ backgroundColor: 'var(--border)' }} />
          <ModelContextUsageIndicator usage={displayUsage} codexModels={props.codexModels} />
        </>
      )}
    </div>
  );
}
