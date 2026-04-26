/**
 * AgentSectionRouter.tsx — Router settings sub-components for AgentSection.
 *
 * Extracted to stay under ESLint 300-line file limit.
 */

import type { CSSProperties } from 'react';
import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  claudeSectionSectionDescriptionStyle,
} from './claudeSectionContentStyles';
import { ToggleSection } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';

type RouterSettings = NonNullable<AppConfig['routerSettings']>;
export type RouterUpdateFn = <K extends keyof RouterSettings>(
  field: K,
  value: RouterSettings[K],
) => void;

export const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
  enabled: true,
  layer1Enabled: true,
  layer2Enabled: true,
  layer3Enabled: true,
  layer2ConfidenceThreshold: 0.6,
  paranoidMode: false,
  llmJudgeSampleRate: 0,
};

export function updateRouterThreshold(
  rawValue: string,
  updateSetting: RouterUpdateFn,
): void {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return;
  }
  updateSetting('layer2ConfidenceThreshold', Math.min(1, Math.max(0, parsed)));
}

const sliderStyle: CSSProperties = {
  width: '100%',
  accentColor: 'var(--interactive-accent)',
};

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
        Minimum classifier confidence required before accepting a layer-2 routing result. Range: 0.0
        to 1.0.
      </p>
      <input
        aria-label="Router classifier confidence threshold"
        className="text-text-semantic-primary"
        max={1}
        min={0}
        step={0.05}
        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-semantic)', background: 'var(--surface-raised)', fontSize: '13px', width: '80px' }}
        type="number"
        value={settings.layer2ConfidenceThreshold}
        onChange={(event) => updateRouterThreshold(event.target.value, updateSetting)}
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
    if (!Number.isFinite(parsed)) return;
    updateSetting('llmJudgeSampleRate', Math.min(1, Math.max(0, parsed)));
  }

  return (
    <section>
      <SectionLabel>LLM Judge Sample Rate</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Fraction of agent responses sampled by the LLM judge for quality evaluation. 0 = disabled.
        Currently: <span className="text-text-semantic-primary">{label}</span>
      </p>
      <input
        aria-label="LLM judge sample rate"
        max={1}
        min={0}
        step={0.05}
        style={sliderStyle}
        type="range"
        value={rate}
        onChange={handleChange}
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
      <ToggleSection
        checked={settings.layer2Enabled}
        description="Use the statistical classifier when the rule engine does not produce a routing decision."
        label="Enable router classifier"
        title="Router Classifier"
        onChange={(value) => updateSetting('layer2Enabled', value)}
      />
      <RouterThresholdSection settings={settings} updateSetting={updateSetting} />
      <ToggleSection
        checked={settings.layer3Enabled}
        description="Reserved for the future async fallback layer. The current synchronous router path does not use this yet."
        label="Enable layer 3 fallback"
        title="Router Layer 3"
        onChange={(value) => updateSetting('layer3Enabled', value)}
      />
      <ToggleSection
        checked={settings.paranoidMode}
        description="Force Opus for all Agent Chat requests regardless of prompt classification."
        label="Enable paranoid mode"
        title="Router Paranoid Mode"
        onChange={(value) => updateSetting('paranoidMode', value)}
      />
      <LlmJudgeSampleRateSection settings={settings} updateSetting={updateSetting} />
    </>
  );
}

export function RouterSettingsGroup({
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
        Agent Chat can automatically choose between Haiku, Sonnet, and Opus when the model picker is
        set to Auto.
      </p>
      <ToggleSection
        checked={settings.enabled}
        description="Enable automatic model routing for Agent Chat requests that do not explicitly choose a model."
        label="Enable model router"
        title="Automatic Model Routing"
        onChange={(value) => updateSetting('enabled', value)}
      />
      <ToggleSection
        checked={settings.layer1Enabled}
        description="Use deterministic rules and slash-command mappings as the first routing layer."
        label="Enable router rule engine"
        title="Router Rule Engine"
        onChange={(value) => updateSetting('layer1Enabled', value)}
      />
      <RouterToggles settings={settings} updateSetting={updateSetting} />
    </>
  );
}
