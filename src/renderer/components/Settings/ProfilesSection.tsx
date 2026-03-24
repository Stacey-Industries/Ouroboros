import React, { useState } from 'react';

import type { AppConfig } from '../../types/electron';
import {
  applyButtonStyle,
  deleteButtonStyle,
  emptyStateStyle,
  getSaveButtonStyle,
  getToastStyle,
  helperTextStyle,
  inputRowStyle,
  profileInputStyle,
  profileListStyle,
  type ProfileMap,
  profileNameStyle,
  stackStyle,
  themePreviewStyle,
  type ToastState,
  useProfilesManager,
  useToast,
} from './profilesSectionHelpers';
import { SectionLabel } from './settingsStyles';

export interface ProfilesSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

function ToastBanner({ toast }: { toast: ToastState }): React.ReactElement {
  return (
    <div role="status" aria-live="polite" style={getToastStyle(toast.kind)}>
      {toast.message}
    </div>
  );
}

function ProfileNameInput({
  newName,
  onNameChange,
  onSave,
}: {
  newName: string;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <input
      type="text"
      value={newName}
      onChange={(event) => onNameChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSave();
        }
      }}
      placeholder="Profile name..."
      className="text-text-semantic-primary"
      style={profileInputStyle}
      autoComplete="off"
      spellCheck={false}
    />
  );
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
      <p className="text-text-semantic-muted" style={helperTextStyle}>
        Snapshots the current theme, fonts, terminal size, and other appearance settings. Project
        paths and window layout are not included.
      </p>
      <div style={inputRowStyle}>
        <ProfileNameInput newName={newName} onNameChange={onNameChange} onSave={onSave} />
        <button onClick={onSave} disabled={!canSave} style={getSaveButtonStyle(canSave)}>
          Save Profile
        </button>
      </div>
    </section>
  );
}

function ProfileRowActions({
  name,
  onApply,
  onDelete,
}: {
  name: string;
  onApply: (name: string) => void;
  onDelete: (name: string) => void;
}): React.ReactElement {
  return (
    <>
      <button
        aria-label={`Apply profile ${name}`}
        onClick={() => onApply(name)}
        className="text-interactive-accent"
        style={applyButtonStyle}
      >
        Apply
      </button>
      <button
        aria-label={`Delete profile ${name}`}
        onClick={() => onDelete(name)}
        className="text-text-semantic-muted"
        style={deleteButtonStyle}
      >
        x
      </button>
    </>
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '9px 12px',
        gap: '10px',
        borderBottom: isLast ? 'none' : '1px solid var(--border-default)',
        background: 'var(--surface-raised)',
      }}
    >
      <span className="text-text-semantic-primary" style={profileNameStyle} title={name}>
        {name}
      </span>
      {previewTheme && (
        <span className="text-text-semantic-muted" style={themePreviewStyle}>
          {previewTheme}
        </span>
      )}
      <ProfileRowActions name={name} onApply={onApply} onDelete={onDelete} />
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
      {profileNames.length === 0 ? (
        <p className="text-text-semantic-muted" style={emptyStateStyle}>
          No profiles saved yet.
        </p>
      ) : (
        <div style={profileListStyle}>
          {profileNames.map((name, index) => (
            <ProfileRow
              key={name}
              name={name}
              previewTheme={profiles[name]?.activeTheme}
              isLast={index === profileNames.length - 1}
              onApply={onApply}
              onDelete={onDelete}
            />
          ))}
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
      <ProfilesList
        profiles={manager.profiles}
        profileNames={manager.profileNames}
        onApply={manager.applyProfile}
        onDelete={manager.deleteProfile}
      />
    </div>
  );
}
