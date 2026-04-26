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
import { useProfileActions } from './AgentProfilesSection.actions';
import {
  emptyStyle,
  headerActionsStyle,
  headerBtnStyle,
  headerRowStyle,
  listStyle,
  noProjectStyle,
  pickerLabelStyle,
  pickerRowStyle,
  selectStyle,
  toastStyle,
  wrapStyle,
} from './AgentProfilesSection.styles';
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
  projectRoot,
  profiles,
  defaultId,
  onSetDefault,
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
  return <DefaultProfilePickerContent defaultId={defaultId} onSetDefault={onSetDefault} profiles={profiles} />;
}

function DefaultProfilePickerContent({
  defaultId,
  onSetDefault,
  profiles,
}: {
  defaultId: string | null;
  onSetDefault: (id: string) => Promise<void>;
  profiles: Profile[];
}): React.ReactElement {
  return (
    <div style={pickerRowStyle}>
      <label className="text-text-semantic-secondary" style={pickerLabelStyle}>
        Default for this project
      </label>
      <select
        value={defaultId ?? ''}
        onChange={(e) => {
          if (e.target.value) void onSetDefault(e.target.value);
        }}
        className="text-text-semantic-primary"
        style={selectStyle}
      >
        <option value="">— None —</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProfileList({
  profiles,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
}: {
  profiles: Profile[];
  onEdit: (p: Profile) => void;
  onDuplicate: (p: Profile) => void;
  onDelete: (p: Profile) => void;
  onExport: (p: Profile) => void;
}): React.ReactElement {
  if (profiles.length === 0) {
    return (
      <p className="text-text-semantic-muted" style={emptyStyle}>
        Loading profiles…
      </p>
    );
  }
  return (
    <div style={listStyle}>
      {profiles.map((p, i) => (
        <ProfileRow
          key={p.id}
          profile={p}
          isLast={i === profiles.length - 1}
          onEdit={() => onEdit(p)}
          onDuplicate={() => onDuplicate(p)}
          onDelete={() => onDelete(p)}
          onExport={() => onExport(p)}
        />
      ))}
    </div>
  );
}

// ─── Header row ──────────────────────────────────────────────────────────────

function ProfileSectionHeader({
  isEditing,
  onNewProfile,
  onImport,
}: {
  isEditing: boolean;
  onNewProfile: () => void;
  onImport: () => void;
}): React.ReactElement {
  return (
    <div style={headerRowStyle}>
      <SectionLabel style={{ marginBottom: 0 }}>Agent Profiles</SectionLabel>
      <div style={headerActionsStyle}>
        <button
          type="button"
          onClick={onImport}
          className="text-text-semantic-muted"
          style={headerBtnStyle}
        >
          Import…
        </button>
        <button
          type="button"
          onClick={onNewProfile}
          className="text-interactive-accent"
          style={headerBtnStyle}
          disabled={isEditing}
        >
          + New profile
        </button>
      </div>
    </div>
  );
}

// ─── Default section ─────────────────────────────────────────────────────────

function DefaultSection({
  projectRoot,
  profiles,
  defaultId,
  onSetDefault,
}: {
  projectRoot: string;
  profiles: Profile[];
  defaultId: string | null;
  onSetDefault: (id: string) => Promise<void>;
}): React.ReactElement {
  return (
    <section style={{ marginTop: '16px' }}>
      <SectionLabel>Default for Project</SectionLabel>
      <DefaultProfilePicker
        projectRoot={projectRoot}
        profiles={profiles}
        defaultId={defaultId}
        onSetDefault={onSetDefault}
      />
    </section>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function AgentProfilesSection({ draft }: AgentProfilesSectionProps): React.ReactElement {
  const { profiles, reload } = useProfileList();
  const projectRoot = draft.defaultProjectRoot ?? '';
  const { defaultId, setDefault } = useDefaultProfile(projectRoot);
  const actions = useProfileActions();
  const [editTarget, setEditTarget] = useState<Profile | null | undefined>(undefined);
  const [showImport, setShowImport] = useState(false);
  const isEditing = editTarget !== undefined;
  function handleSaved(): void {
    setEditTarget(undefined);
    void reload();
  }
  function handleImportDone(json: string): Promise<void> {
    return actions.handleImport(json).then(() => {
      setShowImport(false);
    });
  }

  return (
    <AgentProfilesSectionContent
      actions={actions}
      defaultId={defaultId}
      editTarget={editTarget}
      isEditing={isEditing}
      onImportDone={handleImportDone}
      onNewProfile={() => setEditTarget(null)}
      onProfileCancel={() => setEditTarget(undefined)}
      onProfileChange={setEditTarget}
      onProfileSaved={handleSaved}
      onSetDefault={setDefault}
      profiles={profiles}
      projectRoot={projectRoot}
      setShowImport={setShowImport}
      showImport={showImport}
    />
  );
}

function AgentProfilesSectionBody({
  actions,
  defaultId,
  editTarget,
  isEditing,
  onNewProfile,
  onProfileCancel,
  onProfileChange,
  onProfileSaved,
  onSetDefault,
  profiles,
  projectRoot,
  setShowImport,
}: {
  actions: ReturnType<typeof useProfileActions>;
  defaultId: string | null;
  editTarget: Profile | null | undefined;
  isEditing: boolean;
  onNewProfile: () => void;
  onProfileCancel: () => void;
  onProfileChange: React.Dispatch<React.SetStateAction<Profile | null | undefined>>;
  onProfileSaved: () => void;
  onSetDefault: (id: string) => Promise<void>;
  profiles: Profile[];
  projectRoot: string;
  setShowImport: React.Dispatch<React.SetStateAction<boolean>>;
}): React.ReactElement {
  return <>
    <ProfileSectionHeader isEditing={isEditing} onImport={() => setShowImport(true)} onNewProfile={onNewProfile} />
    {isEditing && <ProfileEditor profile={editTarget ?? null} onCancel={onProfileCancel} onSave={onProfileSaved} />}
    <ProfileList onDelete={(p) => void actions.handleDelete(p)} onDuplicate={(p) => onProfileChange(actions.makeDuplicate(p))} onEdit={(p) => onProfileChange(p)} onExport={(p) => void actions.handleExport(p)} profiles={profiles} />
    <DefaultSection defaultId={defaultId} onSetDefault={onSetDefault} profiles={profiles} projectRoot={projectRoot} />
  </>;
}

function AgentProfilesSectionImport({
  onImport,
  setShowImport,
}: {
  onImport: (json: string) => Promise<void>;
  setShowImport: React.Dispatch<React.SetStateAction<boolean>>;
}): React.ReactElement {
  return <ImportModal onClose={() => setShowImport(false)} onImport={onImport} />;
}

function AgentProfilesSectionContent({
  actions,
  defaultId,
  editTarget,
  isEditing,
  onImportDone,
  onNewProfile,
  onProfileCancel,
  onProfileChange,
  onProfileSaved,
  onSetDefault,
  profiles,
  projectRoot,
  setShowImport,
  showImport,
}: {
  actions: ReturnType<typeof useProfileActions>;
  defaultId: string | null;
  editTarget: Profile | null | undefined;
  isEditing: boolean;
  onImportDone: (json: string) => Promise<void>;
  onNewProfile: () => void;
  onProfileCancel: () => void;
  onProfileChange: React.Dispatch<React.SetStateAction<Profile | null | undefined>>;
  onProfileSaved: () => void;
  onSetDefault: (id: string) => Promise<void>;
  profiles: Profile[];
  projectRoot: string;
  setShowImport: React.Dispatch<React.SetStateAction<boolean>>;
  showImport: boolean;
}): React.ReactElement {
  return <div style={wrapStyle}>
    {actions.toast && <div className="text-text-semantic-primary" style={toastStyle}>{actions.toast}</div>}
    <AgentProfilesSectionBody actions={actions} defaultId={defaultId} editTarget={editTarget} isEditing={isEditing} onNewProfile={onNewProfile} onProfileCancel={onProfileCancel} onProfileChange={onProfileChange} onProfileSaved={onProfileSaved} onSetDefault={onSetDefault} profiles={profiles} projectRoot={projectRoot} setShowImport={setShowImport} />
    {showImport && <AgentProfilesSectionImport onImport={onImportDone} setShowImport={setShowImport} />}
  </div>;
}
