/**
 * McpSection.tsx - Settings section for MCP server management.
 */

import React from 'react';
import type { McpServerEntry } from '../../types/electron';
import { SectionLabel, buttonStyle } from './settingsStyles';
import type { ServerFormState } from './mcpHelpers';
import { McpServerForm } from './McpServerForm';
import { McpServerRow } from './McpServerRow';
import { type FormHandlers, type McpSectionModel, useMcpSectionModel } from './mcpSectionModel';

export function McpSection(): React.ReactElement {
  const model = useMcpSectionModel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {model.actionError && <div role="alert" style={errorBannerStyle}>{model.actionError}</div>}
      <McpHeader onRefresh={() => void model.refresh()} onAdd={model.startAdd} />
      {model.isAdding && <AddFormWrapper {...buildAddFormProps(model)} />}
      <McpBody {...buildMcpBodyProps(model)} />
      <McpHelpText />
    </div>
  );
}

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

function AddFormWrapper({
  form,
  formHandlers,
  onSubmit,
  onCancel,
}: {
  form: ServerFormState;
  formHandlers: FormHandlers;
  onSubmit: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={addFormHeaderStyle}>New MCP Server</div>
      <McpServerForm form={form} isEdit={false} onFieldChange={formHandlers.onFieldChange} onScopeChange={formHandlers.onScopeChange} onAddEnvRow={formHandlers.onAddEnvRow} onRemoveEnvRow={formHandlers.onRemoveEnvRow} onUpdateEnvRow={formHandlers.onUpdateEnvRow} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}

interface McpBodyProps {
  loading: boolean;
  error: string | null;
  servers: McpServerEntry[];
  isAdding: boolean;
  globalServers: McpServerEntry[];
  projectServers: McpServerEntry[];
  editingServer: string | null;
  confirmDelete: string | null;
  form: ServerFormState;
  formHandlers: FormHandlers;
  onToggle: (server: McpServerEntry) => void;
  onEdit: (server: McpServerEntry) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onConfirmDelete: (name: string, scope: 'global' | 'project') => void;
  onCancelDelete: () => void;
  onUpdate: () => void;
}

function McpBody(props: McpBodyProps): React.ReactElement | null {
  if (props.loading) return <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading MCP servers...</p>;
  if (props.error) return <div style={errorBannerStyle}>{props.error}</div>;
  if (props.servers.length === 0 && !props.isAdding) return <div style={emptyStyle}>No MCP servers configured.</div>;

  return (
    <>
      <ServerGroupList title="Global Servers" servers={props.globalServers} bodyProps={props} />
      <ServerGroupList title="Project Servers" servers={props.projectServers} bodyProps={props} />
    </>
  );
}

function ServerGroupList({
  title,
  servers,
  bodyProps,
}: {
  title: string;
  servers: McpServerEntry[];
  bodyProps: McpBodyProps;
}): React.ReactElement | null {
  if (servers.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
        {servers.map((server, idx) => (
          <McpServerRow
            key={`${server.scope}:${server.name}`}
            server={server}
            isLast={idx === servers.length - 1}
            isEditing={bodyProps.editingServer === server.name && !bodyProps.isAdding}
            isConfirmingDelete={bodyProps.confirmDelete === `${server.scope}:${server.name}`}
            onToggle={() => bodyProps.onToggle(server)}
            onEdit={() => bodyProps.onEdit(server)}
            onCancelEdit={bodyProps.onCancelEdit}
            onDelete={() => bodyProps.onDelete(`${server.scope}:${server.name}`)}
            onConfirmDelete={() => bodyProps.onConfirmDelete(server.name, server.scope)}
            onCancelDelete={bodyProps.onCancelDelete}
            editForm={buildEditForm(bodyProps)}
          />
        ))}
      </div>
    </div>
  );
}

function buildEditForm({
  form,
  formHandlers,
  onUpdate,
  onCancelEdit,
}: Pick<McpBodyProps, 'form' | 'formHandlers' | 'onUpdate' | 'onCancelEdit'>): React.ReactElement {
  return <McpServerForm form={form} isEdit={true} onFieldChange={formHandlers.onFieldChange} onScopeChange={formHandlers.onScopeChange} onAddEnvRow={formHandlers.onAddEnvRow} onRemoveEnvRow={formHandlers.onRemoveEnvRow} onUpdateEnvRow={formHandlers.onUpdateEnvRow} onSubmit={onUpdate} onCancel={onCancelEdit} />;
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

function buildAddFormProps(model: McpSectionModel): {
  form: ServerFormState;
  formHandlers: FormHandlers;
  onSubmit: () => void;
  onCancel: () => void;
} {
  return {
    form: model.form,
    formHandlers: model.formHandlers,
    onSubmit: () => void model.addServer(),
    onCancel: model.cancelForm,
  };
}

function buildMcpBodyProps(model: McpSectionModel): McpBodyProps {
  return {
    loading: model.loading,
    error: model.error,
    servers: model.servers,
    isAdding: model.isAdding,
    globalServers: model.globalServers,
    projectServers: model.projectServers,
    editingServer: model.editingServer,
    confirmDelete: model.confirmDelete,
    form: model.form,
    formHandlers: model.formHandlers,
    onToggle: (server) => void model.toggleServer(server),
    onEdit: model.startEdit,
    onCancelEdit: model.cancelForm,
    onDelete: model.markForDelete,
    onConfirmDelete: (name, scope) => void model.removeServer(name, scope),
    onCancelDelete: model.cancelDelete,
    onUpdate: () => void model.updateServer(),
  };
}

const addFormHeaderStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))',
  borderBottom: '1px solid var(--border)',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text)',
};

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--error)',
  background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
  fontSize: '12px',
  color: 'var(--error)',
};

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  textAlign: 'center',
};

const helpStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.5 };
