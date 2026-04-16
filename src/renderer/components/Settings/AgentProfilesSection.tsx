/**
 * AgentProfilesSection.tsx — Agent Profiles CRUD UI for the Settings panel.
 *
 * Wave 26 Phase B.
 *
 * Lists all profiles (built-ins first, then user). Provides per-row
 * edit/duplicate/delete/export, "New profile" inline editor, JSON import,
 * and per-project default picker.
 */

import React, { useState } from 'react';

import type { AppConfig, Profile } from '../../types/electron';
import {
  ImportModal,
  ProfileRow,
  useDefaultProfile,
  useProfileList,
} from './AgentProfilesSectionHelpers';
import { ProfileEditor } from './ProfileEditor';
import { SectionLabel } from './settingsStyles';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AgentProfilesSectionProps {
  draft: AppConfig;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DefaultProfilePicker({
  projectRoot, profiles, defaultId, onSetDefault,
}: {
  projectRoot: string;
  profiles: Profile[];
  defaultId: string | null;
  onSetDefault: (id: string) => Promise<void>;
}): React.ReactElement {
  if (!projectRoot) {
    return (
      <p className="text-text-semantic-muted" style={noProjectStyle}>
        No default project configured.
      </p>
    );
  }
  return (
    <div style={pickerRowStyle}>
      <label className="text-text-semantic-secondary" style={pickerLabelStyle}>
        Default for this project
      </label>
      <select
        value={defaultId ?? ''}
        onChange={(e) => { if (e.target.value) void onSetDefault(e.target.value); }}
        className="text-text-semantic-primary"
        style={selectStyle}
      >
        <option value="">— None —</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

function ProfileList({
  profiles, onEdit, onDuplicate, onDelete, onExport,
}: {
  profiles: Profile[];
  onEdit: (p: Profile) => void;
  onDuplicate: (p: Profile) => void;
  onDelete: (p: Profile) => void;
  onExport: (p: Profile) => void;
}): React.ReactElement {
  if (profiles.length === 0) {
    return <p className="text-text-semantic-muted" style={emptyStyle}>Loading profiles…</p>;
  }
  return (
    <div style={listStyle}>
      {profiles.map((p, i) => (
        <ProfileRow
          key={p.id} profile={p} isLast={i === profiles.length - 1}
          onEdit={() => onEdit(p)} onDuplicate={() => onDuplicate(p)}
          onDelete={() => onDelete(p)} onExport={() => onExport(p)}
        />
      ))}
    </div>
  );
}

// ─── Action handlers (extracted to reduce function complexity) ────────────────

function useProfileActions(reload: () => Promise<void>) {
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string): void {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleDelete(profile: Profile): Promise<void> {
    const res = await window.electronAPI.profileCrud.delete(profile.id);
    if (!res.success) showToast(res.error ?? 'Delete failed');
  }

  async function handleExport(profile: Profile): Promise<void> {
    const res = await window.electronAPI.profileCrud.export(profile.id);
    if (!res.success || !res.json) { showToast('Export failed'); return; }
    await navigator.clipboard.writeText(res.json);
    showToast(`"${profile.name}" copied to clipboard.`);
  }

  async function handleImport(json: string): Promise<void> {
    const res = await window.electronAPI.profileCrud.import(json);
    if (!res.success) throw new Error(res.error ?? 'Import failed');
    showToast('Profile imported.');
  }

  function makeDuplicate(profile: Profile): Profile {
    return {
      ...profile,
      id: `profile-${Date.now()}`,
      name: `${profile.name} (copy)`,
      builtIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return { toast, showToast, handleDelete, handleExport, handleImport, makeDuplicate, reload };
}

// ─── Header row ──────────────────────────────────────────────────────────────

function ProfileSectionHeader({
  isEditing, onNewProfile, onImport,
}: {
  isEditing: boolean;
  onNewProfile: () => void;
  onImport: () => void;
}): React.ReactElement {
  return (
    <div style={headerRowStyle}>
      <SectionLabel style={{ marginBottom: 0 }}>Agent Profiles</SectionLabel>
      <div style={headerActionsStyle}>
        <button type="button" onClick={onImport}
          className="text-text-semantic-muted" style={headerBtnStyle}>Import…</button>
        <button type="button" onClick={onNewProfile}
          className="text-interactive-accent" style={headerBtnStyle} disabled={isEditing}>
          + New profile
        </button>
      </div>
    </div>
  );
}

// ─── Default section ─────────────────────────────────────────────────────────

function DefaultSection({
  projectRoot, profiles, defaultId, onSetDefault,
}: {
  projectRoot: string; profiles: Profile[];
  defaultId: string | null; onSetDefault: (id: string) => Promise<void>;
}): React.ReactElement {
  return (
    <section style={{ marginTop: '16px' }}>
      <SectionLabel>Default for Project</SectionLabel>
      <DefaultProfilePicker projectRoot={projectRoot} profiles={profiles}
        defaultId={defaultId} onSetDefault={onSetDefault} />
    </section>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function AgentProfilesSection({ draft }: AgentProfilesSectionProps): React.ReactElement {
  const { profiles, reload } = useProfileList();
  const projectRoot = draft.defaultProjectRoot ?? '';
  const { defaultId, setDefault } = useDefaultProfile(projectRoot);
  const actions = useProfileActions(reload);
  const [editTarget, setEditTarget] = useState<Profile | null | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const isEditing = editTarget !== undefined;
  function handleSaved(): void { setEditTarget(undefined); void reload(); }
  function handleImportDone(json: string): Promise<void> {
    return actions.handleImport(json).then(() => { setShowImport(false); });
  }
  return (
    <div style={wrapStyle}>
      {actions.toast && (
        <div className="text-text-semantic-primary" style={toastStyle}>{actions.toast}</div>
      )}
      <ProfileSectionHeader isEditing={isEditing}
        onNewProfile={() => setEditTarget(null)} onImport={() => setShowImport(true)} />
      {isEditing && (
        <ProfileEditor profile={editTarget} onSave={handleSaved}
          onCancel={() => setEditTarget(undefined)} />
      )}
      <ProfileList profiles={profiles}
        onEdit={(p) => setEditTarget(p)}
        onDuplicate={(p) => setEditTarget(actions.makeDuplicate(p))}
        onDelete={(p) => void actions.handleDelete(p)}
        onExport={(p) => void actions.handleExport(p)} />
      <DefaultSection projectRoot={projectRoot} profiles={profiles}
        defaultId={defaultId} onSetDefault={setDefault} />
      {showImport && (
        <ImportModal onImport={handleImportDone} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };

const headerRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const headerActionsStyle: React.CSSProperties = { display: 'flex', gap: '8px' };

const headerBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '5px',
  border: '1px solid var(--border-default)',
  background: 'transparent',
  fontSize: '12px',
  cursor: 'pointer',
};

const listStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  overflow: 'hidden',
};

const emptyStyle: React.CSSProperties = { fontSize: '12px', fontStyle: 'italic' };

const toastStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
};

const pickerRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px',
};

const pickerLabelStyle: React.CSSProperties = { fontSize: '12px', flexShrink: 0 };

const selectStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 10px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-base)',
  fontSize: '12px',
};

const noProjectStyle: React.CSSProperties = { fontSize: '12px', fontStyle: 'italic' };
