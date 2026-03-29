import React from 'react';

import type { BufferExcerpt } from '../../types/electron';

const HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
} as const;

const TOGGLE_BUTTON_STYLE = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
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
  padding: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  textDecoration: 'underline',
  textAlign: 'left',
} as const;

const LABEL_STYLE = {
  fontSize: '0.75rem',
  backgroundColor: 'var(--surface-raised)',
  padding: '1px 6px',
  borderRadius: '3px',
} as const;

const ACTION_BUTTON_STYLE = {
  background: 'none',
  border: '1px solid var(--border-semantic)',
  borderRadius: '3px',
  cursor: 'pointer',
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
}): React.ReactElement<any> {
  return (
    <button
      onClick={onToggle}
      className="text-text-semantic-muted"
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
}): React.ReactElement<any> {
  return (
    <button
      onClick={onOpenFile}
      className="text-interactive-accent"
      style={FILE_LINK_STYLE}
      title={`Open ${excerpt.filePath}`}
    >
      {getExcerptFilename(excerpt.filePath)}
    </button>
  );
}

function ExcerptLabel({ label }: { label?: string }): React.ReactElement<any> | null {
  if (!label) return null;
  return <span className="text-text-semantic-primary" style={LABEL_STYLE}>{label}</span>;
}

function ExcerptMeta({ excerpt }: { excerpt: BufferExcerpt }): React.ReactElement<any> {
  return (
    <span className="text-text-semantic-muted" style={{ fontSize: '0.75rem' }}>
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
}): React.ReactElement<any> {
  return (
    <button onClick={onClick} className="text-text-semantic-muted" style={ACTION_BUTTON_STYLE} title={title}>
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
}): React.ReactElement<any> {
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
}): React.ReactElement<any> {
  return (
    <div
      style={{ ...HEADER_STYLE, borderBottom: collapsed ? 'none' : '1px solid var(--border-semantic)' }}
    >
      <ToggleButton collapsed={collapsed} onToggle={onToggle} />
      <FileLinkButton excerpt={excerpt} onOpenFile={onOpenFile} />
      <ExcerptMeta excerpt={excerpt} />
      <ExcerptLabel label={excerpt.label} />
      <ExcerptActions onOpenFile={onOpenFile} onRemove={onRemove} />
    </div>
  );
}
