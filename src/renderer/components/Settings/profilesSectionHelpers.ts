/**
 * profilesSectionHelpers.ts — Types, styles, and hooks for ProfilesSection.
 */

import React, { useState } from 'react';

import type { AppConfig } from '../../types/electron';

export const EXCLUDED_KEYS: ReadonlySet<keyof AppConfig> = new Set<keyof AppConfig>([
  'recentProjects',
  'defaultProjectRoot',
  'terminalSessions',
  'windowBounds',
  'panelSizes',
  'profiles',
]);

export type ProfileSnapshot = Partial<Omit<AppConfig, 'profiles'>>;
export type ProfileMap = Record<string, ProfileSnapshot>;
export type ConfigChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;

export interface ToastState {
  message: string;
  kind: 'success' | 'error';
}

export interface ProfilesManager {
  profileNames: string[];
  profiles: ProfileMap;
  applyProfile: (name: string) => void;
  deleteProfile: (name: string) => void;
  saveProfile: (name: string) => boolean;
}

export const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

export const helperTextStyle: React.CSSProperties = {
  fontSize: '12px',
  marginBottom: '12px',
};

export const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

export const profileInputStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '13px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
};

export const profileListStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

export const profileNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '13px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

export const themePreviewStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  opacity: 0.7,
};

export const applyButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 10px',
  borderRadius: '5px',
  border: '1px solid var(--interactive-accent)',
  background: 'transparent',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const deleteButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '15px',
  lineHeight: 1,
  padding: '0 2px',
};

export const emptyStateStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
};

export function getProfiles(draft: AppConfig): ProfileMap {
  return (draft.profiles as unknown as ProfileMap) ?? {};
}

export function snapshotConfig(config: AppConfig): ProfileSnapshot {
  const entries = (Object.keys(config) as Array<keyof AppConfig>)
    .filter((key) => !EXCLUDED_KEYS.has(key))
    .map((key) => [key, config[key]]);
  return Object.fromEntries(entries) as ProfileSnapshot;
}

export function applyProfileSnapshot(
  snapshot: ProfileSnapshot,
  onChange: ConfigChangeHandler,
): void {
  for (const key of Object.keys(snapshot) as Array<keyof ProfileSnapshot>) {
    if (EXCLUDED_KEYS.has(key as keyof AppConfig)) continue;
    const value = snapshot[key];
    if (value !== undefined) onChange(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
  }
}

export function buildSavedProfiles(
  profiles: ProfileMap,
  draft: AppConfig,
  name: string,
): AppConfig['profiles'] {
  return { ...profiles, [name]: snapshotConfig(draft) } as unknown as AppConfig['profiles'];
}

export function buildRemainingProfiles(profiles: ProfileMap, name: string): AppConfig['profiles'] {
  const nextProfiles = { ...profiles };
  delete nextProfiles[name];
  return nextProfiles as unknown as AppConfig['profiles'];
}

export function getSaveButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: '7px 14px',
    borderRadius: '6px',
    border: '1px solid var(--border-default)',
    background: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: enabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
    transition: 'background 120ms ease, color 120ms ease',
  };
}

export function getToastStyle(kind: ToastState['kind']): React.CSSProperties {
  const tone = kind === 'success' ? 'var(--status-success)' : 'var(--status-error)';
  const background =
    kind === 'success'
      ? 'color-mix(in srgb, var(--status-success) 10%, var(--surface-panel))'
      : 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))';
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

export function useToast(): [
  ToastState | null,
  (message: string, kind: ToastState['kind']) => void,
] {
  const [toast, setToast] = useState<ToastState | null>(null);
  function show(message: string, kind: ToastState['kind']): void {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }
  return [toast, show];
}

export function useProfilesManager(
  draft: AppConfig,
  onChange: ConfigChangeHandler,
  showToast: (message: string, kind: ToastState['kind']) => void,
): ProfilesManager {
  const profiles = getProfiles(draft);
  const profileNames = Object.keys(profiles).sort();

  function saveProfile(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return (showToast('Enter a profile name first.', 'error'), false);
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
