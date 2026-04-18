/**
 * MobileAccessPane.tsx — Settings → Mobile Access orchestrator.
 *
 * Wave 33a Phase G. Composes the enable toggle, pairing section, devices
 * list, and diagnostics panel. Follows the Section.tsx thin-orchestrator
 * pattern used throughout this directory.
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
  claudeSectionToggleRowStyle,
} from './claudeSectionContentStyles';
import { MobileAccessDevicesSection } from './MobileAccessDevicesSection';
import { MobileAccessDiagnosticsSection } from './MobileAccessDiagnosticsSection';
import { MobileAccessPairingSection } from './MobileAccessPairingSection';
import { SectionLabel } from './settingsStyles';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MobileAccessPaneProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

// ── EnableToggle ──────────────────────────────────────────────────────────────

interface EnableToggleProps {
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

function EnableToggle({ enabled, onToggle }: EnableToggleProps): React.ReactElement {
  return (
    <section>
      <div style={claudeSectionToggleRowStyle}>
        <div>
          <SectionLabel>Enable Mobile Access</SectionLabel>
          <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
            Allow paired mobile devices to connect over the local network.
            When disabled, only the desktop&apos;s local connection is accepted.
          </p>
        </div>
        <label aria-label="Enable mobile access" style={toggleLabelStyle}>
          <input
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            type="checkbox"
          />
        </label>
      </div>
    </section>
  );
}

// ── MobileAccessPane ──────────────────────────────────────────────────────────

export function MobileAccessPane({ draft, onChange }: MobileAccessPaneProps): React.ReactElement {
  const enabled = draft.mobileAccess?.enabled ?? false;

  function handleToggle(value: boolean): void {
    const current = draft.mobileAccess ?? { enabled: false, pairedDevices: [] };
    onChange('mobileAccess', { ...current, enabled: value });
  }

  return (
    <div style={claudeSectionRootStyle}>
      <div>
        <SectionLabel>Mobile Access</SectionLabel>
        <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
          Pair mobile devices to access the IDE remotely. Pairing requires
          scanning a QR code or entering a 6-digit code on the device.
        </p>
      </div>

      <EnableToggle enabled={enabled} onToggle={handleToggle} />

      <MobileAccessPairingSection enabled={enabled} />

      <MobileAccessDevicesSection enabled={enabled} />

      <MobileAccessDiagnosticsSection />
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const toggleLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: '44px',
  cursor: 'pointer',
  flexShrink: 0,
};
