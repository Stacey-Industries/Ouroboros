/**
 * McpSection.tsx — Settings section for MCP server management.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { McpServerEntry } from '../../types/electron';
import { SectionLabel, buttonStyle } from './settingsStyles';
import { EMPTY_FORM, formToConfig, configToForm, type ServerFormState } from './mcpHelpers';
import { McpServerForm } from './McpServerForm';
import { McpServerRow } from './McpServerRow';

export function McpSection(): React.ReactElement {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setLoading(true); setError(null);
    try {
      const result = await window.electronAPI.mcp.getServers();
      if (result.success && result.servers) setServers(result.servers);
      else setError(result.error ?? 'Failed to load MCP servers');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchServers(); }, [fetchServers]);
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) { setActionError('Server name is required.'); return; }
    if (!form.command.trim() && !form.url.trim()) { setActionError('Either command or URL is required.'); return; }
    try {
      const r = await window.electronAPI.mcp.addServer(form.name.trim(), formToConfig(form), form.scope);
      if (!r.success) { setActionError(r.error ?? 'Failed to add server'); return; }
      setIsAdding(false); setForm(EMPTY_FORM); await fetchServers();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed to add server'); }
  }, [form, fetchServers]);

  const handleUpdate = useCallback(async () => {
    if (!editingServer) return;
    if (!form.command.trim() && !form.url.trim()) { setActionError('Either command or URL is required.'); return; }
    try {
      const r = await window.electronAPI.mcp.updateServer(editingServer, formToConfig(form), form.scope);
      if (!r.success) { setActionError(r.error ?? 'Failed to update server'); return; }
      setEditingServer(null); setForm(EMPTY_FORM); await fetchServers();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed to update server'); }
  }, [editingServer, form, fetchServers]);

  const handleToggle = useCallback(async (s: McpServerEntry) => {
    try {
      const r = await window.electronAPI.mcp.toggleServer(s.name, !s.enabled, s.scope);
      if (!r.success) { setActionError(r.error ?? 'Failed to toggle'); return; }
      await fetchServers();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed to toggle'); }
  }, [fetchServers]);

  const handleRemove = useCallback(async (name: string, scope: 'global' | 'project') => {
    try {
      const r = await window.electronAPI.mcp.removeServer(name, scope);
      if (!r.success) { setActionError(r.error ?? 'Failed to remove'); return; }
      setConfirmDelete(null);
      if (editingServer === name) { setEditingServer(null); setForm(EMPTY_FORM); }
      await fetchServers();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Failed to remove'); }
  }, [fetchServers, editingServer]);

  const cancelForm = useCallback(() => { setIsAdding(false); setEditingServer(null); setForm(EMPTY_FORM); }, []);

  const formHandlers = buildFormHandlers(setForm);

  const globalServers = servers.filter((s) => s.scope === 'global');
  const projectServers = servers.filter((s) => s.scope === 'project');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {actionError && <div role="alert" style={errorBannerStyle}>{actionError}</div>}
      <McpHeader onRefresh={() => void fetchServers()} onAdd={() => { setEditingServer(null); setForm(EMPTY_FORM); setIsAdding(true); }} />
      {isAdding && <AddFormWrapper form={form} formHandlers={formHandlers} onSubmit={() => void handleAdd()} onCancel={cancelForm} />}
      <McpBody
        loading={loading} error={error} servers={servers} isAdding={isAdding}
        globalServers={globalServers} projectServers={projectServers}
        editingServer={editingServer} confirmDelete={confirmDelete}
        form={form} formHandlers={formHandlers}
        onToggle={handleToggle} onEdit={(s) => { setIsAdding(false); setEditingServer(s.name); setForm(configToForm(s.name, s)); }}
        onCancelEdit={cancelForm} onDelete={setConfirmDelete} onConfirmDelete={handleRemove}
        onCancelDelete={() => setConfirmDelete(null)} onUpdate={() => void handleUpdate()}
      />
      <McpHelpText />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function McpHeader({ onRefresh, onAdd }: { onRefresh: () => void; onAdd: () => void }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>MCP Servers</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Configure MCP servers for Claude Code.</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={onRefresh} style={buttonStyle}>Refresh</button>
        <button onClick={onAdd} style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--bg)', border: 'none', fontWeight: 600 }}>+ Add Server</button>
      </div>
    </div>
  );
}

function AddFormWrapper({ form, formHandlers, onSubmit, onCancel }: {
  form: ServerFormState; formHandlers: FormHandlers; onSubmit: () => void; onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
        New MCP Server
      </div>
      <McpServerForm form={form} isEdit={false} onFieldChange={formHandlers.onFieldChange} onScopeChange={formHandlers.onScopeChange} onAddEnvRow={formHandlers.onAddEnvRow} onRemoveEnvRow={formHandlers.onRemoveEnvRow} onUpdateEnvRow={formHandlers.onUpdateEnvRow} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}

function McpBody(props: {
  loading: boolean; error: string | null; servers: McpServerEntry[]; isAdding: boolean;
  globalServers: McpServerEntry[]; projectServers: McpServerEntry[];
  editingServer: string | null; confirmDelete: string | null;
  form: ServerFormState; formHandlers: FormHandlers;
  onToggle: (s: McpServerEntry) => void; onEdit: (s: McpServerEntry) => void;
  onCancelEdit: () => void; onDelete: (id: string) => void;
  onConfirmDelete: (name: string, scope: 'global' | 'project') => void;
  onCancelDelete: () => void; onUpdate: () => void;
}): React.ReactElement | null {
  if (props.loading) return <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading MCP servers...</p>;
  if (props.error) return <div style={errorBannerStyle}>{props.error}</div>;
  if (props.servers.length === 0 && !props.isAdding) return <div style={emptyStyle}>No MCP servers configured.</div>;

  const renderList = (title: string, list: McpServerEntry[]): React.ReactElement | null => {
    if (list.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionLabel>{title}</SectionLabel>
        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          {list.map((s, idx) => (
            <McpServerRow
              key={`${s.scope}:${s.name}`} server={s} isLast={idx === list.length - 1}
              isEditing={props.editingServer === s.name && !props.isAdding}
              isConfirmingDelete={props.confirmDelete === `${s.scope}:${s.name}`}
              onToggle={() => void props.onToggle(s)} onEdit={() => props.onEdit(s)} onCancelEdit={props.onCancelEdit}
              onDelete={() => props.onDelete(`${s.scope}:${s.name}`)}
              onConfirmDelete={() => void props.onConfirmDelete(s.name, s.scope)}
              onCancelDelete={props.onCancelDelete}
              editForm={<McpServerForm form={props.form} isEdit={true} onFieldChange={props.formHandlers.onFieldChange} onScopeChange={props.formHandlers.onScopeChange} onAddEnvRow={props.formHandlers.onAddEnvRow} onRemoveEnvRow={props.formHandlers.onRemoveEnvRow} onUpdateEnvRow={props.formHandlers.onUpdateEnvRow} onSubmit={props.onUpdate} onCancel={props.onCancelEdit} />}
            />
          ))}
        </div>
      </div>
    );
  };

  return <>{renderList('Global Servers', props.globalServers)}{renderList('Project Servers', props.projectServers)}</>;
}

function McpHelpText(): React.ReactElement {
  return (
    <section>
      <SectionLabel>About MCP Servers</SectionLabel>
      <p style={helpStyle}>MCP servers provide additional tools and capabilities to Claude Code.</p>
      <p style={helpStyle}>
        <strong style={{ color: 'var(--text)' }}>Global</strong> servers are available in all projects.{' '}
        <strong style={{ color: 'var(--text)' }}>Project</strong> servers are specific to the current project.
      </p>
      <p style={{ ...helpStyle, margin: 0 }}>Changes are written directly to Claude Code settings files.</p>
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FormHandlers {
  onFieldChange: (field: keyof ServerFormState, value: string) => void;
  onScopeChange: (scope: 'global' | 'project') => void;
  onAddEnvRow: () => void;
  onRemoveEnvRow: (idx: number) => void;
  onUpdateEnvRow: (idx: number, field: 'key' | 'value', val: string) => void;
}

function buildFormHandlers(setForm: React.Dispatch<React.SetStateAction<ServerFormState>>): FormHandlers {
  return {
    onFieldChange: (field, value) => setForm((f) => ({ ...f, [field]: value })),
    onScopeChange: (scope) => setForm((f) => ({ ...f, scope })),
    onAddEnvRow: () => setForm((f) => ({ ...f, envRows: [...f.envRows, { key: '', value: '' }] })),
    onRemoveEnvRow: (idx) => setForm((f) => ({ ...f, envRows: f.envRows.filter((_, i) => i !== idx) })),
    onUpdateEnvRow: (idx, field, val) => setForm((f) => ({
      ...f, envRows: f.envRows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
    })),
  };
}

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
  fontSize: '12px', color: 'var(--error)',
};

const emptyStyle: React.CSSProperties = {
  padding: '16px', borderRadius: '6px', border: '1px dashed var(--border)',
  background: 'var(--bg-tertiary)', fontSize: '12px', color: 'var(--text-muted)',
  fontStyle: 'italic', textAlign: 'center',
};

const helpStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.5 };
