/**
 * GitBranchIndicator.helpers.tsx — styles and icon sub-components for GitBranchIndicator.
 * Not part of the public API.
 */

import React from 'react';

// ─── Styles ───────────────────────────────────────────────────────────────────

export const indicatorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-muted)',
  minHeight: '26px',
  position: 'relative',
};

export const branchNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 100,
  borderRadius: '0 0 4px 4px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  maxHeight: '280px',
  overflowY: 'auto',
};

export const dropdownHeaderStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border-muted)',
};

export const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  outline: 'none',
  boxSizing: 'border-box',
};

const branchItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  userSelect: 'none',
  minHeight: '26px',
};

export const branchItemActiveStyle: React.CSSProperties = {
  ...branchItemStyle,
  fontWeight: 600,
};

export { branchItemStyle };

export const sectionLabelStyle: React.CSSProperties = {
  padding: '6px 8px 2px',
  fontSize: '0.625rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export const createBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-ui)',
  userSelect: 'none',
  borderTop: '1px solid var(--border-muted)',
  minHeight: '28px',
};

export const DROPDOWN_CSS = `
  .branch-item:hover { background-color: var(--bg-tertiary); }
  .branch-create-btn:hover { background-color: var(--bg-tertiary); }
`;

const chevronStyle: React.CSSProperties = {
  flexShrink: 0,
  transition: 'transform 150ms',
};

// ─── Icon components ───────────────────────────────────────────────────────────

export function BranchIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="text-interactive-accent" style={{ flexShrink: 0 }}>
      <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM11 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 7v4M11 7C11 9 9 11 5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DropdownChevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
      className="text-text-semantic-faint"
      style={{ ...chevronStyle, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckMark(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-interactive-accent" style={{ flexShrink: 0 }}>
      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BranchItem({ name, isCurrent, onClick }: {
  name: string; isCurrent: boolean; onClick: () => void;
}): React.ReactElement {
  return (
    <div
      className={`branch-item ${isCurrent ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}
      style={isCurrent ? branchItemActiveStyle : branchItemStyle}
      onClick={onClick} role="option" aria-selected={isCurrent} title={name}
    >
      {isCurrent ? <CheckMark /> : <span style={{ width: '10px', flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </div>
  );
}

export function CreateBranchRow({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <div className="branch-create-btn text-interactive-accent" style={createBtnStyle} onClick={onClick} role="button" tabIndex={0}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M5 2V8M2 5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>Create new branch...</span>
    </div>
  );
}
