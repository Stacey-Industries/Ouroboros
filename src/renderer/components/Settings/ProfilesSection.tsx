import React, { useState } from 'react';
import type { AppConfig } from '../../types/electron';
import { SectionLabel } from './settingsStyles';

const EXCLUDED_KEYS: ReadonlySet<keyof AppConfig> = new Set<keyof AppConfig>([
  'recentProjects',
  'defaultProjectRoot',
  'terminalSessions',
  'windowBounds',
  'panelSizes',
  'profiles',
]);

type ProfileSnapshot = Partial<Omit<AppConfig, 'profiles'>>;
type ProfileMap = Record<string, ProfileSnapshot>;
type ConfigChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

interface ToastState {
  message: string;
  kind: 'success' | 'error';
}

interface ProfilesManager {
  profileNames: string[];
  profiles: ProfileMap;
  applyProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
  saveProfile: (name: string) => boolean;
}

export interface ProfilesSectionProps {
  draft: AppConfig;
  onChange: ConfigChangeHandler;
}

const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const helperTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  marginBottom: '12px',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

const profileInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '13px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
};

const profileListStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '6px',
  overflow: 'hidden',
};

const profileNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '13px',
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const themePreviewStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-muted)',
  opacity: 0.7,
};

const applyButtonStyle: React.CSSProperties = {
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
};

const deleteButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: '15px',
  lineHeight: 1,
  padding: '0 2px',
};

const emptyStateStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
};

function getProfiles(draft: AppConfig): ProfileMap {
  return (draft.profiles as ProfileMap) ?? {};
}

function snapshotConfig(config: AppConfig): ProfileSnapshot {
  const entries = (Object.keys(config) as Array<keyof AppConfig>)
    .filter((key) => !EXCLUDED_KEYS.has(key))
    .map((key) => [key, config[key]]);
  return Object.fromEntries(entries) as ProfileSnapshot;
}

function applyProfileSnapshot(snapshot: ProfileSnapshot, onChange: ConfigChangeHandler): void {
  for (const key of Object.keys(snapshot) as Array<keyof ProfileSnapshot>) {
    if (EXCLUDED_KEYS.has(key as keyof AppConfig)) continue;
    const value = snapshot[key];
    if (value !== undefined) onChange(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
  }
}

function buildSavedProfiles(profiles: ProfileMap, draft: AppConfig, name: string): AppConfig['profiles'] {
  return { ...profiles, [name]: snapshotConfig(draft) } as AppConfig['profiles'];
}

function buildRemainingProfiles(profiles: ProfileMap, name: string): AppConfig['profiles'] {
  const nextProfiles = { ...profiles };
  delete nextProfiles[name];
  return nextProfiles as AppConfig['profiles'];
}

function getSaveButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: '7px 14px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
    color: enabled ? 'var(--bg)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
    transition: 'background 120ms ease, color 120ms ease',
  };
}

function getToastStyle(kind: ToastState['kind']): React.CSSProperties {
  const tone = kind === 'success' ? 'var(--success)' : 'var(--error)';
  const background = kind === 'success'
    ? 'color-mix(in srgb, var(--success) 10%, var(--bg-secondary))'
    : 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))';

  return {
    padding: '10px 14px',
    borderRadius: '6px',
    border: `1px solid ${tone}`,
    background,
    fontSize: '12px',
    color: tone,
    fontWeight: 500,
  };
}

function useToast(): [ToastState | null, (message: string, kind: ToastState['kind']) => void] {
  const [toast, setToast] = useState<ToastState | null>(null);

  function show(message: string, kind: ToastState['kind']): void {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }

  return [toast, show];
}

function useProfilesManager(
  draft: AppConfig,
  onChange: ConfigChangeHandler,
  showToast: (message: string, kind: ToastState['kind']) => void
): ProfilesManager {
  const profiles = getProfiles(draft);
  const profileNames = Object.keys(profiles).sort();

  function saveProfile(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return showToast('Enter a profile name first.', 'error'), false;
    onChange('profiles', buildSavedProfiles(profiles, draft, trimmed));
    showToast(`Profile "${trimmed}" saved.`, 'success');
    return true;
  }

  function applyProfile(name: string): void {
    const snapshot = profiles[name];
    if (!snapshot) return;
    applyProfileSnapshot(snapshot, onChange);
    showToast(`Profile "${name}" applied. Click Save to persist.`, 'success');
  }

  function deleteProfile(name: string): void {
    onChange('profiles', buildRemainingProfiles(profiles, name));
    showToast(`Profile "${name}" deleted.`, 'success');
  }

  return { profiles, profileNames, saveProfile, applyProfile, deleteProfile };
}

function ToastBanner({ toast }: { toast: ToastState }): React.ReactElement {
  return <div role="status" aria-live="polite" style={getToastStyle(toast.kind)}>{toast.message}</div>;
}

function SaveProfileSection({
  newName,
  onNameChange,
  onSave,
}: {
  newName: string;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.ReactElement {
  const canSave = newName.trim() !== '';

  return (
    <section>
      <SectionLabel>Save Current Settings as Profile</SectionLabel>
      <p style={helperTextStyle}>Snapshots the current theme, fonts, terminal size, and other appearance settings. Project paths and window layout are not included.</p>
      <div style={inputRowStyle}>
        <input type="text" value={newName} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onSave(); } }} placeholder="Profile name..." style={profileInputStyle} autoComplete="off" spellCheck={false} />
        <button onClick={onSave} disabled={!canSave} style={getSaveButtonStyle(canSave)}>Save Profile</button>
      </div>
    </section>
  );
}

function ProfileRow({
  name,
  previewTheme,
  isLast,
  onApply,
  onDelete,
}: {
  name: string;
  previewTheme?: string;
  isLast: boolean;
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: '10px', borderBottom: isLast ? 'none' : '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
      <span style={profileNameStyle} title={name}>{name}</span>
      {previewTheme && <span style={themePreviewStyle}>{previewTheme}</span>}
      <button aria-label={`Apply profile ${name}`} onClick={() => onApply(name)} style={applyButtonStyle}>Apply</button>
      <button aria-label={`Delete profile ${name}`} onClick={() => onDelete(name)} style={deleteButtonStyle}>x</button>
    </div>
  );
}

function ProfilesList({
  profiles,
  profileNames,
  onApply,
  onDelete,
}: {
  profiles: ProfileMap;
  profileNames: string[];
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
}): React.ReactElement {
  return (
    <section>
      <SectionLabel>Saved Profiles</SectionLabel>
      {profileNames.length === 0 ? <p style={emptyStateStyle}>No profiles saved yet.</p> : (
        <div style={profileListStyle}>
          {profileNames.map((name, index) => <ProfileRow key={name} name={name} previewTheme={profiles[name]?.activeTheme} isLast={index === profileNames.length - 1} onApply={onApply} onDelete={onDelete} />)}
        </div>
      )}
    </section>
  );
}

export function ProfilesSection({ draft, onChange }: ProfilesSectionProps): React.ReactElement {
  const [toast, showToast] = useToast();
  const [newName, setNewName] = useState('');
  const manager = useProfilesManager(draft, onChange, showToast);

  function handleSave(): void {
    if (manager.saveProfile(newName)) setNewName('');
  }

  return (
    <div style={stackStyle}>
      {toast && <ToastBanner toast={toast} />}
      <SaveProfileSection newName={newName} onNameChange={setNewName} onSave={handleSave} />
      <ProfilesList profiles={manager.profiles} profileNames={manager.profileNames} onApply={manager.applyProfile} onDelete={manager.deleteProfile} />
    </div>
  );
}
