/**
 * AgentSection.tsx — Settings controls for agent chat and context layer configuration.
 */

import type { CSSProperties } from 'react';
import React from 'react';

import type { AppConfig } from '../../types/electron';
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

const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
  enabled: true,
  layer1Enabled: true,
  layer2Enabled: true,
  layer3Enabled: true,
  layer2ConfidenceThreshold: 0.6,
  paranoidMode: false,
  llmJudgeSampleRate: 0,
};

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
      <SelectSection description="Choose the default provider for agent chat requests." label="Default provider" title="Default Provider" value={settings.defaultProvider ?? 'claude-code'} onChange={(value) => updateSetting('defaultProvider', value as AgentChatSettings['defaultProvider'])}>
        <option value="claude-code">Claude Code CLI</option>
        <option value="anthropic-api">Anthropic API (direct)</option>
        <option value="codex">Codex</option>
      </SelectSection>
      <SelectSection description="Controls how thoroughly the agent verifies its changes." label="Verification profile" title="Verification Profile" value={settings.defaultVerificationProfile ?? 'default'} onChange={(value) => updateSetting('defaultVerificationProfile', value as AgentChatSettings['defaultVerificationProfile'])}>
        <option value="fast">fast</option>
        <option value="default">default</option>
        <option value="full">full</option>
      </SelectSection>
      <SelectSection description="Whether the agent gathers context automatically or waits for manual selection." label="Context behavior" title="Context Behavior" value={settings.contextBehavior ?? 'auto'} onChange={(value) => updateSetting('contextBehavior', value as AgentChatSettings['contextBehavior'])}>
        <option value="auto">Automatic</option>
        <option value="manual">Manual</option>
      </SelectSection>
      <SelectSection description="Initial view when opening the agent panel." label="Default view" title="Default View" value={settings.defaultView ?? 'chat'} onChange={(value) => updateSetting('defaultView', value as AgentChatSettings['defaultView'])}>
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

type RouterUpdateFn = <K extends keyof RouterSettings>(field: K, value: RouterSettings[K]) => void;

function RouterThresholdSection({
  settings,
  updateSetting,
}: {
  settings: RouterSettings;
  updateSetting: RouterUpdateFn;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Router Classifier Threshold</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Minimum classifier confidence required before accepting a layer-2 routing result. Range:
        0.0 to 1.0.
      </p>
      <input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={settings.layer2ConfidenceThreshold}
        onChange={(event) => updateRouterThreshold(event.target.value, updateSetting)}
        aria-label="Router classifier confidence threshold"
        className="text-text-semantic-primary"
        style={claudeSectionBudgetInputStyle}
      />
    </section>
  );
}

function LlmJudgeSampleRateSection({
  settings,
  updateSetting,
}: {
  settings: RouterSettings;
  updateSetting: RouterUpdateFn;
}): React.ReactElement {
  const rate = settings.llmJudgeSampleRate ?? 0;
  const label = rate === 0 ? 'Disabled' : `${Math.round(rate * 100)}%`;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const parsed = Number.parseFloat(event.target.value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    updateSetting('llmJudgeSampleRate', Math.min(1, Math.max(0, parsed)));
  }

  return (
    <section>
      <SectionLabel>LLM Judge Sample Rate</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Fraction of agent responses sampled by the LLM judge for quality evaluation. 0 = disabled.
        Currently:{' '}
        <span className="text-text-semantic-primary">{label}</span>
      </p>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={rate}
        onChange={handleChange}
        aria-label="LLM judge sample rate"
        style={sliderStyle}
      />
    </section>
  );
}

function RouterToggles({
  settings,
  updateSetting,
}: {
  settings: RouterSettings;
  updateSetting: RouterUpdateFn;
}): React.ReactElement {
  return (
    <>
      <ToggleSection checked={settings.layer2Enabled} description="Use the statistical classifier when the rule engine does not produce a routing decision." label="Enable router classifier" title="Router Classifier" onChange={(value) => updateSetting('layer2Enabled', value)} />
      <RouterThresholdSection settings={settings} updateSetting={updateSetting} />
      <ToggleSection checked={settings.layer3Enabled} description="Reserved for the future async fallback layer. The current synchronous router path does not use this yet." label="Enable layer 3 fallback" title="Router Layer 3" onChange={(value) => updateSetting('layer3Enabled', value)} />
      <ToggleSection checked={settings.paranoidMode} description="Force Opus for all Agent Chat requests regardless of prompt classification." label="Enable paranoid mode" title="Router Paranoid Mode" onChange={(value) => updateSetting('paranoidMode', value)} />
      <LlmJudgeSampleRateSection settings={settings} updateSetting={updateSetting} />
    </>
  );
}

