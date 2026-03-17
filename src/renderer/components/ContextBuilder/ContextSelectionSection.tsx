/**
 * ContextSelectionSection.tsx — Renders context selection groups with checkboxes.
 */

import React from 'react';
import type { ContextSelectionModel } from './useContextSelectionModel';

interface ContextSelectionSectionProps {
  contextSelection: ContextSelectionModel;
  projectRoot: string;
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  fontFamily: 'var(--font-ui)',
};

const summaryBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  fontSize: '12px',
  color: 'var(--text-muted)',
};

const summaryButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '2px 8px',
  fontSize: '11px',
  color: 'var(--accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

const groupHeaderStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text)',
  margin: '4px 0 2px',
};

const itemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  color: 'var(--text)',
  cursor: 'pointer',
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-muted)',
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '1px 5px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  padding: '8px 0',
};

export function ContextSelectionSection({
  contextSelection,
}: ContextSelectionSectionProps): React.ReactElement {
  const { groups, summary, isSelected, toggleItem, selectAll, clearAll } = contextSelection;

  if (groups.length === 0) {
    return <div style={emptyStyle}>No context groups available.</div>;
  }

  return (
    <div style={sectionStyle}>
      <div style={summaryBarStyle}>
        <span>{summary.selectedCount} of {summary.totalCount} selected</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" style={summaryButtonStyle} onClick={selectAll}>
            Select All
          </button>
          <button type="button" style={summaryButtonStyle} onClick={clearAll}>
            Clear All
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <div style={groupHeaderStyle}>{group.label}</div>
          {group.items.map((item) => {
            const checked = isSelected(group.label, item.label);
            return (
              <label
                key={item.label}
                style={itemRowStyle}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(group.label, item.label)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>{item.label}</span>
                <span style={typeBadgeStyle}>{item.type}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
