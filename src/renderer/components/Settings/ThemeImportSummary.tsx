/**
 * ThemeImportSummary.tsx — Displays import result: applied/unsupported counts,
 * collapsible unsupported key list, and warnings.
 *
 * Wave 35 Phase C.
 */

import React, { useState } from 'react';

import type { VsCodeThemeImportResult } from '../../themes/vsCodeImport';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ThemeImportSummaryProps {
  result: VsCodeThemeImportResult;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const summaryBoxStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid var(--border-semantic)',
  background: 'var(--surface-inset)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const statRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
};

const statStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-text-semantic-primary)',
};

const statValueStyle: React.CSSProperties = {
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
};

const collapseButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '11px',
  color: 'var(--text-text-semantic-muted)',
  padding: 0,
  textAlign: 'left',
};

const listStyle: React.CSSProperties = {
  margin: '4px 0 0',
  padding: '8px',
  borderRadius: '4px',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  maxHeight: '120px',
  overflowY: 'auto',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-text-semantic-muted)',
  listStyle: 'none',
};

const warningStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--status-warning)',
  fontFamily: 'var(--font-mono)',
  wordBreak: 'break-word',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function UnsupportedKeysList({ keys }: { keys: string[] }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  if (keys.length === 0) return null;

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={collapseButtonStyle} type="button">
        {open ? '▲' : '▼'} {keys.length} unsupported key{keys.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <ul style={listStyle}>
          {keys.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WarningsList({ warnings }: { warnings: string[] }): React.ReactElement | null {
  if (warnings.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {warnings.map((w, i) => (
        <div key={i} style={warningStyle}>{w}</div>
      ))}
    </div>
  );
}

// ── ThemeImportSummary ────────────────────────────────────────────────────────

export function ThemeImportSummary({ result }: ThemeImportSummaryProps): React.ReactElement {
  const total = result.appliedKeys.length + result.unsupportedKeys.length;

  return (
    <div style={summaryBoxStyle}>
      <div style={statRowStyle}>
        <span style={statStyle}>
          <span style={statValueStyle}>{result.appliedKeys.length}</span> of{' '}
          <span style={statValueStyle}>{total}</span> keys applied
        </span>
        {result.unsupportedKeys.length > 0 && (
          <span style={{ ...statStyle, color: 'var(--text-text-semantic-muted)' }}>
            <span style={statValueStyle}>{result.unsupportedKeys.length}</span> unsupported
          </span>
        )}
      </div>
      <UnsupportedKeysList keys={result.unsupportedKeys} />
      <WarningsList warnings={result.warnings} />
    </div>
  );
}
