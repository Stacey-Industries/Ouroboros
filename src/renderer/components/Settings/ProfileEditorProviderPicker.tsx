/**
 * ProfileEditorProviderPicker.tsx — Provider picker for ProfileEditor.
 *
 * Wave 36 Phase E.
 *
 * Shown only when `config.providers.multiProvider === true`.
 * Calls `checkAllAvailability()` on initial render (once per mount) and
 * shows a status badge next to each option. Results are cached in component
 * state for the session lifetime — availability is cheap but must not fire
 * on every keystroke.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ProfileProviderId } from '../../types/electron';

// ─── Provider metadata ────────────────────────────────────────────────────────

interface ProviderMeta {
  id: ProfileProviderId;
  label: string;
}

const PROVIDERS: ProviderMeta[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
];

// ─── Multi-provider flag hook ─────────────────────────────────────────────────

/**
 * Reads `config.providers.multiProvider` via IPC once on mount.
 * Exported so ProfileEditor can consume it without an extra IPC call.
 */
export function useMultiProvider(): boolean {
  const [enabled, setEnabled] = useState(false);
  const load = useCallback(() => {
    window.electronAPI?.config?.getAll()
      ?.then((cfg) => { setEnabled(cfg?.providers?.multiProvider === true); })
      ?.catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);
  return enabled;
}

// ─── Availability ─────────────────────────────────────────────────────────────

type AvailMap = Partial<Record<ProfileProviderId, boolean>>;

async function fetchAvailability(): Promise<AvailMap> {
  try {
    const result = await window.electronAPI.providers.checkAllAvailability();
    if (!result.success || !result.availability) return {};
    return result.availability as AvailMap;
  } catch {
    return {};
  }
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const optionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  cursor: 'pointer',
  fontSize: '12px',
};

function badgeStyle(available: boolean | undefined): React.CSSProperties {
  const successBg = 'color-mix(in srgb, var(--status-success) 15%, transparent)';
  const warnBg = 'color-mix(in srgb, var(--status-warning) 15%, transparent)';
  return {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    background: available === true ? successBg : warnBg,
    color: available === true ? 'var(--status-success)' : 'var(--status-warning)',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface ProfileEditorProviderPickerProps {
  value: ProfileProviderId | undefined;
  onChange: (id: ProfileProviderId) => void;
}

export function ProfileEditorProviderPicker({
  value,
  onChange,
}: ProfileEditorProviderPickerProps): React.ReactElement {
  const [avail, setAvail] = useState<AvailMap>({});

  useEffect(() => {
    fetchAvailability().then(setAvail).catch(() => undefined);
  }, []);

  return (
    <div style={wrapStyle}>
      {PROVIDERS.map((p) => {
        const isAvail = avail[p.id];
        const hasBadge = isAvail !== undefined;
        const badgeText = isAvail ? 'available' : 'not installed';
        const effective = value ?? 'claude';
        return (
          <label key={p.id} style={optionRowStyle}>
            <input
              type="radio"
              name="providerId"
              value={p.id}
              checked={effective === p.id}
              onChange={() => onChange(p.id)}
            />
            <span className="text-text-semantic-primary">{p.label}</span>
            {hasBadge && (
              <span
                style={badgeStyle(isAvail)}
                data-testid={`provider-badge-${p.id}`}
              >
                {badgeText}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
