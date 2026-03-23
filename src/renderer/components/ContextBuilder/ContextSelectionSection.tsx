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
  border: '1px solid var(--border-default)',
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
  backgroundColor: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  borderRadius: '3px',
  padding: '1px 5px',
};

const emptyStyle: React.CSSProperties = {
  fontSize: '12px',
  fontStyle: 'italic',
  padding: '8px 0',
};

function SummaryBar({
  summary,
  selectAll,
  clearAll,
}: {
  summary: ContextSelectionModel['summary'];
  selectAll: () => void;
  clearAll: () => void;
}): React.ReactElement {
  return (
    <div
      className="bg-surface-raised border border-border-semantic text-text-semantic-muted"
      style={summaryBarStyle}
    >
      <span>
        {summary.selectedCount} of {summary.totalCount} selected
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          className="text-interactive-accent"
          style={summaryButtonStyle}
          onClick={selectAll}
        >
          Select All
        </button>
        <button
          type="button"
          className="text-interactive-accent"
          style={summaryButtonStyle}
          onClick={clearAll}
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

function GroupItemRow({
  groupLabel,
  item,
  checked,
  toggleItem,
}: {
  groupLabel: string;
  item: { label: string; type: string };
  checked: boolean;
  toggleItem: (g: string, i: string) => void;
}): React.ReactElement {
  return (
    <label
      className="text-text-semantic-primary"
      style={itemRowStyle}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => toggleItem(groupLabel, item.label)}
        style={{ accentColor: 'var(--interactive-accent)' }}
      />
      <span>{item.label}</span>
      <span className="text-text-semantic-muted" style={typeBadgeStyle}>
        {item.type}
      </span>
    </label>
  );
}

export function ContextSelectionSection({
  contextSelection,
}: ContextSelectionSectionProps): React.ReactElement {
  const { groups, summary, isSelected, toggleItem, selectAll, clearAll } = contextSelection;

  if (groups.length === 0) {
    return (
      <div className="text-text-semantic-muted" style={emptyStyle}>
        No context groups available.
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <SummaryBar summary={summary} selectAll={selectAll} clearAll={clearAll} />
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-text-semantic-primary" style={groupHeaderStyle}>
            {group.label}
          </div>
          {group.items.map((item) => (
            <GroupItemRow
              key={item.label}
              groupLabel={group.label}
              item={item}
              checked={isSelected(group.label, item.label)}
              toggleItem={toggleItem}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
