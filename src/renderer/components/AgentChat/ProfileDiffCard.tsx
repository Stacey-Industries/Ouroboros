/**
 * ProfileDiffCard.tsx — Compact diff card shown when the active profile changes
 * mid-thread.
 *
 * Wave 26 Phase B.
 *
 * Renders a dismissable inline card comparing old vs new profile values.
 * Only rows that differ are shown. Empty diff (identical profiles) renders
 * nothing.
 */

import React from 'react';

import type { Profile } from '../../types/electron';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProfileDiffCardProps {
  oldProfile: Profile;
  newProfile: Profile;
  onDismiss: () => void;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

interface DiffRow {
  field: string;
  from: string;
  to: string;
}

function addScalarRow(
  rows: DiffRow[],
  field: string,
  from: string | undefined,
  to: string | undefined,
): void {
  if (from !== to) rows.push({ field, from: from ?? '—', to: to ?? '—' });
}

function addArrDiffRows(rows: DiffRow[], field: string, a: string[], b: string[]): void {
  const added = b.filter((x) => !a.includes(x));
  const removed = a.filter((x) => !b.includes(x));
  if (added.length > 0) rows.push({ field: `${field} added`, from: '', to: added.join(', ') });
  if (removed.length > 0) rows.push({ field: `${field} removed`, from: removed.join(', '), to: '' });
}

function buildDiffRows(oldP: Profile, newP: Profile): DiffRow[] {
  const rows: DiffRow[] = [];
  addScalarRow(rows, 'Model', oldP.model, newP.model);
  addScalarRow(rows, 'Effort', oldP.effort, newP.effort);
  addScalarRow(rows, 'Permission', oldP.permissionMode, newP.permissionMode);
  addScalarRow(rows, 'Temperature', oldP.temperature?.toString(), newP.temperature?.toString());
  addScalarRow(rows, 'Max tokens', oldP.maxTokens?.toString(), newP.maxTokens?.toString());
  addArrDiffRows(rows, 'Tools', oldP.enabledTools ?? [], newP.enabledTools ?? []);
  addArrDiffRows(rows, 'MCP', oldP.mcpServers ?? [], newP.mcpServers ?? []);
  return rows;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DiffRowItem({ row }: { row: DiffRow }): React.ReactElement {
  return (
    <div style={diffRowStyle}>
      <span className="text-text-semantic-muted" style={fieldStyle}>{row.field}</span>
      {row.from && (
        <span className="text-status-error" style={fromStyle}>{row.from}</span>
      )}
      {row.from && row.to && (
        <span className="text-text-semantic-faint" style={arrowStyle}>→</span>
      )}
      {row.to && (
        <span className="text-status-success" style={toStyle}>{row.to}</span>
      )}
    </div>
  );
}

// ─── ProfileDiffCard ──────────────────────────────────────────────────────────

export function ProfileDiffCard({
  oldProfile,
  newProfile,
  onDismiss,
}: ProfileDiffCardProps): React.ReactElement | null {
  const rows = buildDiffRows(oldProfile, newProfile);

  if (rows.length === 0) return null;

  return (
    <div style={cardStyle} role="status" aria-label="Profile switched">
      <div style={headerStyle}>
        <span className="text-text-semantic-secondary" style={titleStyle}>
          Profile switched:{' '}
          <span className="text-text-semantic-primary">{oldProfile.name}</span>
          {' → '}
          <span className="text-interactive-accent">{newProfile.name}</span>
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss profile diff"
          className="text-text-semantic-faint"
          style={dismissStyle}
        >
          ×
        </button>
      </div>
      <div style={bodyStyle}>
        {rows.map((row) => (
          <DiffRowItem key={row.field} row={row} />
        ))}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  margin: '4px 12px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-inset)',
  fontSize: '12px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '8px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '12px',
  fontFamily: 'var(--font-ui)',
};

const dismissStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  lineHeight: 1,
  padding: '0 2px',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const diffRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
};

const fieldStyle: React.CSSProperties = {
  width: '100px',
  flexShrink: 0,
  fontFamily: 'var(--font-ui)',
};

const fromStyle: React.CSSProperties = {
  textDecoration: 'line-through',
  opacity: 0.8,
};

const arrowStyle: React.CSSProperties = { flexShrink: 0 };

const toStyle: React.CSSProperties = {};
