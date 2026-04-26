/**
 * AgentSection.tsx — Settings controls for agent chat and context layer configuration.
 */

import type { CSSProperties } from 'react';
import React from 'react';

import type { AppConfig } from '../../types/electron';
import type { ContextSettings } from './AgentContextPacketSection';
import { AgentContextPacketSection } from './AgentContextPacketSection';
import { DEFAULT_ROUTER_SETTINGS, RouterSettingsGroup } from './AgentSectionRouter';
import {
  claudeSectionBudgetInputStyle,
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
  claudeSectionSectionDescriptionStyle,
} from './claudeSectionContentStyles';
import { SelectSection, ToggleSection } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';

const BACKGROUND_JOBS_MIN = 1;
const BACKGROUND_JOBS_MAX = 8;

interface AgentSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

type AgentChatSettings = NonNullable<AppConfig['agentChatSettings']>;
type ContextLayerSettings = NonNullable<AppConfig['contextLayer']>;
type RouterSettings = NonNullable<AppConfig['routerSettings']>;

type AgentChatUpdateFn = <K extends keyof AgentChatSettings>(
  field: K,
  value: AgentChatSettings[K],
) => void;

function AgentChatProviderSelects({
  settings,
  updateSetting,
}: {
  settings: AgentChatSettings;
  updateSetting: AgentChatUpdateFn;
}): React.ReactElement {
  return (
    <>
      <SelectSection
        description="Choose the default provider for agent chat requests."
        label="Default provider"
        title="Default Provider"
        value={settings.defaultProvider ?? 'claude-code'}
        onChange={(value) =>
          updateSetting('defaultProvider', value as AgentChatSettings['defaultProvider'])
        }
      >
        <option value="claude-code">Claude Code CLI</option>
        <option value="anthropic-api">Anthropic API (direct)</option>
        <option value="codex">Codex</option>
      </SelectSection>
      <SelectSection
        description="Controls how thoroughly the agent verifies its changes."
        label="Verification profile"
        title="Verification Profile"
        value={settings.defaultVerificationProfile ?? 'default'}
        onChange={(value) => updateSetting('defaultVerificationProfile', value as AgentChatSettings['defaultVerificationProfile'])}
      >
        <option value="fast">fast</option>
        <option value="default">default</option>
        <option value="full">full</option>
      </SelectSection>
    </>
  );
}

function AgentChatViewSelects({
  settings,
  updateSetting,
}: {
  settings: AgentChatSettings;
  updateSetting: AgentChatUpdateFn;
}): React.ReactElement {
  return (
    <>
      <SelectSection
        description="Whether the agent gathers context automatically or waits for manual selection."
        label="Context behavior"
        title="Context Behavior"
        value={settings.contextBehavior ?? 'auto'}
        onChange={(value) =>
          updateSetting('contextBehavior', value as AgentChatSettings['contextBehavior'])
        }
      >
        <option value="auto">Automatic</option>
        <option value="manual">Manual</option>
      </SelectSection>
      <SelectSection
        description="Initial view when opening the agent panel."
        label="Default view"
        title="Default View"
        value={settings.defaultView ?? 'chat'}
        onChange={(value) =>
          updateSetting('defaultView', value as AgentChatSettings['defaultView'])
        }
      >
        <option value="chat">Chat</option>
        <option value="monitor">Monitor</option>
      </SelectSection>
    </>
  );
}

function AgentChatTogglesGroup({
  settings,
  updateSetting,
}: {
  settings: AgentChatSettings;
  updateSetting: AgentChatUpdateFn;
}): React.ReactElement {
  return (
    <>
      <ToggleSection
        checked={settings.showAdvancedControls ?? false}
        description="Reveal provider and verification overrides in the chat composer without an extra click."
        label="Show advanced controls"
        title="Show Advanced Controls"
        onChange={(value) => updateSetting('showAdvancedControls', value)}
      />
      <ToggleSection
        checked={settings.openDetailsOnFailure ?? false}
        description="Automatically open linked task details when an agent request fails or needs review."
        label="Open details on failure"
        title="Open Details on Failure"
        onChange={(value) => updateSetting('openDetailsOnFailure', value)}
      />
    </>
  );
}

function AgentChatSettingsGroup({
  settings,
  updateSetting,
}: {
  settings: AgentChatSettings;
  updateSetting: AgentChatUpdateFn;
}): React.ReactElement {
  return (
    <>
      <div>
        <SectionLabel>Agent Chat</SectionLabel>
        <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
          Configure agent chat behavior, providers, and verification.
        </p>
      </div>
      <AgentChatProviderSelects settings={settings} updateSetting={updateSetting} />
      <AgentChatViewSelects settings={settings} updateSetting={updateSetting} />
      <AgentChatTogglesGroup settings={settings} updateSetting={updateSetting} />
    </>
  );
}

