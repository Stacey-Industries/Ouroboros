/**
 * ProfileEditor.tsx — Inline editor for creating or updating an agent Profile.
 *
 * Wave 26 Phase B.
 *
 * Props:
 *   profile  — null to create a new profile; existing Profile to edit/duplicate.
 *   onSave   — receives the saved Profile after upsert completes.
 *   onCancel — called when the user discards changes.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { EffortLevel, PermissionMode, Profile } from '../../types/electron';
import { LintWarnings, useProfileLint } from './profileEditorLint';
import { ProfileEditorFields } from './ProfileEditorParts';
import { ProfileEditorProviderPicker, useMultiProvider } from './ProfileEditorProviderPicker';
import {
  cancelBtnStyle,
  editorTitleStyle,
  editorWrapStyle,
  errorStyle,
  footerStyle,
  saveBtnStyle,
} from './profileEditorStyles';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ALL_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'Task',
  'WebSearch',
  'MultiEdit',
] as const;

export const EFFORT_OPTIONS: Array<{ value: EffortLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'plan', label: 'Plan' },
  { value: 'bypass', label: 'Bypass' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProfileEditorProps {
  profile: Profile | null;
  onSave: (p: Profile) => void;
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildInitial(profile: Profile | null): Partial<Profile> {
  if (!profile) {
    return {
      id: generateId(),
      name: '',
      description: '',
      effort: 'medium',
      permissionMode: 'normal',
      enabledTools: [...ALL_TOOLS],
    };
  }
  return { ...profile };
}

// ─── useMcpServers ────────────────────────────────────────────────────────────

interface McpEntry {
  name: string;
}

function useMcpServers(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    window.electronAPI.mcp
      .getServers()
      .then((res) => {
        if (res.success && res.servers) {
          setNames(res.servers.map((s: McpEntry) => s.name));
        }
      })
      .catch(() => undefined);
  }, []);
  return names;
}

// ─── useEditorState ───────────────────────────────────────────────────────────

interface EditorState {
  draft: Partial<Profile>;
  saving: boolean;
  error: string | null;
  set: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
  handleSave: () => Promise<void>;
}

function useEditorState(profile: Profile | null, onSave: (p: Profile) => void): EditorState {
  const [draft, setDraft] = useState<Partial<Profile>>(() => buildInitial(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Profile>(key: K, value: Profile[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const handleSave = useCallback(async () => {
    if (!draft.name?.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI.profileCrud.upsert(draft as Profile);
      if (!result.success) {
        setError(result.error ?? 'Save failed');
        setSaving(false);
        return;
      }
      if (result.profile) onSave(result.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSaving(false);
    }
  }, [draft, onSave]);

  return { draft, saving, error, set, handleSave };
}

// ─── ProfileEditorFooter ──────────────────────────────────────────────────────

function ProfileEditorFooter({
  saving,
  canSave,
  onCancel,
  onSave,
}: {
  saving: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
}): React.ReactElement {
  return (
    <div style={footerStyle}>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="text-text-semantic-muted"
        style={cancelBtnStyle}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        style={saveBtnStyle(canSave)}
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}

// ─── ProfileEditor ────────────────────────────────────────────────────────────

export function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: ProfileEditorProps): React.ReactElement {
  const { draft, saving, error, set, handleSave } = useEditorState(profile, onSave);
  const mcpServers = useMcpServers();
  const multiProvider = useMultiProvider();
  const lints = useProfileLint(draft);
  const canSave = Boolean(draft.name?.trim()) && !saving;

  return (
    <div style={editorWrapStyle}>
      <div style={editorTitleStyle} className="text-text-semantic-primary">
        {profile ? `Edit "${profile.name}"` : 'New Profile'}
      </div>
      {error && (
        <div className="text-status-error" style={errorStyle}>
          {error}
        </div>
      )}
      <ProfileEditorFields
        draft={draft}
        mcpServers={mcpServers}
        multiProvider={multiProvider}
        set={set}
      />
      <LintWarnings lints={lints} />
      <ProfileEditorFooter
        saving={saving}
        canSave={canSave}
        onCancel={onCancel}
        onSave={() => void handleSave()}
      />
    </div>
  );
}

// ─── Re-exports for backward compatibility ────────────────────────────────────

export { ProfileEditorProviderPicker };
