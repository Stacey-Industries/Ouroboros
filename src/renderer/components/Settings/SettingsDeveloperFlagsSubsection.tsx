/**
 * SettingsDeveloperFlagsSubsection.tsx — Collapsible developer feature-flag toggles.
 *
 * All flags require an app restart. Collapsed by default to avoid accidental changes.
 */

import React, { useState } from 'react';

import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function DevFlagToggles({ draft, onChange }: Props): React.ReactElement {
  return (
    <div style={toggleListStyle}>
      <ToggleSwitch
        checked={draft.usePtyHost ?? false}
        onChange={(v) => onChange('usePtyHost', v)}
        label="PTY host process"
        description="Route terminal PTY sessions through a dedicated utility process (PtyHost)."
      />
      <ToggleSwitch
        checked={draft.useExtensionHost ?? false}
        onChange={(v) => onChange('useExtensionHost', v)}
        label="Extension host process"
        description="Load VS Code extensions in an isolated ExtensionHost utility process."
      />
      <ToggleSwitch
        checked={draft.useMcpHost ?? false}
        onChange={(v) => onChange('useMcpHost', v)}
        label="MCP host process"
        description="Run the internal MCP server in a dedicated McpHost utility process."
      />
    </div>
  );
}

export function DeveloperFlagsSubsection({ draft, onChange }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        style={headerButtonStyle}
      >
        <SectionLabel style={{ margin: 0 }}>Developer Flags</SectionLabel>
        <span className="text-text-semantic-muted" style={chevronStyle}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={panelStyle}>
          <div style={bannerStyle} className="text-status-warning">
            Advanced — these flags require an app restart to take effect.
          </div>
          <DevFlagToggles draft={draft} onChange={onChange} />
        </div>
      )}
    </section>
  );
}

const headerButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

const chevronStyle: React.CSSProperties = {
  fontSize: '10px',
};

const panelStyle: React.CSSProperties = {
  marginTop: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const bannerStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--status-warning-subtle)',
};

const toggleListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};
