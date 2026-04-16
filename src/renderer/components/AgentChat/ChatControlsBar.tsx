import React, { useMemo } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import type { CodexModelOption, ModelProvider } from '../../types/electron';
import { getModelProviderLogo } from '../shared/ProviderLogos';
import { ModelContextUsageIndicator } from './ChatControlsBar.rings';
import {
  buildDisplayUsage,
  buildModelOptions,
  type ChatControlProvider,
  getEffortOptions,
  getPermissionModes,
  getSelectedModelLabel,
  getSelectedOptionLabel,
  isAnthropicAutoModel,
  type ModelUsageEntry,
  type OptionGroup,
  type OptionItem,
  resolveActiveModel,
} from './ChatControlsBarSupport';
import { useDensity } from './DensityContext';
import { RulesActivityBadge } from './RulesActivityBadge';
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
  if (isAnthropicAutoModel(model)) return 'claude-code';
  if (model && (codexModels ?? []).some((entry) => entry.id === model)) return 'codex';
  if (model) return 'claude-code';
  return defaultProvider;
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
      className="flex items-center gap-1 text-[11px] text-text-semantic-muted transition-colors duration-150 hover:bg-surface-hover"
      style={{ ...pillStyle, fontFamily: 'var(--font-ui)' }}
      title="Permission mode (Shift+Tab to cycle)"
    >
      <span className="text-text-semantic-primary">{current.label}</span>
    </button>
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
  isStreaming?: boolean;
  providers?: ModelProvider[];
  codexModels?: CodexModelOption[];
  routedBy?: string;
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
  const effortOptions = getEffortOptions(activeProvider, activeModel);
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

function useActiveSessionRules() {
  const { agents } = useAgentEventsContext();
  return useMemo(() => {
    const running = agents.filter((s) => s.status === 'running');
    const target =
      running.length > 0
        ? running.reduce((a, b) => (a.startedAt > b.startedAt ? a : b))
        : agents.reduce<(typeof agents)[number] | undefined>((a, b) => {
            if (!a) return b;
            return b.startedAt > a.startedAt ? b : a;
          }, undefined);
    return target?.loadedRules ?? [];
  }, [agents]);
}

function RoutedByBadge(props: { routedBy?: string }): React.ReactElement | null {
  if (!props.routedBy || props.routedBy === 'user') return null;
  return (
    <span
      className="text-[10px] italic text-text-semantic-muted"
      style={{ fontFamily: 'var(--font-ui)' }}
      title={`Model auto-selected by ${props.routedBy} layer`}
    >
      auto
    </span>
  );
}

function DensityToggle(): React.ReactElement {
  const { density, setDensity } = useDensity();
  const isCompact = density === 'compact';
  return (
    <button
      type="button"
      title={isCompact ? 'Switch to comfortable density' : 'Switch to compact density'}
      onClick={() => setDensity(isCompact ? 'comfortable' : 'compact')}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-text-semantic-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-semantic-primary"
      style={{ fontFamily: 'var(--font-ui)' }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        {isCompact ? (
          <>
            <line x1="1" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <line x1="1" y1="2.5" x2="11" y2="2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="1" y1="9.5" x2="11" y2="9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </>
        )}
      </svg>
      <span>{isCompact ? 'Compact' : 'Comfortable'}</span>
    </button>
  );
}

function ContextUsageSection(props: {
  usage: ModelUsageEntry[];
  codexModels?: CodexModelOption[];
  isStreaming?: boolean;
}): React.ReactElement | null {
  if (props.usage.length === 0) return null;
  return (
    <>
      <div className="mx-0.5 h-3 w-px bg-border-semantic" />
      <ModelContextUsageIndicator
        usage={props.usage}
        codexModels={props.codexModels}
        isStreaming={props.isStreaming}
      />
    </>
  );
}

export function ChatControlsBar(props: ChatControlsBarProps): React.ReactElement {
  const { activeProvider, displayUsage, effortOptions, effortValue, defaultOption, groups } =
    buildControlsBarState(props);
  const loadedRules = useActiveSessionRules();
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-1" data-layout="chat-controls-bar">
      <ModelSelect
        value={props.overrides.model}
        defaultOption={defaultOption!}
        groups={groups}
        onChange={(model) => props.onChange({ ...props.overrides, model })}
        codexModelIds={props.codexModels?.map((m) => m.id)}
      />
      <RoutedByBadge routedBy={props.routedBy} />
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
      <RulesActivityBadge rules={loadedRules} />
      <DensityToggle />
      <ContextUsageSection
        usage={displayUsage}
        codexModels={props.codexModels}
        isStreaming={props.isStreaming}
      />
    </div>
  );
}
