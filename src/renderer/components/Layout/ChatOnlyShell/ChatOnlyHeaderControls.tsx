/**
 * ChatOnlyHeaderControls — Model + permission-mode chips in the chat-only title bar.
 *
 * Wave 43 Phase C: Moves model selector and permission-mode toggle from the
 * ComposerFooter into the title bar when chat-only mode is active.
 *
 * Variant rule: new variant-specific behaviour MUST motivate its own prop or
 * context — do not extend this component for unrelated variants.
 *
 * Responsive: collapses to icon-only at narrow widths via Tailwind breakpoints.
 *   - <640px (sm): permission chip hidden
 *   - <768px (md): model chip hidden
 */

import React from 'react';

import { useAgentChatActions, useAgentChatModel } from '../../AgentChat/agentChatSelectors';
import {
  buildControlsBarState,
  cyclePermissionMode,
  resolveChatControlProvider,
} from '../../AgentChat/ChatControlsBar';
import { getPermissionModes } from '../../AgentChat/ChatControlsBarSupport';
import { SelectPill } from '../../AgentChat/SelectPill';
import { getModelProviderLogo } from '../../shared/ProviderLogos';

// ── Permission chip ───────────────────────────────────────────────────────────

interface PermissionChipProps {
  value: string;
  provider: ReturnType<typeof resolveChatControlProvider>;
  codexAppServerTransport?: boolean;
  onChange: (value: string) => void;
}

function PermissionChip({
  value,
  provider,
  codexAppServerTransport,
  onChange,
}: PermissionChipProps): React.ReactElement {
  const modes = getPermissionModes(provider, { codexAppServerTransport });
  const current = modes.find((m) => m.value === value) ?? modes[0];
  const label = current?.label ?? value;
  return (
    <button
      type="button"
      onClick={() => onChange(cyclePermissionMode(value, provider, { codexAppServerTransport }))}
      className="hidden sm:flex items-center px-1.5 py-0.5 text-[11px] rounded text-text-semantic-muted hover:bg-surface-hover transition-colors shrink-0"
      title="Permission mode (click to cycle)"
      aria-label={`Permission mode: ${label}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <span className="text-text-semantic-primary">{label}</span>
    </button>
  );
}

// ── Model chip ────────────────────────────────────────────────────────────────

interface ModelChipProps {
  model: string;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: ReturnType<typeof useAgentChatModel>['codexModels'];
  providers?: ReturnType<typeof useAgentChatModel>['modelProviders'];
  onChange: (model: string) => void;
}

function ModelChip({
  model,
  settingsModel,
  codexSettingsModel,
  defaultProvider,
  codexModels,
  providers,
  onChange,
}: ModelChipProps): React.ReactElement {
  const { defaultOption, groups } = buildControlsBarState({
    overrides: { model, effort: 'medium', permissionMode: 'default' },
    onChange: () => {},
    settingsModel,
    codexSettingsModel,
    defaultProvider,
    providers,
    codexModels,
  });
  return (
    <div
      className="hidden md:flex shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <SelectPill
        label="Model"
        value={model}
        defaultOption={defaultOption!}
        groups={groups}
        onChange={onChange}
        icon={getModelProviderLogo(
          model,
          codexModels?.map((entry) => entry.id),
        )}
      />
    </div>
  );
}

interface EffortChipProps {
  model: string;
  effort: string;
  settingsModel?: string;
  codexSettingsModel?: string;
  defaultProvider?: 'claude-code' | 'codex' | 'anthropic-api';
  codexModels?: ReturnType<typeof useAgentChatModel>['codexModels'];
  providers?: ReturnType<typeof useAgentChatModel>['modelProviders'];
  onChange: (effort: string) => void;
}

function EffortChip({
  model,
  effort,
  settingsModel,
  codexSettingsModel,
  defaultProvider,
  codexModels,
  providers,
  onChange,
}: EffortChipProps): React.ReactElement | null {
  const { effortOptions, effortValue } = buildControlsBarState({
    overrides: { model, effort, permissionMode: 'default' },
    onChange: () => {},
    settingsModel,
    codexSettingsModel,
    defaultProvider,
    providers,
    codexModels,
  });
  if (effortOptions.length === 0) return null;
  return (
    <div
      className="hidden sm:flex shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <SelectPill label="Effort" value={effortValue} options={effortOptions} onChange={onChange} />
    </div>
  );
}

// ── ChatOnlyHeaderControls ────────────────────────────────────────────────────

type HeaderModelState = ReturnType<typeof useAgentChatModel>;

function resolveHeaderControls(modelState: HeaderModelState) {
  const { chatOverrides, codexAppServerTransport, modelProviders, ...rest } = modelState;
  if (!chatOverrides) return null;
  const provider = resolveChatControlProvider(
    chatOverrides.model,
    rest.defaultProvider ?? 'claude-code',
    rest.codexModels,
  );
  return {
    chatOverrides,
    codexAppServerTransport,
    provider,
    common: { ...rest, providers: modelProviders },
  };
}

function HeaderControlChips({
  modelState,
  onChatOverridesChange,
}: {
  modelState: HeaderModelState;
  onChatOverridesChange: ReturnType<typeof useAgentChatActions>['onChatOverridesChange'];
}): React.ReactElement | null {
  const resolved = resolveHeaderControls(modelState);
  if (!resolved) return null;
  const { chatOverrides, common, codexAppServerTransport, provider } = resolved;
  return (
    <div className="flex items-center gap-1.5 shrink-0 min-w-0" data-testid="header-controls">
      <ModelChip
        model={chatOverrides.model}
        {...common}
        onChange={(model) => onChatOverridesChange({ ...chatOverrides, model })}
      />
      <EffortChip
        model={chatOverrides.model}
        effort={chatOverrides.effort}
        {...common}
        onChange={(effort) => onChatOverridesChange({ ...chatOverrides, effort })}
      />
      <PermissionChip
        value={chatOverrides.permissionMode}
        provider={provider}
        codexAppServerTransport={codexAppServerTransport}
        onChange={(permissionMode) => onChatOverridesChange({ ...chatOverrides, permissionMode })}
      />
    </div>
  );
}

export function ChatOnlyHeaderControls(): React.ReactElement | null {
  const modelState = useAgentChatModel();
  const { onChatOverridesChange } = useAgentChatActions();
  return (
    <HeaderControlChips modelState={modelState} onChatOverridesChange={onChatOverridesChange} />
  );
}
