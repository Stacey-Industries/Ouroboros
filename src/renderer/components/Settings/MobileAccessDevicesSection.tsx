/**
 * MobileAccessDevicesSection.tsx — Paired devices list with revoke controls.
 *
 * Wave 33a Phase G. Live list via listPairedDevices(). Columns: label,
 * capability badges, last-seen (relative), revoke button.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { PairedDeviceInfo } from '../../types/electron-mobile-access';
import { SectionLabel } from './settingsStyles';

// ── Relative time formatter ───────────────────────────────────────────────────

export function formatLastSeen(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} d ago`;
}

// ── CapabilityBadge ───────────────────────────────────────────────────────────

function CapabilityBadge({ label }: { label: string }): React.ReactElement {
  return (
    <span style={badgeStyle}>
      {label}
    </span>
  );
}

// ── DeviceRow ─────────────────────────────────────────────────────────────────

interface DeviceRowProps {
  device: PairedDeviceInfo;
  onRevoke: (id: string) => void;
  revoking: boolean;
}

function DeviceRow({ device, onRevoke, revoking }: DeviceRowProps): React.ReactElement {
  return (
    <div style={rowContainerStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
          {device.label}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
          {device.capabilities.map((cap) => <CapabilityBadge key={cap} label={cap} />)}
        </div>
        <div className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
          Last seen: {formatLastSeen(device.lastSeenAt)}
        </div>
      </div>
      <button
        aria-label={`Revoke ${device.label}`}
        disabled={revoking}
        onClick={() => onRevoke(device.id)}
        style={revokeBtnStyle(revoking)}
        type="button"
      >
        Revoke
      </button>
    </div>
  );
}

// ── useDevicesList ────────────────────────────────────────────────────────────

function useDevicesList() {
  const [devices, setDevices] = useState<PairedDeviceInfo[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await window.electronAPI.mobileAccess.listPairedDevices();
      if (result.success) {
        setDevices(result.devices ?? []);
      } else {
        setLoadError(result.error ?? 'Failed to load devices');
      }
    } catch (err) {
      setLoadError(String(err));
    }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  const handleRevoke = useCallback(async (deviceId: string) => {
    setRevoking(deviceId);
    try {
      const result = await window.electronAPI.mobileAccess.revokePairedDevice(deviceId);
      if (result.success) setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    } finally {
      setRevoking(null);
    }
  }, []);

  return { devices, revoking, loadError, handleRevoke };
}

// ── DevicesListBody ───────────────────────────────────────────────────────────

interface ListBodyProps {
  devices: PairedDeviceInfo[];
  revoking: string | null;
  loadError: string | null;
  onRevoke: (id: string) => void;
}

function DevicesListBody({ devices, revoking, loadError, onRevoke }: ListBodyProps): React.ReactElement {
  if (loadError) return <p className="text-status-error" style={{ fontSize: '12px' }}>{loadError}</p>;
  if (devices.length === 0) return <p className="text-text-semantic-muted" style={{ fontSize: '12px' }}>No paired devices yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {devices.map((device) => (
        <DeviceRow key={device.id} device={device} onRevoke={onRevoke} revoking={revoking === device.id} />
      ))}
    </div>
  );
}

// ── MobileAccessDevicesSection ────────────────────────────────────────────────

export function MobileAccessDevicesSection({ enabled }: { enabled: boolean }): React.ReactElement {
  const { devices, revoking, loadError, handleRevoke } = useDevicesList();

  return (
    <section aria-labelledby="devices-section-label">
      <div id="devices-section-label"><SectionLabel>Paired Devices</SectionLabel></div>
      {!enabled
        ? <p className="text-text-semantic-muted" style={{ fontSize: '12px' }}>Enable Mobile Access to manage paired devices.</p>
        : <DevicesListBody devices={devices} loadError={loadError} onRevoke={(id) => void handleRevoke(id)} revoking={revoking} />
      }
    </section>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '10px',
  fontWeight: 600,
  background: 'var(--interactive-accent-subtle)',
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
};

const rowContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-raised)',
};

function revokeBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    minHeight: '44px',
    borderRadius: '6px',
    border: '1px solid var(--border-semantic)',
    background: 'transparent',
    color: disabled ? 'var(--text-muted)' : 'var(--status-error)',
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
    opacity: disabled ? 0.6 : 1,
  };
}
