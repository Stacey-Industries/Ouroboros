/**
 * McpServerRow.tsx — A single MCP server row in the list.
 */

import React from 'react';

import type { McpServerEntry } from '../../types/electron';
import { smallBtnStyle,summarizeArgs } from './mcpHelpers';

interface McpServerRowProps {
  server: McpServerEntry;
  isLast: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  editForm: React.ReactNode;
}

export function McpServerRow({
  server, isLast, isEditing, isConfirmingDelete,
  onToggle, onEdit, onCancelEdit,
  onDelete, onConfirmDelete, onCancelDelete,
  editForm,
}: McpServerRowProps): React.ReactElement {
  return (
    <div>
      <div style={rowStyle(isEditing, isLast)}>
        <ServerInfo server={server} />
        <ServerControls
          server={server} isEditing={isEditing} isConfirmingDelete={isConfirmingDelete}
          onToggle={onToggle} onEdit={onEdit} onCancelEdit={onCancelEdit}
          onDelete={onDelete} onConfirmDelete={onConfirmDelete} onCancelDelete={onCancelDelete}
        />
      </div>
      {isEditing && editForm}
    </div>
  );
}

function ServerInfo({ server }: { server: McpServerEntry }): React.ReactElement {
  return (
    <div style={infoStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={dotStyle(server.enabled)} />
        <span style={nameStyle(server.enabled)}>{server.name}</span>
        <ScopeBadge scope={server.scope} />
      </div>
      <div className="text-text-semantic-muted" style={commandStyle}>
        {server.config.url ?? `${server.config.command} ${summarizeArgs(server.config.args)}`}
      </div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }): React.ReactElement {
  const isGlobal = scope === 'global';
  return (
    <span style={{
      fontSize: '10px', padding: '1px 5px', borderRadius: '3px',
      border: '1px solid var(--border)',
      background: isGlobal ? 'color-mix(in srgb, var(--accent) 10%, var(--bg))' : 'color-mix(in srgb, #a78bfa 10%, var(--bg))',
      color: isGlobal ? 'var(--accent)' : '#a78bfa',
      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {scope}
    </span>
  );
}

function ServerControls({ server, isEditing, isConfirmingDelete, onToggle, onEdit, onCancelEdit, onDelete, onConfirmDelete, onCancelDelete }: {
  server: McpServerEntry; isEditing: boolean; isConfirmingDelete: boolean;
  onToggle: () => void; onEdit: () => void; onCancelEdit: () => void;
  onDelete: () => void; onConfirmDelete: () => void; onCancelDelete: () => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <button onClick={onToggle} title={server.enabled ? 'Disable' : 'Enable'} style={toggleBtnStyle(server.enabled)}>
        {server.enabled ? 'Disable' : 'Enable'}
      </button>
      <button onClick={isEditing ? onCancelEdit : onEdit} title="Edit" style={smallBtnStyle}>
        {isEditing ? 'Cancel' : 'Edit'}
      </button>
      {isConfirmingDelete ? (
        <>
          <button onClick={onConfirmDelete} className="text-status-error" style={{ ...smallBtnStyle, borderColor: '#f87171' }}>Confirm</button>
          <button onClick={onCancelDelete} style={smallBtnStyle}>No</button>
        </>
      ) : (
        <button onClick={onDelete} title="Delete" className="text-status-error" style={smallBtnStyle}>Delete</button>
      )}
    </div>
  );
}

function rowStyle(isEditing: boolean, isLast: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: !isLast || isEditing ? '1px solid var(--border)' : 'none',
    background: isEditing ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-tertiary))' : 'var(--bg-tertiary)',
    gap: '12px', transition: 'background 120ms ease',
  };
}

const infoStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 };

function dotStyle(enabled: boolean): React.CSSProperties {
  return { width: '8px', height: '8px', borderRadius: '50%', background: enabled ? '#4ade80' : 'var(--text-muted)', flexShrink: 0 };
}

function nameStyle(enabled: boolean): React.CSSProperties {
  return { fontSize: '13px', fontWeight: 500, color: enabled ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

const commandStyle: React.CSSProperties = {
  fontSize: '11px', paddingLeft: '16px',
  fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function toggleBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    ...smallBtnStyle,
    background: enabled ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))' : 'var(--bg)',
    color: enabled ? 'var(--accent)' : 'var(--text-muted)',
  };
}