function ContextLayerSettingsGroup({
  settings,
  updateSetting,
}: {
  settings: ContextLayerSettings;
  updateSetting: <K extends keyof ContextLayerSettings>(
    field: K,
    value: ContextLayerSettings[K],
  ) => void;
}): React.ReactElement {
  return (
    <>
      <SectionLabel style={{ marginTop: '8px' }}>Context Layer</SectionLabel>
      <ToggleSection
        checked={settings.enabled ?? false}
        description="Generate and maintain a structural map of detected modules, injected into agent context automatically."
        label="Enable context layer"
        title="Enable Context Layer"
        onChange={(value) => updateSetting('enabled', value)}
      />
      <ToggleSection
        checked={settings.autoSummarize ?? false}
        description="Use the Anthropic API (Haiku) to generate natural-language descriptions of each module."
        label="Auto-summarize modules"
        title="Auto-summarize Modules"
        onChange={(value) => updateSetting('autoSummarize', value)}
      />
    </>
  );
}

export function AgentSection({ draft, onChange }: AgentSectionProps): React.ReactElement {
  const agentChatSettings = draft.agentChatSettings ?? {};
  const contextLayerSettings = draft.contextLayer ?? {};
  const contextSettings = draft.context ?? {};
  const routerSettings = { ...DEFAULT_ROUTER_SETTINGS, ...(draft.routerSettings ?? {}) };

  const updateAgentChat = <K extends keyof AgentChatSettings>(
    field: K,
    value: AgentChatSettings[K],
  ) => {
    onChange('agentChatSettings', { ...agentChatSettings, [field]: value });
  };

  const updateContextLayer = <K extends keyof ContextLayerSettings>(
    field: K,
    value: ContextLayerSettings[K],
  ) => {
    onChange('contextLayer', { ...contextLayerSettings, [field]: value });
  };

  const updateRouterSettings = <K extends keyof RouterSettings>(
    field: K,
    value: RouterSettings[K],
  ) => {
    onChange('routerSettings', { ...routerSettings, [field]: value });
  };

  const updateContext = <K extends keyof ContextSettings>(field: K, value: ContextSettings[K]) => {
    onChange('context', { ...contextSettings, [field]: value });
  };

  return (
    <div style={claudeSectionRootStyle}>
      <AgentChatSettingsGroup settings={agentChatSettings} updateSetting={updateAgentChat} />
      <RouterSettingsGroup settings={routerSettings} updateSetting={updateRouterSettings} />
      <ContextLayerSettingsGroup
        settings={contextLayerSettings}
        updateSetting={updateContextLayer}
      />
      <AgentContextPacketSection contextSettings={contextSettings} updateContext={updateContext} />
      <AgentFeaturesGroup draft={draft} onChange={onChange} />
    </div>
  );
}

function BackgroundJobsSection({ draft, onChange }: AgentSectionProps): React.ReactElement {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange(
      'backgroundJobsMaxConcurrent',
      Math.min(BACKGROUND_JOBS_MAX, Math.max(BACKGROUND_JOBS_MIN, parsed)),
    );
  }

  return (
    <section>
      <SectionLabel>Background Jobs Concurrency</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Maximum number of background agent jobs that can run in parallel (1–8).
      </p>
      <div style={concurrencyRowStyle}>
        <input
          aria-label="Background jobs max concurrency"
          className="text-text-semantic-primary"
          max={BACKGROUND_JOBS_MAX}
          min={BACKGROUND_JOBS_MIN}
          step={1}
          style={claudeSectionBudgetInputStyle}
          type="number"
          value={draft.backgroundJobsMaxConcurrent ?? 2}
          onChange={handleChange}
        />
        <span className="text-text-semantic-faint" style={restartHintStyle}>
          Applies on next restart
        </span>
      </div>
    </section>
  );
}

function AgentFeaturesGroup({ draft, onChange }: AgentSectionProps): React.ReactElement {
  return (
    <>
      <SectionLabel style={{ marginTop: '8px' }}>Inline Edit &amp; Jobs</SectionLabel>
      <BackgroundJobsSection draft={draft} onChange={onChange} />
    </>
  );
}

const concurrencyRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const restartHintStyle: CSSProperties = {
  fontSize: '11px',
};
