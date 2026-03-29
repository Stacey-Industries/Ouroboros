/**
 * LayoutListItem.tsx — Single layout row in the LayoutSwitcher dropdown.
 * Extracted from LayoutSwitcher.tsx.
 */

import React from 'react';

import type { WorkspaceLayout } from '../../types/electron';

export interface LayoutListItemProps {
  layout: WorkspaceLayout;
  isActive: boolean;
  onSelect: (layout: WorkspaceLayout) => void;
  onUpdate: (name: string) => void;
  onDelete: (name: string) => void;
}

export function LayoutListItem({
  layout,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
}: LayoutListItemProps): React.ReactElement<any> {
  return (
    <div
      className="flex items-center"
      style={{ gap: '6px', padding: '6px 10px', cursor: 'pointer', transition: 'background 80ms' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--surface-base)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <LayoutRadioButton layout={layout} isActive={isActive} onSelect={onSelect} />
      {!layout.builtIn && (
        <LayoutActions name={layout.name} onUpdate={onUpdate} onDelete={onDelete} />
      )}
    </div>
  );
}

const RADIO_BUTTON_STYLE_BASE: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
  padding: 0,
};

const BUILT_IN_BADGE_STYLE: React.CSSProperties = {
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  flexShrink: 0,
};

function LayoutRadioButton({
  layout,
  isActive,
  onSelect,
}: {
  layout: WorkspaceLayout;
  isActive: boolean;
  onSelect: (l: WorkspaceLayout) => void;
}): React.ReactElement<any> {
  return (
    <button
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(layout)}
      className="text-text-semantic-primary"
      style={{
        ...RADIO_BUTTON_STYLE_BASE,
        color: isActive ? 'var(--interactive-accent)' : undefined,
      }}
    >
      <RadioDot active={isActive} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {layout.name}
      </span>
      {layout.builtIn && (
        <span className="text-text-semantic-faint" style={BUILT_IN_BADGE_STYLE}>
          built-in
        </span>
      )}
    </button>
  );
}

function RadioDot({ active }: { active: boolean }): React.ReactElement<any> {
  return (
    <span
      style={{
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: `2px solid ${active ? 'var(--interactive-accent)' : 'var(--border-semantic)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'border-color 120ms',
      }}
    >
      {active && (
        <span
          className="bg-interactive-accent"
          style={{ width: '6px', height: '6px', borderRadius: '50%' }}
        />
      )}
    </span>
  );
}

function UpdateIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1v6m0 0l2.5-2.5M8 7L5.5 4.5" />
      <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
    </svg>
  );
}

function DeleteIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function LayoutActions({
  name,
  onUpdate,
  onDelete,
}: {
  name: string;
  onUpdate: (n: string) => void;
  onDelete: (n: string) => void;
}): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
      <ActionButton
        title="Update with current layout"
        onClick={() => onUpdate(name)}
        hoverColor="var(--text-primary)"
        hoverBg="rgba(128,128,128,0.15)"
      >
        <UpdateIcon />
      </ActionButton>
      <ActionButton
        title="Delete layout"
        onClick={() => onDelete(name)}
        hoverColor="var(--status-error, #f85149)"
        hoverBg="rgba(248,81,73,0.1)"
      >
        <DeleteIcon />
      </ActionButton>
    </div>
  );
}

const ACTION_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '11px',
  padding: '2px 4px',
  borderRadius: '3px',
  transition: 'color 100ms, background 100ms',
};

function ActionButton({
  title,
  onClick,
  hoverColor,
  hoverBg,
  children,
}: {
  title: string;
  onClick: () => void;
  hoverColor: string;
  hoverBg: string;
  children: React.ReactNode;
}): React.ReactElement<any> {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="text-text-semantic-faint"
      style={ACTION_BUTTON_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = hoverColor;
        e.currentTarget.style.backgroundColor = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '';
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
