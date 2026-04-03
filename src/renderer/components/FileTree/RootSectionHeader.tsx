/**
 * RootSectionHeader — collapsible header row for a project root.
 */

import React from 'react';

import { basename } from './fileTreeUtils';
import { FolderIcon } from './FolderIcon';

export interface RootSectionHeaderProps {
  root: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function RootSectionHeader({
  root,
  isExpanded,
  onToggle,
  onRemove,
  onContextMenu,
}: RootSectionHeaderProps): React.ReactElement {
  return (
    <div
      className="bg-surface-raised"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        gap: '4px',
        cursor: 'pointer',
        userSelect: 'none',
        borderBottom: '1px solid var(--border-subtle)',
        minHeight: '26px',
      }}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onToggle();
      }}
      aria-expanded={isExpanded}
      aria-label={`Toggle ${basename(root)}`}
    >
      <CollapseChevron expanded={isExpanded} />
      <span className="text-text-semantic-muted" style={{ flexShrink: 0 }}>
        <FolderIcon />
      </span>
      <RootLabel root={root} />
      {onRemove && <RemoveButton root={root} onRemove={onRemove} />}
    </div>
  );
}

function CollapseChevron({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="text-text-semantic-faint"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 150ms',
      }}
    >
      <path
        d="M3 2L7 5L3 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RootLabel({ root }: { root: string }): React.ReactElement {
  return (
    <span
      className="text-text-semantic-muted"
      style={{
        flex: 1,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={root}
    >
      {basename(root)}
    </span>
  );
}

function RemoveButton({
  root,
  onRemove,
}: {
  root: string;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      title={`Remove "${basename(root)}" from workspace`}
      className="text-text-semantic-faint"
      style={{
        flexShrink: 0,
        background: 'none',
        border: 'none',
        padding: '2px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        borderRadius: '3px',
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.color = 'var(--status-error)')
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)')
      }
      aria-label={`Remove ${basename(root)} from workspace`}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
