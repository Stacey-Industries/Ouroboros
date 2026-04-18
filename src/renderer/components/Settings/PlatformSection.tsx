/**
 * PlatformSection.tsx — Wave 38 Phase F: auto-update channel + crash reporter settings.
 *
 * Inline-style convention used throughout this directory (no Tailwind).
 */

import React from 'react';

import type { AppConfig, PlatformConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function getPlatform(draft: AppConfig): PlatformConfig {
  return draft.platform ?? {};
}

function patchPlatform(
  draft: AppConfig,
  patch: Partial<PlatformConfig>,
): PlatformConfig {
  return { ...getPlatform(draft), ...patch };
}

// ---------------------------------------------------------------------------
// Update channel subsection
// ---------------------------------------------------------------------------

function UpdateChannelSubsection({ draft, onChange }: Props): React.ReactElement {
  const platform = getPlatform(draft);
  const channel = platform.updateChannel ?? 'stable';

  function handleChannelChange(value: 'stable' | 'beta'): void {
    onChange('platform', patchPlatform(draft, { updateChannel: value }));
  }

  return (
    <section style={sectionStyle}>
      <SectionLabel>Update channel</SectionLabel>
      <p style={descStyle}>
        Stable receives production releases. Beta receives pre-release builds which may be
        less polished.
      </p>
      <div style={radioGroupStyle} role="radiogroup" aria-label="Update channel">
        <ChannelRadio
          id="channel-stable"
          value="stable"
          label="Stable"
          checked={channel === 'stable'}
          onChange={handleChannelChange}
        />
        <ChannelRadio
          id="channel-beta"
          value="beta"
          label="Beta"
          checked={channel === 'beta'}
          onChange={handleChannelChange}
        />
      </div>
    </section>
  );
}

interface ChannelRadioProps {
  id: string;
  value: 'stable' | 'beta';
  label: string;
  checked: boolean;
  onChange: (value: 'stable' | 'beta') => void;
}

function ChannelRadio({ id, value, label, checked, onChange }: ChannelRadioProps): React.ReactElement {
  return (
    <label htmlFor={id} style={radioLabelStyle}>
      <input
        type="radio"
        id={id}
        name="update-channel"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        style={radioInputStyle}
      />
      <span style={radioTextStyle}>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Crash reporter subsection
// ---------------------------------------------------------------------------

interface WebhookInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function WebhookInput({ value, onChange }: WebhookInputProps): React.ReactElement {
  return (
    <div style={webhookContainerStyle}>
      <label htmlFor="crash-webhook-url" style={webhookLabelStyle}>Webhook URL</label>
      <input
        id="crash-webhook-url"
        type="url"
        value={value}
        onChange={onChange}
        placeholder="https://hooks.example.com/crash"
        style={webhookInputStyle}
      />
    </div>
  );
}

function CrashReporterSubsection({ draft, onChange }: Props): React.ReactElement {
  const platform = getPlatform(draft);
  const crashCfg = platform.crashReports ?? {};
  const enabled = crashCfg.enabled ?? false;
  const webhookUrl = crashCfg.webhookUrl ?? '';

  function handleToggle(val: boolean): void {
    onChange('platform', patchPlatform(draft, { crashReports: { ...crashCfg, enabled: val } }));
  }

  function handleWebhookChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onChange('platform', patchPlatform(draft, { crashReports: { ...crashCfg, webhookUrl: e.target.value } }));
  }

  return (
    <section style={sectionStyle}>
      <SectionLabel>Crash reports</SectionLabel>
      <ToggleSwitch
        checked={enabled}
        onChange={handleToggle}
        label="Upload crash reports when they occur"
        description="Send anonymous crash reports to a webhook you control."
      />
      {enabled && <WebhookInput value={webhookUrl} onChange={handleWebhookChange} />}
      <button type="button" onClick={() => void window.electronAPI.crash.openCrashReportsDir()} style={folderButtonStyle}>
        Show crash reports folder
      </button>
      <p style={warningStyle}>
        Crash reports include stack traces with paths redacted. Chat content and config values are never included.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Composed section
// ---------------------------------------------------------------------------

export function PlatformSection({ draft, onChange }: Props): React.ReactElement {
  return (
    <div style={rootStyle}>
      <UpdateChannelSubsection draft={draft} onChange={onChange} />
      <CrashReporterSubsection draft={draft} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const rootStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '28px' };
const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '10px' };
const descStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: 0 };
const radioGroupStyle: React.CSSProperties = { display: 'flex', gap: '20px', paddingTop: '4px' };
const radioLabelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' };
const radioInputStyle: React.CSSProperties = { accentColor: 'var(--interactive-accent)', cursor: 'pointer' };
const radioTextStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-primary)' };
const webhookContainerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
const webhookLabelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)' };

const webhookInputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  width: '100%',
  boxSizing: 'border-box',
};

const folderButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '5px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  margin: 0,
  fontStyle: 'italic',
};
