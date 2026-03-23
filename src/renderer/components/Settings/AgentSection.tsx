/**
 * AgentSection.tsx — Settings controls for agent chat and context layer configuration.
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
} from './claudeSectionContentStyles';
import { SelectSection, ToggleSection } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';

interface AgentSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

type AgentChatSettings = NonNullable<AppConfig['agentChatSettings']>;
type ContextLayerSettings = NonNullable<AppConfig['contextLayer']>;

function AgentChatSettingsGroup({
  settings,
  updateSetting,
}: {
  settings: AgentChatSettings;
  updateSetting: <K extends keyof AgentChatSettings>(field: K, value: AgentChatSettings[K]) => void;
}): React.ReactElement {
  return (
    <>
      <div>
        <SectionLabel>Agent Chat</SectionLabel>
        <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
          Configure agent chat behavior, providers, and verification.
        </p>
      </div>
      <SelectSection description="Choose the default provider for agent chat requests." label="Default provider" title="Default Provider" value={settings.defaultProvider ?? 'claude-code'} onChange={(value) => updateSetting('defaultProvider', value)}>
        <option value="claude-code">Claude Code CLI</option>
        <option value="anthropic-api">Anthropic API (direct)</option>
        <option value="codex">Codex</option>
      </SelectSection>
      <SelectSection description="Controls how thoroughly the agent verifies its changes." label="Verification profile" title="Verification Profile" value={settings.defaultVerificationProfile ?? 'default'} onChange={(value) => updateSetting('defaultVerificationProfile', value)}>
        <option value="fast">fast</option>
        <option value="default">default</option>
        <option value="full">full</option>
      </SelectSection>
      <SelectSection description="Whether the agent gathers context automatically or waits for manual selection." label="Context behavior" title="Context Behavior" value={settings.contextBehavior ?? 'auto'} onChange={(value) => updateSetting('contextBehavior', value)}>
        <option value="auto">Automatic</option>
        <option value="manual">Manual</option>
      </SelectSection>
      <SelectSection description="Initial view when opening the agent panel." label="Default view" title="Default View" value={settings.defaultView ?? 'chat'} onChange={(value) => updateSetting('defaultView', value)}>
        <option value="chat">Chat</option>
        <option value="monitor">Monitor</option>
      </SelectSection>
      <ToggleSection checked={settings.showAdvancedControls ?? false} description="Reveal provider and verification overrides in the chat composer without an extra click." label="Show advanced controls" title="Show Advanced Controls" onChange={(value) => updateSetting('showAdvancedControls', value)} />
      <ToggleSection checked={settings.openDetailsOnFailure ?? false} description="Automatically open linked task details when an agent request fails or needs review." label="Open details on failure" title="Open Details on Failure" onChange={(value) => updateSetting('openDetailsOnFailure', value)} />
    </>
  );
}

function ContextLayerSettingsGroup({
  settings,
  updateSetting,
}: {
  settings: ContextLayerSettings;
  updateSetting: <K extends keyof ContextLayerSettings>(field: K, value: ContextLayerSettings[K]) => void;
}): React.ReactElement {
  return (
    <>
      <SectionLabel style={{ marginTop: '8px' }}>Context Layer</SectionLabel>
      <ToggleSection checked={settings.enabled ?? false} description="Generate and maintain a structural map of detected modules, injected into agent context automatically." label="Enable context layer" title="Enable Context Layer" onChange={(value) => updateSetting('enabled', value)} />
      <ToggleSection checked={settings.autoSummarize ?? false} description="Use the Anthropic API (Haiku) to generate natural-language descriptions of each module." label="Auto-summarize modules" title="Auto-summarize Modules" onChange={(value) => updateSetting('autoSummarize', value)} />
    </>
  );
}

export function AgentSection({
  draft,
  onChange,
}: AgentSectionProps): React.ReactElement {
  const agentChatSettings = draft.agentChatSettings ?? {};
  const contextLayerSettings = draft.contextLayer ?? {};
  const updateAgentChat = <K extends keyof AgentChatSettings>(field: K, value: AgentChatSettings[K]) => {
    onChange('agentChatSettings', { ...agentChatSettings, [field]: value });
  };
  const updateContextLayer = <K extends keyof ContextLayerSettings>(field: K, value: ContextLayerSettings[K]) => {
    onChange('contextLayer', { ...contextLayerSettings, [field]: value });
  };

  return (
    <div style={claudeSectionRootStyle}>
      <AgentChatSettingsGroup settings={agentChatSettings} updateSetting={updateAgentChat} />
      <ContextLayerSettingsGroup settings={contextLayerSettings} updateSetting={updateContextLayer} />
    </div>
  );
}
