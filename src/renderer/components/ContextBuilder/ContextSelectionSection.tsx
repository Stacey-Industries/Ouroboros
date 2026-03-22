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
  fontSize: '12px',
};

const summaryButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '2px 8px',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};

const groupHeaderStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  margin: '4px 0 2px',
};

const itemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  cursor: 'pointer',
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  fontFamily: 'var(--font-mono)',
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '1px 5px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
  padding: '8px 0',
};

export function ContextSelectionSection({
  contextSelection,
}: ContextSelectionSectionProps): React.ReactElement {
  const { groups, summary, isSelected, toggleItem, selectAll, clearAll } = contextSelection;

  if (groups.length === 0) {
    return <div className="text-text-semantic-muted" style={emptyStyle}>No context groups available.</div>;
  }

  return (
    <div style={sectionStyle}>
      <div className="bg-surface-raised border border-border-semantic text-text-semantic-muted" style={summaryBarStyle}>
        <span>{summary.selectedCount} of {summary.totalCount} selected</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" className="text-interactive-accent" style={summaryButtonStyle} onClick={selectAll}>
            Select All
          </button>
          <button type="button" className="text-interactive-accent" style={summaryButtonStyle} onClick={clearAll}>
            Clear All
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-text-semantic-primary" style={groupHeaderStyle}>{group.label}</div>
          {group.items.map((item) => {
            const checked = isSelected(group.label, item.label);
            return (
              <label
                key={item.label}
                className="text-text-semantic-primary"
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
                <span className="text-text-semantic-muted" style={typeBadgeStyle}>{item.type}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
