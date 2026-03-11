import React, { useState } from 'react';
import type { AppConfig } from '../../types/electron';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Keys that are excluded from profile snapshots (infra / runtime state). */
const EXCLUDED_KEYS: ReadonlySet<keyof AppConfig> = new Set<keyof AppConfig>([
  'recentProjects',
  'defaultProjectRoot',
  'terminalSessions',
  'windowBounds',
  'panelSizes',
  'profiles',
]);

type ProfileSnapshot = Partial<Omit<AppConfig, 'profiles'>>;

function snapshotConfig(config: AppConfig): ProfileSnapshot {
  const snap: Partial<AppConfig> = {};
  for (const key of Object.keys(config) as Array<keyof AppConfig>) {
    if (!EXCLUDED_KEYS.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (snap as any)[key] = config[key];
    }
  }
  return snap as ProfileSnapshot;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastState {
  message: string;
  kind: 'success' | 'error';
}

function useToast(): [ToastState | null, (msg: string, kind: ToastState['kind']) => void] {
  const [toast, setToast] = useState<ToastState | null>(null);

  function show(message: string, kind: ToastState['kind']): void {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }

  return [toast, show];
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  );
}

// ─── ProfilesSection ──────────────────────────────────────────────────────────

export interface ProfilesSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function ProfilesSection({ draft, onChange }: ProfilesSectionProps): React.ReactElement {
  const [toast, showToast] = useToast();
  const [newName, setNewName] = useState('');

  const profiles: Record<string, ProfileSnapshot> = (draft.profiles as Record<string, ProfileSnapshot>) ?? {};
  const profileNames = Object.keys(profiles).sort();

  function handleSaveProfile(): void {
    const name = newName.trim();
    if (!name) {
      showToast('Enter a profile name first.', 'error');
      return;
    }
    const snapshot = snapshotConfig(draft);
    const updated: Record<string, ProfileSnapshot> = { ...profiles, [name]: snapshot };
    onChange('profiles', updated as AppConfig['profiles']);
    setNewName('');
    showToast(`Profile "${name}" saved.`, 'success');
  }

  function handleApplyProfile(name: string): void {
    const snap = profiles[name];
    if (!snap) return;
    // Apply each stored key over the draft
    for (const key of Object.keys(snap) as Array<keyof ProfileSnapshot>) {
      if (!EXCLUDED_KEYS.has(key as keyof AppConfig)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange(key as keyof AppConfig, (snap as any)[key]);
      }
    }
    showToast(`Profile "${name}" applied. Click Save to persist.`, 'success');
  }

  function handleDeleteProfile(name: string): void {
    const { [name]: _removed, ...rest } = profiles;
    onChange('profiles', rest as AppConfig['profiles']);
    showToast(`Profile "${name}" deleted.`, 'success');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            border: `1px solid ${toast.kind === 'success' ? 'var(--success)' : 'var(--error)'}`,
            background: toast.kind === 'success'
              ? 'color-mix(in srgb, var(--success) 10%, var(--bg-secondary))'
              : 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
            fontSize: '12px',
            color: toast.kind === 'success' ? 'var(--success)' : 'var(--error)',
            fontWeight: 500,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Save current as profile */}
      <section>
        <SectionLabel>Save Current Settings as Profile</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Snapshots the current theme, fonts, terminal size, and other appearance settings.
          Project paths and window layout are not included.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveProfile();
              }
            }}
            placeholder="Profile name…"
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={handleSaveProfile}
            disabled={newName.trim() === ''}
            style={{
              flexShrink: 0,
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: newName.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: newName.trim() ? 'var(--bg)' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            Save Profile
          </button>
        </div>
      </section>

      {/* Saved profiles list */}
      <section>
        <SectionLabel>Saved Profiles</SectionLabel>
        {profileNames.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No profiles saved yet.
          </p>
        ) : (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {profileNames.map((name, idx) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 12px',
                  gap: '10px',
                  borderBottom: idx < profileNames.length - 1 ? '1px solid var(--border)' : 'none',
                  background: 'var(--bg-tertiary)',
                }}
              >
                {/* Profile name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: '13px',
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                  title={name}
                >
                  {name}
                </span>

                {/* Preview: theme swatch */}
                {profiles[name]?.activeTheme && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      opacity: 0.7,
                    }}
                  >
                    {profiles[name].activeTheme}
                  </span>
                )}

                {/* Apply */}
                <button
                  aria-label={`Apply profile ${name}`}
                  onClick={() => handleApplyProfile(name)}
                  style={{
                    flexShrink: 0,
                    padding: '4px 10px',
                    borderRadius: '5px',
                    border: '1px solid var(--accent)',
                    background: 'transparent',
                    color: 'var(--accent)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Apply
                </button>

                {/* Delete */}
                <button
                  aria-label={`Delete profile ${name}`}
                  onClick={() => handleDeleteProfile(name)}
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '15px',
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
