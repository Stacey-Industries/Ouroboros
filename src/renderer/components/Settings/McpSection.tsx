/**
 * McpSection.tsx — Settings section for managing MCP (Model Context Protocol)
 * server configurations used by Claude Code.
 *
 * Reads/writes to ~/.claude/settings.json (global) and
 * <project>/.claude/settings.json (project) via IPC handlers.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { McpServerEntry, McpServerConfig } from '../../types/electron';
import { SectionLabel, buttonStyle, smallButtonStyle } from './settingsStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnvRow {
  key: string;
  value: string;
}

interface ServerFormState {
  name: string;
  command: string;
  args: string;
  url: string;
  envRows: EnvRow[];
  scope: 'global' | 'project';
}

const EMPTY_FORM: ServerFormState = {
  name: '',
  command: '',
  args: '',
  url: '',
  envRows: [],
  scope: 'global',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formToConfig(form: ServerFormState): McpServerConfig {
  const config: McpServerConfig = {};
  if (form.command.trim()) config.command = form.command;

  const args = form.args
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (args.length > 0) config.args = args;

  const env: Record<string, string> = {};
  for (const row of form.envRows) {
    const k = row.key.trim();
    if (k) env[k] = row.value;
  }
  if (Object.keys(env).length > 0) config.env = env;

  if (form.url.trim()) config.url = form.url.trim();

  return config;
}

function configToForm(name: string, entry: McpServerEntry): ServerFormState {
  return {
    name,
    command: entry.config.command ?? '',
    args: (entry.config.args ?? []).join(' '),
    url: entry.config.url ?? '',
    envRows: Object.entries(entry.config.env ?? {}).map(([key, value]) => ({ key, value })),
    scope: entry.scope,
  };
}

function summarizeArgs(args?: string[]): string {
  if (!args || args.length === 0) return '';
  const joined = args.join(' ');
  return joined.length > 60 ? joined.slice(0, 57) + '...' : joined;
}

// ─── McpSection ───────────────────────────────────────────────────────────────

export function McpSection(): React.ReactElement {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [form, setForm] = useState<ServerFormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Fetch servers ──────────────────────────────────────────────────────────

  const fetchServers = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.mcp.getServers();
      if (result.success && result.servers) {
        setServers(result.servers);
      } else {
        setError(result.error ?? 'Failed to load MCP servers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  // ── Clear action error ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 5000);
    return () => clearTimeout(t);
  }, [actionError]);

  // ── Add server ─────────────────────────────────────────────────────────────

  const handleAdd = useCallback(async () => {
    if (!form.name.trim()) {
      setActionError('Server name is required.');
      return;
    }
    if (!form.command.trim() && !form.url.trim()) {
      setActionError('Either command or URL is required.');
      return;
    }

    try {
      const config = formToConfig(form);
      const result = await window.electronAPI.mcp.addServer(form.name.trim(), config, form.scope);
      if (!result.success) {
        setActionError(result.error ?? 'Failed to add server');
        return;
      }
      setIsAdding(false);
      setForm(EMPTY_FORM);
      await fetchServers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add server');
    }
  }, [form, fetchServers]);

  // ── Update server ──────────────────────────────────────────────────────────

  const handleUpdate = useCallback(async () => {
    if (!editingServer) return;
    if (!form.command.trim() && !form.url.trim()) {
      setActionError('Either command or URL is required.');
      return;
    }

    try {
      const config = formToConfig(form);
      const result = await window.electronAPI.mcp.updateServer(editingServer, config, form.scope);
      if (!result.success) {
        setActionError(result.error ?? 'Failed to update server');
        return;
      }
      setEditingServer(null);
      setForm(EMPTY_FORM);
      await fetchServers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update server');
    }
  }, [editingServer, form, fetchServers]);

  // ── Toggle server ──────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (server: McpServerEntry) => {
    try {
      const result = await window.electronAPI.mcp.toggleServer(
        server.name,
        !server.enabled,
        server.scope,
      );
      if (!result.success) {
        setActionError(result.error ?? 'Failed to toggle server');
        return;
      }
      await fetchServers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to toggle server');
    }
  }, [fetchServers]);

  // ── Remove server ──────────────────────────────────────────────────────────

  const handleRemove = useCallback(async (name: string, scope: 'global' | 'project') => {
    try {
      const result = await window.electronAPI.mcp.removeServer(name, scope);
      if (!result.success) {
        setActionError(result.error ?? 'Failed to remove server');
        return;
      }
      setConfirmDelete(null);
      if (editingServer === name) {
        setEditingServer(null);
        setForm(EMPTY_FORM);
      }
      await fetchServers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove server');
    }
  }, [fetchServers, editingServer]);

  // ── Start editing ──────────────────────────────────────────────────────────

  const startEdit = useCallback((server: McpServerEntry) => {
    setIsAdding(false);
    setEditingServer(server.name);
    setForm(configToForm(server.name, server));
  }, []);

  const cancelForm = useCallback(() => {
    setIsAdding(false);
    setEditingServer(null);
    setForm(EMPTY_FORM);
  }, []);

  // ── Env row helpers ────────────────────────────────────────────────────────

  const addEnvRow = () => {
    setForm((f) => ({ ...f, envRows: [...f.envRows, { key: '', value: '' }] }));
  };

  const removeEnvRow = (idx: number) => {
    setForm((f) => ({ ...f, envRows: f.envRows.filter((_, i) => i !== idx) }));
  };

  const updateEnvRow = (idx: number, field: 'key' | 'value', val: string) => {
    setForm((f) => ({
      ...f,
      envRows: f.envRows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
    }));
  };

  // ── Separate global and project servers ────────────────────────────────────

  const globalServers = servers.filter((s) => s.scope === 'global');
  const projectServers = servers.filter((s) => s.scope === 'project');

  // ── Server row renderer ────────────────────────────────────────────────────

  const renderServerRow = (server: McpServerEntry, idx: number, list: McpServerEntry[]) => {
    const isEditing = editingServer === server.name && !isAdding;
    const isConfirmingDelete = confirmDelete === `${server.scope}:${server.name}`;

    return (
      <div key={`${server.scope}:${server.name}`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderBottom: idx < list.length - 1 || isEditing ? '1px solid var(--border)' : 'none',
            background: isEditing
              ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-tertiary))'
              : 'var(--bg-tertiary)',
            gap: '12px',
            transition: 'background 120ms ease',
          }}
        >
          {/* Server info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Status dot */}
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: server.enabled ? '#4ade80' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: server.enabled ? 'var(--text)' : 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {server.name}
              </span>
              {/* Scope badge */}
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  border: '1px solid var(--border)',
                  background: server.scope === 'global'
                    ? 'color-mix(in srgb, var(--accent) 10%, var(--bg))'
                    : 'color-mix(in srgb, #a78bfa 10%, var(--bg))',
                  color: server.scope === 'global' ? 'var(--accent)' : '#a78bfa',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                {server.scope}
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                paddingLeft: '16px',
                fontFamily: 'var(--font-mono)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {server.config.url
                ? server.config.url
                : `${server.config.command} ${summarizeArgs(server.config.args)}`}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {/* Toggle */}
            <button
              onClick={() => void handleToggle(server)}
              title={server.enabled ? 'Disable' : 'Enable'}
              style={{
                ...smallBtnStyle,
                background: server.enabled
                  ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))'
                  : 'var(--bg)',
                color: server.enabled ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {server.enabled ? 'Disable' : 'Enable'}
            </button>
            {/* Edit */}
            <button
              onClick={() => {
                if (isEditing) cancelForm();
                else startEdit(server);
              }}
              title="Edit"
              style={smallBtnStyle}
            >
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            {/* Delete */}
            {isConfirmingDelete ? (
              <>
                <button
                  onClick={() => void handleRemove(server.name, server.scope)}
                  style={{ ...smallBtnStyle, color: '#f87171', borderColor: '#f87171' }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  style={smallBtnStyle}
                >
                  No
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(`${server.scope}:${server.name}`)}
                title="Delete"
                style={{ ...smallBtnStyle, color: '#f87171' }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Inline edit form */}
        {isEditing && renderForm(true)}
      </div>
    );
  };

  // ── Server form (add / edit) ───────────────────────────────────────────────

  const renderForm = (isEdit: boolean) => (
    <div
      style={{
        padding: '14px 16px',
        background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-secondary))',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Name (only when adding) */}
      {!isEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g., filesystem, github"
            style={inputStyle}
            autoFocus
          />
        </div>
      )}

      {/* Command */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Command</label>
        <input
          type="text"
          value={form.command}
          onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
          placeholder="e.g., npx, node, python, uvx"
          style={inputStyle}
        />
      </div>

      {/* Args */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>Arguments (space-separated)</label>
        <input
          type="text"
          value={form.args}
          onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
          placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path"
          style={inputStyle}
        />
      </div>

      {/* URL (optional, for SSE transport) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={labelStyle}>URL (optional, for SSE/HTTP transport)</label>
        <input
          type="text"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="e.g., http://localhost:3001/sse"
          style={inputStyle}
        />
      </div>

      {/* Environment variables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>Environment Variables</label>
          <button onClick={addEnvRow} style={{ ...smallBtnStyle, fontSize: '10px', padding: '2px 8px' }}>
            + Add
          </button>
        </div>
        {form.envRows.length === 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No environment variables configured.
          </span>
        )}
        {form.envRows.map((row, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="text"
              value={row.key}
              onChange={(e) => updateEnvRow(idx, 'key', e.target.value)}
              placeholder="KEY"
              style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>=</span>
            <input
              type="text"
              value={row.value}
              onChange={(e) => updateEnvRow(idx, 'value', e.target.value)}
              placeholder="value"
              style={{ ...inputStyle, flex: 2, fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            />
            <button
              onClick={() => removeEnvRow(idx)}
              style={{ ...smallBtnStyle, color: '#f87171', padding: '2px 6px', fontSize: '12px' }}
              title="Remove"
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* Scope (only when adding) */}
      {!isEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Scope</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="mcp-scope"
                checked={form.scope === 'global'}
                onChange={() => setForm((f) => ({ ...f, scope: 'global' }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Global (~/.claude/settings.json)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="mcp-scope"
                checked={form.scope === 'project'}
                onChange={() => setForm((f) => ({ ...f, scope: 'project' }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Project (.claude/settings.json)
            </label>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={() => void (isEdit ? handleUpdate() : handleAdd())}
          style={{
            ...buttonStyle,
            background: 'var(--accent)',
            color: 'var(--bg)',
            border: 'none',
            fontWeight: 600,
          }}
        >
          {isEdit ? 'Save Changes' : 'Add Server'}
        </button>
        <button onClick={cancelForm} style={buttonStyle}>
          Cancel
        </button>
      </div>
    </div>
  );

  // ── Server list renderer ───────────────────────────────────────────────────

  const renderServerList = (title: string, list: McpServerEntry[]) => {
    if (list.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <SectionLabel>{title}</SectionLabel>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {list.map((server, idx) => renderServerRow(server, idx, list))}
        </div>
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Action error banner */}
      {actionError && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--error)',
            background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
            fontSize: '12px',
            color: 'var(--error)',
          }}
        >
          {actionError}
        </div>
      )}

      {/* Header with Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <SectionLabel style={{ marginBottom: '4px' }}>MCP Servers</SectionLabel>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            Configure Model Context Protocol servers that Claude Code can use as tool providers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => void fetchServers()}
            style={buttonStyle}
          >
            Refresh
          </button>
          <button
            onClick={() => {
              setEditingServer(null);
              setForm(EMPTY_FORM);
              setIsAdding(true);
            }}
            style={{
              ...buttonStyle,
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            + Add Server
          </button>
        </div>
      </div>

      {/* Add form */}
      {isAdding && (
        <div
          style={{
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))',
              borderBottom: '1px solid var(--border)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            New MCP Server
          </div>
          {renderForm(false)}
        </div>
      )}

      {/* Loading / error states */}
      {loading ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading MCP servers...</p>
      ) : error ? (
        <div
          style={{
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--error)',
            background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
            fontSize: '12px',
            color: 'var(--error)',
          }}
        >
          {error}
        </div>
      ) : servers.length === 0 && !isAdding ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            border: '1px dashed var(--border)',
            background: 'var(--bg-tertiary)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            textAlign: 'center',
          }}
        >
          No MCP servers configured. Click "Add Server" to configure one.
        </div>
      ) : (
        <>
          {renderServerList('Global Servers', globalServers)}
          {renderServerList('Project Servers', projectServers)}
        </>
      )}

      {/* Help text */}
      <section>
        <SectionLabel>About MCP Servers</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
          MCP (Model Context Protocol) servers provide additional tools and capabilities to Claude Code.
          Servers can provide file system access, database queries, API integrations, and more.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>Global</strong> servers are available in all projects
          (stored in <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '11px' }}>~/.claude/settings.json</code>).{' '}
          <strong style={{ color: 'var(--text)' }}>Project</strong> servers are specific to the current project
          (stored in <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '11px' }}>.claude/settings.json</code>).
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Changes are written directly to the Claude Code settings files. You may need to restart
          Claude Code sessions for changes to take effect.
        </p>
      </section>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-muted)',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
