import React from 'react';

import type { CodexModelOption, ModelProvider } from '../../types/electron';
import { getModelProviderLogo } from '../shared/ProviderLogos';
import {
  buildDisplayUsage,
  buildModelOptions,
  type ChatControlProvider,
  getContextLimit,
  getContextTone,
  getEffortOptions,
  getPermissionModes,
  getSelectedModelLabel,
  getSelectedOptionLabel,
  type ModelUsageEntry,
  type OptionGroup,
  type OptionItem,
  resolveActiveModel,
} from './ChatControlsBarSupport';
import { SelectPill } from './SelectPill';

export type { ChatControlProvider };

export interface ChatOverrides {
  model: string;
  effort: string;
  permissionMode: string;
}

export function resolveChatControlProvider(
  model: string,
  defaultProvider: ChatControlProvider,
  codexModels?: CodexModelOption[],
): ChatControlProvider {
  return model && (codexModels ?? []).some((entry) => entry.id === model)
    ? 'codex'
    : defaultProvider;
}

export function cyclePermissionMode(current: string, provider: ChatControlProvider): string {
  const modes = getPermissionModes(provider);
  const idx = modes.findIndex((mode) => mode.value === current);
  return idx === -1 ? (modes[0]?.value ?? current) : modes[(idx + 1) % modes.length].value;
}

const pillStyle: React.CSSProperties = { borderRadius: '9999px', padding: '2px 8px' };

function ModelSelect(props: {
  value: string;
  defaultOption: OptionItem;
  groups: OptionGroup[];
  onChange: (value: string) => void;
  codexModelIds?: string[];
}): React.ReactElement {
  return (
    <SelectPill
      label="Model"
      value={props.value}
      defaultOption={props.defaultOption}
      groups={props.groups}
      onChange={props.onChange}
      title={getSelectedModelLabel(props.value, props.defaultOption, props.groups)}
      icon={getModelProviderLogo(props.value, props.codexModelIds)}
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

type ContextRingProps = {
  pct: number;
  tone: string;
  label: string;
  size?: number;
  stroke?: number;
};

type ArcProps = {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  tone: string;
  circumference: number;
  offset: number;
};

function ContextRingArcs(p: ArcProps): React.ReactElement {
  return (
    <g style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
      <circle
        cx={p.cx}
        cy={p.cy}
        r={p.r}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={p.stroke}
      />
      <circle
        cx={p.cx}
        cy={p.cy}
        r={p.r}
        fill="none"
        stroke={p.tone}
        strokeWidth={p.stroke}
        strokeDasharray={p.circumference}
        strokeDashoffset={p.offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </g>
  );
}

function ContextRing(props: ContextRingProps): React.ReactElement {
  const size = props.size ?? 26;
  const stroke = props.stroke ?? 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (props.pct / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ pointerEvents: 'none' }}>
      <ContextRingArcs
        cx={cx}
        cy={cy}
        r={radius}
        stroke={stroke}
        tone={props.tone}
        circumference={circumference}
        offset={offset}
      />
      <text
        x={cx}
        y={cy}
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
        return (
          <div
            key={entry.model}
            title={`${entry.inputTokens.toLocaleString()} / ${limit.toLocaleString()} Tokens`}
            style={{ cursor: 'default' }}
          >
            <ContextRing pct={pct} tone={getContextTone(pct)} label={String(pct)} />
          </div>
        );
      })}
    </div>
  );
}

interface ChatControlsBarProps {
  overrides: ChatOverrides;
  onChange: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  threadModelUsage?: ModelUsageEntry[];
  streamingTokenUsage?: { inputTokens: number; outputTokens: number };
  providers?: ModelProvider[];
  codexModels?: CodexModelOption[];
}

function buildControlsBarState(props: ChatControlsBarProps) {
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
  const effortValue = effortOptions.some((o) => o.value === props.overrides.effort)
    ? props.overrides.effort
    : 'medium';
  const modelOptions = buildModelOptions({
    defaultProvider: props.defaultProvider ?? 'claude-code',
    settingsModel: props.settingsModel ?? '',
    codexSettingsModel: props.codexSettingsModel ?? '',
    codexModels: props.codexModels,
    providers: props.providers,
  });
  return { activeProvider, displayUsage, effortOptions, effortValue, ...modelOptions };
}

export function ChatControlsBar(props: ChatControlsBarProps): React.ReactElement {
  const { activeProvider, displayUsage, effortOptions, effortValue, defaultOption, groups } =
    buildControlsBarState(props);
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1" data-layout="chat-controls-bar">
      <ModelSelect
        value={props.overrides.model}
        defaultOption={defaultOption}
        groups={groups}
        onChange={(model) => props.onChange({ ...props.overrides, model })}
        codexModelIds={props.codexModels?.map((m) => m.id)}
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
