/**
 * AgentSection.tsx — Settings controls for agent chat and context layer configuration.
 */

import React from 'react';
import type { AppConfig } from '../../types/electron';
import { SelectSection, ToggleSection } from './ClaudeSectionControls';
import {
  claudeSectionRootStyle,
  claudeSectionHeaderTextStyle,
} from './claudeSectionContentStyles';
import { SectionLabel } from './settingsStyles';

interface AgentSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function AgentSection({
  draft,
  onChange,
}: AgentSectionProps): React.ReactElement {
  const updateAgentChat = (field: string, value: unknown) => {
    onChange('agentChatSettings', { ...draft.agentChatSettings, [field]: value });
  };

  const updateContextLayer = (field: string, value: unknown) => {
    onChange('contextLayer', { ...draft.contextLayer, [field]: value });
  };

  return (
    <div style={claudeSectionRootStyle}>
      <div>
        <SectionLabel>Agent Chat</SectionLabel>
        <p style={claudeSectionHeaderTextStyle}>
          Configure agent chat behavior, providers, and verification.
        </p>
      </div>

      <SelectSection
        description="Choose the default provider for agent chat requests."
        label="Default provider"
        title="Default Provider"
        value={draft.agentChatSettings?.defaultProvider ?? 'claude-code'}
        onChange={(value) => updateAgentChat('defaultProvider', value)}
      >
        <option value="claude-code">Claude Code CLI</option>
        <option value="anthropic-api">Anthropic API (direct)</option>
        <option value="codex">Codex</option>
      </SelectSection>

      <SelectSection
        description="Controls how thoroughly the agent verifies its changes."
        label="Verification profile"
        title="Verification Profile"
        value={draft.agentChatSettings?.defaultVerificationProfile ?? 'default'}
        onChange={(value) => updateAgentChat('defaultVerificationProfile', value)}
      >
        <option value="fast">fast</option>
        <option value="default">default</option>
        <option value="full">full</option>
      </SelectSection>

      <SelectSection
        description="Whether the agent gathers context automatically or waits for manual selection."
        label="Context behavior"
        title="Context Behavior"
        value={draft.agentChatSettings?.contextBehavior ?? 'auto'}
        onChange={(value) => updateAgentChat('contextBehavior', value)}
      >
        <option value="auto">Automatic</option>
        <option value="manual">Manual</option>
      </SelectSection>

      <SelectSection
        description="Initial view when opening the agent panel."
        label="Default view"
        title="Default View"
        value={draft.agentChatSettings?.defaultView ?? 'chat'}
        onChange={(value) => updateAgentChat('defaultView', value)}
      >
        <option value="chat">Chat</option>
        <option value="monitor">Monitor</option>
      </SelectSection>

      <ToggleSection
        checked={draft.agentChatSettings?.showAdvancedControls ?? false}
        description="Reveal provider and verification overrides in the chat composer without an extra click."
        label="Show advanced controls"
        title="Show Advanced Controls"
        onChange={(value) => updateAgentChat('showAdvancedControls', value)}
      />

      <ToggleSection
        checked={draft.agentChatSettings?.openDetailsOnFailure ?? false}
        description="Automatically open linked task details when an agent request fails or needs review."
        label="Open details on failure"
        title="Open Details on Failure"
        onChange={(value) => updateAgentChat('openDetailsOnFailure', value)}
      />

      <SectionLabel style={{ marginTop: '8px' }}>Context Layer</SectionLabel>

      <ToggleSection
        checked={draft.contextLayer?.enabled ?? false}
        description="Generate and maintain a structural map of detected modules, injected into agent context automatically."
        label="Enable context layer"
        title="Enable Context Layer"
        onChange={(value) => updateContextLayer('enabled', value)}
      />

      <ToggleSection
        checked={draft.contextLayer?.autoSummarize ?? false}
        description="Use the Anthropic API (Haiku) to generate natural-language descriptions of each module."
        label="Auto-summarize modules"
        title="Auto-summarize Modules"
        onChange={(value) => updateContextLayer('autoSummarize', value)}
      />
    </div>
  );
}
