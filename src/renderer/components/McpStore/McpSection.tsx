/**
 * McpSection.tsx - Settings section for MCP server management.
 */

import React, { useEffect } from 'react';

import type { McpServerEntry } from '../../types/electron';
import { buttonStyle, SectionLabel } from '../Settings/settingsStyles';
import type { ServerFormState } from './mcpHelpers';
import { type FormHandlers, type McpSectionModel, useMcpSectionModel } from './mcpSectionModel';
import { McpServerForm } from './McpServerForm';
import { McpServerRow } from './McpServerRow';

interface McpSectionProps {
  onRegisterRefresh?: (fn: () => void) => void;
}

export function McpSection({
  onRegisterRefresh,
}: McpSectionProps = {}): React.ReactElement {
  const model = useMcpSectionModel();
  const refresh = model.refresh;

  useEffect(() => {
    onRegisterRefresh?.(() => void refresh());
  }, [onRegisterRefresh, refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {model.actionError && (
        <div role="alert" className="text-status-error" style={errorBannerStyle}>
          {model.actionError}
        </div>
      )}
      <McpHeader onAdd={model.startAdd} />
      {model.isAdding && <AddFormWrapper {...buildAddFormProps(model)} />}
      <McpBody {...buildMcpBodyProps(model)} />
    </div>
  );
}

function McpHeader({
  onAdd,
}: {
  onAdd: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>Configured Servers</SectionLabel>
        <p className="text-text-semantic-muted" style={{ fontSize: '12px', margin: 0 }}>
          Global and project-scoped MCP servers.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={onAdd}
          className="text-text-semantic-on-accent"
          style={{
            ...buttonStyle,
            background: 'var(--interactive-accent)',
            border: 'none',
            fontWeight: 600,
          }}
        >
          + Add Server
        </button>
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
    <div
      style={{
        border: '1px solid var(--interactive-accent)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div className="text-text-semantic-primary" style={addFormHeaderStyle}>
        New MCP Server
      </div>
      <McpServerForm
        form={form}
        isEdit={false}
        onFieldChange={formHandlers.onFieldChange}
        onScopeChange={formHandlers.onScopeChange}
        onAddEnvRow={formHandlers.onAddEnvRow}
        onRemoveEnvRow={formHandlers.onRemoveEnvRow}
        onUpdateEnvRow={formHandlers.onUpdateEnvRow}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
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
  if (props.loading)
    return (
      <p className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
        Loading MCP servers...
      </p>
    );
  if (props.error)
    return (
      <div className="text-status-error" style={errorBannerStyle}>
        {props.error}
      </div>
    );
  if (props.servers.length === 0 && !props.isAdding)
    return (
      <div className="text-text-semantic-muted" style={emptyStyle}>
        No MCP servers configured.
      </div>
    );

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
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
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
  return (
    <McpServerForm
      form={form}
      isEdit={true}
      onFieldChange={formHandlers.onFieldChange}
      onScopeChange={formHandlers.onScopeChange}
      onAddEnvRow={formHandlers.onAddEnvRow}
      onRemoveEnvRow={formHandlers.onRemoveEnvRow}
      onUpdateEnvRow={formHandlers.onUpdateEnvRow}
      onSubmit={onUpdate}
      onCancel={onCancelEdit}
    />
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
  background: 'color-mix(in srgb, var(--interactive-accent) 10%, var(--surface-panel))',
  borderBottom: '1px solid var(--border-default)',
  fontSize: '12px',
  fontWeight: 600,
};

const errorBannerStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--status-error)',
  background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
  fontSize: '12px',
};

const emptyStyle: React.CSSProperties = {
  padding: '16px',
  borderRadius: '6px',
  border: '1px dashed var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontStyle: 'italic',
  textAlign: 'center',
};
