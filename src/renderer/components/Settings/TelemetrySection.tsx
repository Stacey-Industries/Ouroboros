/**
 * TelemetrySection.tsx — Wave 53 Phase B: telemetry opt-out and remote-transmit
 * placeholder. Local recording defaults on; remote transmission is a future
 * feature that requires explicit opt-in (currently disabled).
 *
 * Inline-style convention used throughout this directory (no Tailwind).
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { ToggleSwitch } from './ToggleSwitch';

// Wave 53: telemetry slice is declared in main-process configTypes; the
// renderer's AppConfig is intentionally narrow. Read/write via a typed cast
// rather than extending the foundation type (which would push it past the
// 300-line ESLint cap).
interface TelemetryConfig {
  structured?: boolean;
  remote?: boolean;
  retentionDays?: number;
}

interface ConfigWithTelemetry {
  telemetry?: TelemetryConfig;
}

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function getTelemetry(draft: AppConfig): TelemetryConfig {
  return (draft as unknown as ConfigWithTelemetry).telemetry ?? {};
}

function patchTelemetry(draft: AppConfig, patch: Partial<TelemetryConfig>): TelemetryConfig {
  return { ...getTelemetry(draft), ...patch };
}

function StructuredToggle({ draft, onChange }: Props): React.ReactElement {
  const telemetry = getTelemetry(draft);
  // Wave 53 default flip: when key absent, treat as enabled.
  const enabled = telemetry.structured ?? true;

  function handleToggle(next: boolean): void {
    const cast = onChange as unknown as (key: 'telemetry', value: TelemetryConfig) => void;
    cast('telemetry', patchTelemetry(draft, { structured: next }));
  }

  return (
    <section style={sectionStyle}>
      <SectionLabel>Local telemetry</SectionLabel>
      <p style={descStyle}>
        Records tool calls, routing decisions, and quality signals locally to improve context
        selection and model routing. Data never leaves your machine.
      </p>
      <ToggleSwitch
        label="Enable local telemetry"
        description="Records to ~/.ouroboros/telemetry/. Toggle off to stop new events."
        checked={enabled}
        onChange={handleToggle}
      />
    </section>
  );
}

function RemoteToggle({ draft }: Props): React.ReactElement {
  // Reserved for a future wave. Always rendered disabled with a "coming soon"
  // hint so the contract is visible to users today.
  const telemetry = getTelemetry(draft);
  const enabled = telemetry.remote ?? false;

  return (
    <section style={sectionStyle}>
      <SectionLabel>Remote telemetry transmission</SectionLabel>
      <p style={descStyle}>
        Reserved for future opt-in remote transmission. Currently disabled — local-only recording is
        the only path.
      </p>
      <ToggleSwitch
        label="Transmit telemetry to remote (coming soon)"
        description="Disabled until a future opt-in wave."
        checked={enabled}
        onChange={() => {
          /* disabled toggle */
        }}
        disabled
      />
    </section>
  );
}

export function TelemetrySection({ draft, onChange }: Props): React.ReactElement {
  return (
    <div>
      <StructuredToggle draft={draft} onChange={onChange} />
      <RemoteToggle draft={draft} onChange={onChange} />
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const descStyle: React.CSSProperties = {
  margin: '4px 0 12px 0',
  fontSize: '12px',
  color: 'var(--text-muted)',
  maxWidth: '560px',
  lineHeight: 1.4,
};
