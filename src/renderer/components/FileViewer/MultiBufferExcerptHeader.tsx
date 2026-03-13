import React from 'react';
import type { BufferExcerpt } from '../../types/electron';

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  backgroundColor: 'var(--bg-secondary)',
  userSelect: 'none',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
} as const;

const TOGGLE_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: '0 2px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
} as const;

const FILE_LINK_STYLE = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--accent)',
  padding: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  textDecoration: 'underline',
  textAlign: 'left',
} as const;

const LABEL_STYLE = {
  color: 'var(--text)',
  fontSize: '0.75rem',
  backgroundColor: 'var(--bg-tertiary, var(--bg))',
  padding: '1px 6px',
  borderRadius: '3px',
} as const;

const ACTION_BUTTON_STYLE = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: '2px 6px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
} as const;

function getExcerptFilename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function ToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      style={TOGGLE_BUTTON_STYLE}
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      {collapsed ? '\u25B6' : '\u25BC'}
    </button>
  );
}

function FileLinkButton({
  excerpt,
  onOpenFile,
}: {
  excerpt: BufferExcerpt;
  onOpenFile: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onOpenFile}
      style={FILE_LINK_STYLE}
      title={`Open ${excerpt.filePath}`}
    >
      {getExcerptFilename(excerpt.filePath)}
    </button>
  );
}

function ExcerptLabel({ label }: { label?: string }): React.ReactElement | null {
  if (!label) return null;
  return <span style={LABEL_STYLE}>{label}</span>;
}

function ExcerptMeta({ excerpt }: { excerpt: BufferExcerpt }): React.ReactElement {
  return (
    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
      lines {excerpt.startLine}-{excerpt.endLine}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title: string;
}): React.ReactElement {
  return (
    <button onClick={onClick} style={ACTION_BUTTON_STYLE} title={title}>
      {label}
    </button>
  );
}

function ExcerptActions({
  onOpenFile,
  onRemove,
}: {
  onOpenFile: () => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <>
      <div style={{ flex: 1 }} />
      <ActionButton label="Open File" onClick={onOpenFile} title="Open full file" />
      <ActionButton label="Remove" onClick={onRemove} title="Remove excerpt" />
    </>
  );
}

export function MultiBufferExcerptHeader({
  collapsed,
  excerpt,
  onOpenFile,
  onRemove,
  onToggle,
}: {
  collapsed: boolean;
  excerpt: BufferExcerpt;
  onOpenFile: () => void;
  onRemove: () => void;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <div
      style={{ ...HEADER_STYLE, borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
    >
      <ToggleButton collapsed={collapsed} onToggle={onToggle} />
      <FileLinkButton excerpt={excerpt} onOpenFile={onOpenFile} />
      <ExcerptMeta excerpt={excerpt} />
      <ExcerptLabel label={excerpt.label} />
      <ExcerptActions onOpenFile={onOpenFile} onRemove={onRemove} />
    </div>
  );
}
