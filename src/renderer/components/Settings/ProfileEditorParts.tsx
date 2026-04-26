/**
 * ProfileEditorParts.tsx — Presentational sub-components for ProfileEditor.
 *
 * Wave 26 Phase B (extracted per ESLint 300-line / 40-line-function limits).
 */

import React from 'react';

import type { EffortLevel, PermissionMode, Profile, ProfileProviderId } from '../../types/electron';
import { ALL_TOOLS, EFFORT_OPTIONS, PERMISSION_OPTIONS } from './ProfileEditor';
import { ProfileEditorProviderPicker } from './ProfileEditorProviderPicker';
import {
  checkItemStyle,
  checklistWrapStyle,
  fieldRowStyle,
  inputStyle,
  labelStyle,
  segmentActiveStyle,
  segmentedWrapStyle,
  segmentStyle,
  textareaStyle,
} from './profileEditorStyles';

// ─── FieldRow ──────────────────────────────────────────────────────────────────

export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={fieldRowStyle}>
      <label className="text-text-semantic-secondary" style={labelStyle}>
        {label}
      </label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

// ─── SegmentedControl ──────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
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
          className={
            value === opt.value ? 'text-text-semantic-primary' : 'text-text-semantic-muted'
          }
          style={value === opt.value ? segmentActiveStyle : segmentStyle}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── ToolsChecklist ────────────────────────────────────────────────────────────

export function ToolsChecklist({
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

// ─── McpChecklist ──────────────────────────────────────────────────────────────

export function McpChecklist({
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

// ─── FieldsProps ───────────────────────────────────────────────────────────────

export interface FieldsProps {
  draft: Partial<Profile>;
  mcpServers: string[];
  multiProvider: boolean;
  set: <K extends keyof Profile>(key: K, value: Profile[K]) => void;
}

// ─── ProfileEditorTextFieldsTop ────────────────────────────────────────────────

function ProfileEditorTextFieldsTop({
  draft,
  set,
}: Omit<FieldsProps, 'mcpServers' | 'multiProvider'>): React.ReactElement {
  return (
    <>
      <FieldRow label="Name">
        <input
          type="text"
          value={draft.name ?? ''}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Profile name"
          className="text-text-semantic-primary"
          style={inputStyle}
          autoComplete="off"
        />
      </FieldRow>
      <FieldRow label="Description">
        <input
          type="text"
          value={draft.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Optional description"
          className="text-text-semantic-secondary"
          style={inputStyle}
        />
      </FieldRow>
      <FieldRow label="Model">
        <input
          type="text"
          value={draft.model ?? ''}
          onChange={(e) => set('model', e.target.value || undefined)}
          placeholder="e.g. claude-sonnet-4-6 (leave blank for default)"
          className="text-text-semantic-secondary"
          style={inputStyle}
        />
      </FieldRow>
    </>
  );
}

// ─── ProfileEditorTextFieldsBottom ────────────────────────────────────────────

function ProfileEditorTextFieldsBottom({
  draft,
  set,
}: Omit<FieldsProps, 'mcpServers' | 'multiProvider'>): React.ReactElement {
  return (
    <>
      <FieldRow label="Effort">
        <SegmentedControl<EffortLevel>
          options={EFFORT_OPTIONS}
          value={draft.effort}
          onChange={(v) => set('effort', v)}
        />
      </FieldRow>
      <FieldRow label="Permission">
        <SegmentedControl<PermissionMode>
          options={PERMISSION_OPTIONS}
          value={draft.permissionMode}
          onChange={(v) => set('permissionMode', v)}
        />
      </FieldRow>
    </>
  );
}

// ─── ProfileEditorTextFields ───────────────────────────────────────────────────

export function ProfileEditorTextFields({
  draft,
  set,
}: Omit<FieldsProps, 'mcpServers' | 'multiProvider'>): React.ReactElement {
  return (
    <>
      <ProfileEditorTextFieldsTop draft={draft} set={set} />
      <ProfileEditorTextFieldsBottom draft={draft} set={set} />
    </>
  );
}

// ─── ProfileEditorOptionalRows ─────────────────────────────────────────────────

function ProfileEditorOptionalRows({
  draft,
  mcpServers,
  multiProvider,
  set,
}: FieldsProps): React.ReactElement {
  return (
    <>
      {mcpServers.length > 0 && (
        <FieldRow label="MCP servers">
          <McpChecklist
            servers={mcpServers}
            enabled={draft.mcpServers}
            onChange={(servers) => set('mcpServers', servers)}
          />
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

// ─── ProfileEditorFieldsExtras ─────────────────────────────────────────────────

function ProfileEditorFieldsExtras({
  draft,
  mcpServers,
  multiProvider,
  set,
}: FieldsProps): React.ReactElement {
  return (
    <>
      <FieldRow label="System prompt">
        <textarea
          value={draft.systemPromptAddendum ?? ''}
          rows={3}
          onChange={(e) => set('systemPromptAddendum', e.target.value || undefined)}
          placeholder="Optional prompt addendum appended to system prompt"
          className="text-text-semantic-secondary"
          style={textareaStyle}
        />
      </FieldRow>
      <FieldRow label="Tools">
        <ToolsChecklist
          enabled={draft.enabledTools}
          onChange={(tools) => set('enabledTools', tools)}
        />
      </FieldRow>
      <ProfileEditorOptionalRows
        draft={draft}
        mcpServers={mcpServers}
        multiProvider={multiProvider}
        set={set}
      />
    </>
  );
}

// ─── ProfileEditorFields ───────────────────────────────────────────────────────

export function ProfileEditorFields({
  draft,
  mcpServers,
  multiProvider,
  set,
}: FieldsProps): React.ReactElement {
  return (
    <>
      <ProfileEditorTextFields draft={draft} set={set} />
      <ProfileEditorFieldsExtras
        draft={draft}
        mcpServers={mcpServers}
        multiProvider={multiProvider}
        set={set}
      />
    </>
  );
}
