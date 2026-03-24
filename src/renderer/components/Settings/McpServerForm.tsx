/**
 * McpServerForm.tsx — Add/edit form for MCP servers.
 */

import React from 'react';

import type { ServerFormState } from './mcpHelpers';
import { inputStyle, labelStyle, smallBtnStyle } from './mcpHelpers';
import { buttonStyle } from './settingsStyles';

interface McpServerFormProps {
  form: ServerFormState;
  isEdit: boolean;
  onFieldChange: (field: keyof ServerFormState, value: string) => void;
  onScopeChange: (scope: 'global' | 'project') => void;
  onAddEnvRow: () => void;
  onRemoveEnvRow: (idx: number) => void;
  onUpdateEnvRow: (idx: number, field: 'key' | 'value', val: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function FormFields({
  form,
  isEdit,
  onFieldChange,
}: Pick<McpServerFormProps, 'form' | 'isEdit' | 'onFieldChange'>): React.ReactElement {
  return (
    <>
      {!isEdit && (
        <FormField
          label="Name"
          value={form.name}
          field="name"
          onChange={onFieldChange}
          placeholder="e.g., filesystem, github"
          autoFocus
        />
      )}
      <FormField
        label="Command"
        value={form.command}
        field="command"
        onChange={onFieldChange}
        placeholder="e.g., npx, node, python"
      />
      <FormField
        label="Arguments (space-separated)"
        value={form.args}
        field="args"
        onChange={onFieldChange}
        placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path"
      />
      <FormField
        label="URL (optional, for SSE/HTTP)"
        value={form.url}
        field="url"
        onChange={onFieldChange}
        placeholder="e.g., http://localhost:3001/sse"
      />
    </>
  );
}

export function McpServerForm({
  form,
  isEdit,
  onFieldChange,
  onScopeChange,
  onAddEnvRow,
  onRemoveEnvRow,
  onUpdateEnvRow,
  onSubmit,
  onCancel,
}: McpServerFormProps): React.ReactElement {
  return (
    <div style={formContainerStyle}>
      <FormFields form={form} isEdit={isEdit} onFieldChange={onFieldChange} />
      <EnvRowsEditor
        rows={form.envRows}
        onAdd={onAddEnvRow}
        onRemove={onRemoveEnvRow}
        onUpdate={onUpdateEnvRow}
      />
      {!isEdit && <ScopeSelector scope={form.scope} onChange={onScopeChange} />}
      <FormActions isEdit={isEdit} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}

function FormField({
  label,
  value,
  field,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  field: keyof ServerFormState;
  onChange: (field: keyof ServerFormState, value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label className="text-text-semantic-secondary" style={labelStyle}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className="text-text-semantic-primary"
        style={inputStyle}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function EnvRowsEditor({
  rows,
  onAdd,
  onRemove,
  onUpdate,
}: {
  rows: { key: string; value: string }[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, field: 'key' | 'value', val: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label className="text-text-semantic-secondary" style={labelStyle}>
          Environment Variables
        </label>
        <button
          onClick={onAdd}
          className="text-text-semantic-muted"
          style={{ ...smallBtnStyle, fontSize: '10px', padding: '2px 8px' }}
        >
          + Add
        </button>
      </div>
      {rows.length === 0 && (
        <span className="text-text-semantic-muted" style={emptyEnvStyle}>
          No environment variables configured.
        </span>
      )}
      {rows.map((row, idx) => (
        <EnvRowInput key={idx} row={row} idx={idx} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </div>
  );
}

function EnvRowInput({
  row,
  idx,
  onUpdate,
  onRemove,
}: {
  row: { key: string; value: string };
  idx: number;
  onUpdate: (idx: number, field: 'key' | 'value', val: string) => void;
  onRemove: (idx: number) => void;
}): React.ReactElement {
  const monoInput: React.CSSProperties = {
    ...inputStyle,
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  };
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <input
        type="text"
        value={row.key}
        onChange={(e) => onUpdate(idx, 'key', e.target.value)}
        placeholder="KEY"
        className="text-text-semantic-primary"
        style={{ ...monoInput, flex: 1 }}
      />
      <span className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
        =
      </span>
      <input
        type="text"
        value={row.value}
        onChange={(e) => onUpdate(idx, 'value', e.target.value)}
        placeholder="value"
        className="text-text-semantic-primary"
        style={{ ...monoInput, flex: 2 }}
      />
      <button
        onClick={() => onRemove(idx)}
        className="text-status-error"
        style={{ ...smallBtnStyle, padding: '2px 6px', fontSize: '12px' }}
        title="Remove"
      >
        x
      </button>
    </div>
  );
}

function ScopeSelector({
  scope,
  onChange,
}: {
  scope: 'global' | 'project';
  onChange: (s: 'global' | 'project') => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label className="text-text-semantic-secondary" style={labelStyle}>
        Scope
      </label>
      <div style={{ display: 'flex', gap: '12px' }}>
        <ScopeRadio
          label="Global (~/.claude/settings.json)"
          checked={scope === 'global'}
          onChange={() => onChange('global')}
        />
        <ScopeRadio
          label="Project (.claude/settings.json)"
          checked={scope === 'project'}
          onChange={() => onChange('project')}
        />
      </div>
    </div>
  );
}

function ScopeRadio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}): React.ReactElement {
  return (
    <label style={radioLabelStyle}>
      <input
        type="radio"
        name="mcp-scope"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: 'var(--interactive-accent)' }}
      />
      {label}
    </label>
  );
}

function FormActions({
  isEdit,
  onSubmit,
  onCancel,
}: {
  isEdit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
      <button
        onClick={onSubmit}
        className="text-text-semantic-on-accent"
        style={{
          ...buttonStyle,
          background: 'var(--interactive-accent)',
          border: 'none',
          fontWeight: 600,
        }}
      >
        {isEdit ? 'Save Changes' : 'Add Server'}
      </button>
      <button onClick={onCancel} className="text-text-semantic-primary" style={buttonStyle}>
        Cancel
      </button>
    </div>
  );
}

const formContainerStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: 'color-mix(in srgb, var(--interactive-accent) 4%, var(--surface-panel))',
  borderBottom: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const emptyEnvStyle: React.CSSProperties = { fontSize: '11px', fontStyle: 'italic' };
const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  cursor: 'pointer',
};