function RouterSettingsGroup({
  settings,
  updateSetting,
}: {
  settings: RouterSettings;
  updateSetting: RouterUpdateFn;
}): React.ReactElement {
  return (
    <>
      <SectionLabel style={{ marginTop: '8px' }}>Model Router</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Agent Chat can automatically choose between Haiku, Sonnet, and Opus when the model picker
        is set to Auto.
      </p>
      <ToggleSection checked={settings.enabled} description="Enable automatic model routing for Agent Chat requests that do not explicitly choose a model." label="Enable model router" title="Automatic Model Routing" onChange={(value) => updateSetting('enabled', value)} />
      <ToggleSection checked={settings.layer1Enabled} description="Use deterministic rules and slash-command mappings as the first routing layer." label="Enable router rule engine" title="Router Rule Engine" onChange={(value) => updateSetting('layer1Enabled', value)} />
      <RouterToggles settings={settings} updateSetting={updateSetting} />
    </>
  );
}

export function AgentSection({
  draft,
  onChange,
}: AgentSectionProps): React.ReactElement {
  const agentChatSettings = draft.agentChatSettings ?? {};
  const contextLayerSettings = draft.contextLayer ?? {};
  const routerSettings = { ...DEFAULT_ROUTER_SETTINGS, ...(draft.routerSettings ?? {}) };
  const updateAgentChat = <K extends keyof AgentChatSettings>(field: K, value: AgentChatSettings[K]) => {
    onChange('agentChatSettings', { ...agentChatSettings, [field]: value });
  };
  const updateContextLayer = <K extends keyof ContextLayerSettings>(field: K, value: ContextLayerSettings[K]) => {
    onChange('contextLayer', { ...contextLayerSettings, [field]: value });
  };
  const updateRouterSettings = <K extends keyof RouterSettings>(field: K, value: RouterSettings[K]) => {
    onChange('routerSettings', { ...routerSettings, [field]: value });
  };

  return (
    <div style={claudeSectionRootStyle}>
      <AgentChatSettingsGroup settings={agentChatSettings} updateSetting={updateAgentChat} />
      <RouterSettingsGroup settings={routerSettings} updateSetting={updateRouterSettings} />
      <ContextLayerSettingsGroup settings={contextLayerSettings} updateSetting={updateContextLayer} />
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
    onChange('backgroundJobsMaxConcurrent', Math.min(BACKGROUND_JOBS_MAX, Math.max(BACKGROUND_JOBS_MIN, parsed)));
  }

  return (
    <section>
      <SectionLabel>Background Jobs Concurrency</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Maximum number of background agent jobs that can run in parallel (1–8).
      </p>
      <div style={concurrencyRowStyle}>
        <input
          type="number"
          min={BACKGROUND_JOBS_MIN}
          max={BACKGROUND_JOBS_MAX}
          step={1}
          value={draft.backgroundJobsMaxConcurrent ?? 2}
          onChange={handleChange}
          aria-label="Background jobs max concurrency"
          className="text-text-semantic-primary"
          style={claudeSectionBudgetInputStyle}
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
      <ToggleSection
        checked={draft.streamingInlineEdit ?? false}
        description="Stream token-by-token diffs during Ctrl+K inline edits instead of displaying results when complete."
        label="Streaming inline edit"
        title="Streaming Inline Edit"
        onChange={(value) => onChange('streamingInlineEdit', value)}
      />
      <BackgroundJobsSection draft={draft} onChange={onChange} />
    </>
  );
}

function updateRouterThreshold(
  rawValue: string,
  updateSetting: <K extends keyof RouterSettings>(field: K, value: RouterSettings[K]) => void,
): void {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return;
  }
  const clamped = Math.min(1, Math.max(0, parsed));
  updateSetting('layer2ConfidenceThreshold', clamped);
}

const sliderStyle: CSSProperties = {
  width: '100%',
  accentColor: 'var(--interactive-accent)',
};

const concurrencyRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const restartHintStyle: CSSProperties = {
  fontSize: '11px',
};
