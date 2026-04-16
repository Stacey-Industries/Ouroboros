/**
 * AgentProfilesSectionHelpers.tsx — Sub-components and hooks for AgentProfilesSection.
 *
 * Wave 26 Phase B. Split to stay under ESLint 300-line and 40-line-function limits.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { Profile } from '../../types/electron';
import { ProfileEditor } from './ProfileEditor';

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ label, tone }: {
  label: string;
  tone: 'neutral' | 'accent' | 'warning';
}): React.ReactElement {
  const bg = tone === 'accent'
    ? 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'
    : tone === 'warning'
    ? 'color-mix(in srgb, var(--status-warning) 15%, transparent)'
    : 'var(--surface-inset)';
  const color = tone === 'accent'
    ? 'var(--interactive-accent)'
    : tone === 'warning'
    ? 'var(--status-warning)'
    : 'var(--text-muted)';
  return <span style={{ ...badgeStyle, background: bg, color }}>{label}</span>;
}

// ─── ProfileRowActions ────────────────────────────────────────────────────────

export function ProfileRowActions({
  isBuiltIn,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
}: {
  isBuiltIn: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}): React.ReactElement {
  return (
    <div style={actionsStyle}>
      <button type="button" onClick={onEdit} style={actionBtnStyle} className="text-text-semantic-muted">Edit</button>
      <button type="button" onClick={onDuplicate} style={actionBtnStyle} className="text-text-semantic-muted">Dup</button>
      <button type="button" onClick={onExport} style={actionBtnStyle} className="text-text-semantic-muted">Export</button>
      {!isBuiltIn && (
        <button type="button" onClick={onDelete} style={deleteBtnStyle} className="text-status-error">Delete</button>
      )}
    </div>
  );
}

// ─── ProfileRow ───────────────────────────────────────────────────────────────

export function ProfileRow({
  profile, isLast, onEdit, onDuplicate, onDelete, onExport,
}: {
  profile: Profile;
  isLast: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
}): React.ReactElement {
  const toolCount = profile.enabledTools?.length;
  return (
    <div style={{ ...profileRowStyle, borderBottom: isLast ? 'none' : '1px solid var(--border-default)' }}>
      <span className="text-text-semantic-primary" style={nameStyle}>
        {profile.name}
        {profile.builtIn && <span className="text-text-semantic-faint" style={builtInLabelStyle}> built-in</span>}
      </span>
      <div style={badgeRowStyle}>
        {profile.model && <Badge label={profile.model.replace('claude-', '')} tone="accent" />}
        {profile.effort && <Badge label={profile.effort} tone="neutral" />}
        {toolCount !== undefined && <Badge label={`${toolCount} tools`} tone="neutral" />}
      </div>
      <ProfileRowActions
        isBuiltIn={Boolean(profile.builtIn)}
        onEdit={onEdit} onDuplicate={onDuplicate}
        onDelete={onDelete} onExport={onExport}
      />
    </div>
  );
}

// ─── ImportModal ──────────────────────────────────────────────────────────────

function ImportModalBody({
  json, setJson, error,
}: {
  json: string;
  setJson: (v: string) => void;
  error: string | null;
}): React.ReactElement {
  return (
    <>
      <p className="text-text-semantic-muted" style={modalDescStyle}>
        Paste the JSON of a previously exported profile.
      </p>
      {error && <div className="text-status-error" style={{ fontSize: '12px' }}>{error}</div>}
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={8}
        className="text-text-semantic-primary" style={modalTextareaStyle}
        placeholder='{ "id": "...", "name": "...", ... }' />
    </>
  );
}

export function ImportModal({
  onImport, onClose,
}: {
  onImport: (json: string) => Promise<void>;
  onClose: () => void;
}): React.ReactElement {
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleImport(): Promise<void> {
    setError(null);
    try { await onImport(json); }
    catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalCardStyle} className="bg-surface-panel">
        <div className="text-text-semantic-primary" style={{ fontSize: '14px', fontWeight: 600 }}>Import Profile</div>
        <ImportModalBody json={json} setJson={setJson} error={error} />
        <div style={modalFooterStyle}>
          <button type="button" onClick={onClose} style={cancelBtnStyle} className="text-text-semantic-muted">Cancel</button>
          <button type="button" onClick={() => void handleImport()} disabled={!json.trim()} style={importBtnStyle(json.trim().length > 0)}>Import</button>
        </div>
      </div>
    </div>
  );
}

// ─── InlineEditor ─────────────────────────────────────────────────────────────

export function InlineEditor({
  target, onDone,
}: {
  target: Profile | null | undefined;
  onDone: (saved: Profile) => void;
  onCancel: () => void;
}): React.ReactElement | null {
  if (target === undefined) return null;
  return (
    <ProfileEditor
      profile={target}
      onSave={onDone}
      onCancel={() => onDone(target as Profile)}
    />
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProfileList(): { profiles: Profile[]; reload: () => Promise<void> } {
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const reload = useCallback(async () => {
    const res = await window.electronAPI.profileCrud.list();
    if (res.success && res.profiles) setProfiles(res.profiles);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    return window.electronAPI.profileCrud.onChanged((updated) => setProfiles(updated));
  }, []);

  return { profiles, reload };
}

export function useDefaultProfile(projectRoot: string): {
  defaultId: string | null;
  setDefault: (profileId: string) => Promise<void>;
} {
  const [defaultId, setDefaultId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectRoot) { setDefaultId(null); return; }
    window.electronAPI.profileCrud.getDefault(projectRoot)
      .then((res) => { if (res.success) setDefaultId(res.profileId ?? null); })
      .catch(() => undefined);
  }, [projectRoot]);

  const setDefault = useCallback(async (profileId: string) => {
    if (!projectRoot) return;
    await window.electronAPI.profileCrud.setDefault(projectRoot, profileId);
    setDefaultId(profileId);
  }, [projectRoot]);

  return { defaultId, setDefault };
}

// ─── Styles (shared) ──────────────────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 6px',
  borderRadius: '4px',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
};

const actionsStyle: React.CSSProperties = { display: 'flex', gap: '4px', flexShrink: 0 };

const actionBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '11px',
  cursor: 'pointer',
};

export const deleteBtnStyle: React.CSSProperties = { ...actionBtnStyle, borderColor: 'var(--status-error)' };

export const profileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '9px 12px',
  gap: '10px',
  background: 'var(--surface-raised)',
};

const nameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '13px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const builtInLabelStyle: React.CSSProperties = { fontSize: '10px', fontStyle: 'italic' };

const badgeRowStyle: React.CSSProperties = { display: 'flex', gap: '4px', flexShrink: 0 };

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalCardStyle: React.CSSProperties = {
  width: '480px',
  padding: '20px',
  borderRadius: '10px',
  border: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const modalDescStyle: React.CSSProperties = { fontSize: '12px' };

const modalTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-base)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  resize: 'vertical',
  outline: 'none',
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

function importBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid var(--interactive-accent)',
    background: enabled ? 'var(--interactive-accent)' : 'var(--surface-raised)',
    color: enabled ? 'var(--text-on-accent)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
