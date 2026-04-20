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
  cyclePermissionMode,
  resolveChatControlProvider,
} from '../../AgentChat/ChatControlsBar';
import { buildModelOptions, getPermissionModes } from '../../AgentChat/ChatControlsBarSupport';
import { SelectPill } from '../../AgentChat/SelectPill';

// ── Permission chip ───────────────────────────────────────────────────────────

interface PermissionChipProps {
  value: string;
  provider: ReturnType<typeof resolveChatControlProvider>;
  onChange: (value: string) => void;
}

function PermissionChip({ value, provider, onChange }: PermissionChipProps): React.ReactElement {
  const modes = getPermissionModes(provider);
  const current = modes.find((m) => m.value === value) ?? modes[0];
  const label = current?.label ?? value;
  return (
    <button
      type="button"
      onClick={() => onChange(cyclePermissionMode(value, provider))}
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
  onChange: (model: string) => void;
}

function ModelChip({
  model,
  settingsModel,
  codexSettingsModel,
  defaultProvider,
  onChange,
}: ModelChipProps): React.ReactElement {
  const { defaultOption, groups } = buildModelOptions({
    defaultProvider: defaultProvider ?? 'claude-code',
    settingsModel: settingsModel ?? '',
    codexSettingsModel: codexSettingsModel ?? '',
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
      />
    </div>
  );
}

// ── ChatOnlyHeaderControls ────────────────────────────────────────────────────

export function ChatOnlyHeaderControls(): React.ReactElement | null {
  const { chatOverrides, settingsModel, codexSettingsModel, defaultProvider } = useAgentChatModel();
  const { onChatOverridesChange } = useAgentChatActions();

  if (!chatOverrides) return null;

  const provider = resolveChatControlProvider(
    chatOverrides.model,
    defaultProvider ?? 'claude-code',
  );

  return (
    <div className="flex items-center gap-1.5 shrink-0 min-w-0" data-testid="header-controls">
      <ModelChip
        model={chatOverrides.model}
        settingsModel={settingsModel}
        codexSettingsModel={codexSettingsModel}
        defaultProvider={defaultProvider}
        onChange={(model) => onChatOverridesChange({ ...chatOverrides, model })}
      />
      <PermissionChip
        value={chatOverrides.permissionMode}
        provider={provider}
        onChange={(permissionMode) => onChatOverridesChange({ ...chatOverrides, permissionMode })}
      />
    </div>
  );
}
