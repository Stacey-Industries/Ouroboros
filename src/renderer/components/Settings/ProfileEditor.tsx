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

import type { EffortLevel, PermissionMode, Profile, ProfileProviderId } from '../../types/electron';
import { LintWarnings, useProfileLint } from './profileEditorLint';
import { ProfileEditorProviderPicker, useMultiProvider } from './ProfileEditorProviderPicker';
import {
  cancelBtnStyle,
  checkItemStyle,
  checklistWrapStyle,
  editorTitleStyle,
  editorWrapStyle,
  errorStyle,
  fieldRowStyle,
  footerStyle,
  inputStyle,
  labelStyle,
  saveBtnStyle,
  segmentActiveStyle,
  segmentedWrapStyle,
  segmentStyle,
  textareaStyle,
} from './profileEditorStyles';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ALL_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob',
  'Task', 'WebSearch', 'MultiEdit',
] as const;

const EFFORT_OPTIONS: Array<{ value: EffortLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const PERMISSION_OPTIONS: Array<{ value: PermissionMode; label: string }> = [
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

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

interface McpEntry { name: string }

function useMcpServers(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    window.electronAPI.mcp.getServers()
      .then((res) => {
        if (res.success && res.servers) {
          setNames(res.servers.map((s: McpEntry) => s.name));
        }
      })
      .catch(() => undefined);
  }, []);
  return names;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={fieldRowStyle}>
      <label className="text-text-semantic-secondary" style={labelStyle}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | undefined;
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <div style={segmentedWrapStyle}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? 'text-text-semantic-primary' : 'text-text-semantic-muted'}
          style={value === opt.value ? segmentActiveStyle : segmentStyle}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToolsChecklist({
  enabled,
  onChange,
}: {
  enabled: string[] | undefined;
  onChange: (tools: string[]) => void;
}): React.ReactElement {
  const all = enabled ?? [...ALL_TOOLS];
  function toggle(tool: string): void {
    if (all.includes(tool)) {
      onChange(all.filter((t) => t !== tool));
    } else {
      onChange([...all, tool]);
    }
  }
  return (
    <div style={checklistWrapStyle}>
      {ALL_TOOLS.map((tool) => (
        <label key={tool} style={checkItemStyle} className="text-text-semantic-secondary">
          <input
            type="checkbox"
            checked={all.includes(tool)}
            onChange={() => toggle(tool)}
            style={{ marginRight: 6 }}
          />
          {tool}
        </label>
      ))}
    </div>
  );
}

function McpChecklist({
  servers,
  enabled,
  onChange,
}: {
  servers: string[];
  enabled: string[] | undefined;
  onChange: (servers: string[]) => void;
}): React.ReactElement | null {
  if (servers.length === 0) return null;
  const active = enabled ?? [];
  function toggle(name: string): void {
    if (active.includes(name)) {
      onChange(active.filter((n) => n !== name));
    } else {
      onChange([...active, name]);
    }
  }
  return (
    <div style={checklistWrapStyle}>
      {servers.map((name) => (
        <label key={name} style={checkItemStyle} className="text-text-semantic-secondary">
          <input
            type="checkbox"
            checked={active.includes(name)}
            onChange={() => toggle(name)}
            style={{ marginRight: 6 }}
          />
          {name}
        </label>
      ))}
    </div>
  );
}

// ─── Editor state hook ────────────────────────────────────────────────────────

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
    if (!draft.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await window.electronAPI.profileCrud.upsert(draft as Profile);
      if (!result.success) { setError(result.error ?? 'Save failed'); setSaving(false); return; }
      if (result.profile) onSave(result.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSaving(false);
    }
  }, [draft, onSave]);

  return { draft, saving, error, set, handleSave };
}

// ─── ProfileEditorFields ──────────────────────────────────────────────────────

interface FieldsProps {
  draft: Partial<Profile>;
  mcpServers: string[];
  multiProvider: boolean;
  set: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
}

function ProfileEditorTextFields({ draft, set }: Omit<FieldsProps, 'mcpServers' | 'multiProvider'>): React.ReactElement {
  return (
    <>
      <FieldRow label="Name">
        <input type="text" value={draft.name ?? ''} onChange={(e) => set('name', e.target.value)}
          placeholder="Profile name" className="text-text-semantic-primary"
          style={inputStyle} autoComplete="off" />
      </FieldRow>
      <FieldRow label="Description">
        <input type="text" value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)}
          placeholder="Optional description" className="text-text-semantic-secondary" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Model">
        <input type="text" value={draft.model ?? ''} onChange={(e) => set('model', e.target.value || undefined)}
          placeholder="e.g. claude-sonnet-4-6 (leave blank for default)"
          className="text-text-semantic-secondary" style={inputStyle} />
      </FieldRow>
      <FieldRow label="Effort">
        <SegmentedControl options={EFFORT_OPTIONS} value={draft.effort} onChange={(v) => set('effort', v)} />
      </FieldRow>
      <FieldRow label="Permission">
        <SegmentedControl options={PERMISSION_OPTIONS} value={draft.permissionMode} onChange={(v) => set('permissionMode', v)} />
      </FieldRow>
    </>
  );
}

function ProfileEditorFields({ draft, mcpServers, multiProvider, set }: FieldsProps): React.ReactElement {
  return (
    <>
      <ProfileEditorTextFields draft={draft} set={set} />
      <FieldRow label="System prompt">
        <textarea value={draft.systemPromptAddendum ?? ''} rows={3}
          onChange={(e) => set('systemPromptAddendum', e.target.value || undefined)}
          placeholder="Optional prompt addendum appended to system prompt"
          className="text-text-semantic-secondary" style={textareaStyle} />
      </FieldRow>
      <FieldRow label="Tools">
        <ToolsChecklist enabled={draft.enabledTools} onChange={(tools) => set('enabledTools', tools)} />
      </FieldRow>
      {mcpServers.length > 0 && (
        <FieldRow label="MCP servers">
          <McpChecklist servers={mcpServers} enabled={draft.mcpServers}
            onChange={(servers) => set('mcpServers', servers)} />
        </FieldRow>
      )}
      {multiProvider && (
        <FieldRow label="Provider">
          <ProfileEditorProviderPicker
            value={draft.providerId as ProfileProviderId | undefined}
            onChange={(id) => set('providerId', id)}
          />
        </FieldRow>
      )}
    </>
  );
}

// ─── ProfileEditor ────────────────────────────────────────────────────────────

export function ProfileEditor({ profile, onSave, onCancel }: ProfileEditorProps): React.ReactElement {
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
      {error && <div className="text-status-error" style={errorStyle}>{error}</div>}
      <ProfileEditorFields draft={draft} mcpServers={mcpServers} multiProvider={multiProvider} set={set} />
      <LintWarnings lints={lints} />
      <div style={footerStyle}>
        <button type="button" onClick={onCancel} disabled={saving}
          className="text-text-semantic-muted" style={cancelBtnStyle}>
          Cancel
        </button>
        <button type="button" onClick={() => void handleSave()} disabled={!canSave}
          style={saveBtnStyle(canSave)}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}

