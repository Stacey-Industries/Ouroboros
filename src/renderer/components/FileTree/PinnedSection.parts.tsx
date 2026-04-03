/**
 * PinnedSection.parts.tsx — style constants and icon sub-components for PinnedSection.
 * Extracted to keep PinnedSection.tsx under 300 lines.
 */

import React from 'react';

// ─── CSS ──────────────────────────────────────────────────────────────────────

export const PINNED_SECTION_CSS = `
  .pinned-item-row:hover { background-color: var(--surface-raised); }
  .pinned-item-row[data-active="true"],
  .pinned-item-row[data-active="true"]:hover {
    background-color: rgba(var(--accent-rgb, 88, 166, 255), 0.1);
  }
  .pinned-item-row:hover .pinned-unpin-btn { opacity: 1 !important; }
  .pinned-unpin-btn:hover { color: var(--interactive-accent); }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

export const sectionStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-subtle)',
};

export const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 8px',
  gap: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  borderBottom: '1px solid var(--border-subtle)',
  minHeight: '26px',
};

export const headerTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export const countBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '0.625rem',
  fontWeight: 600,
  padding: '0 5px',
  borderRadius: '8px',
  lineHeight: '16px',
};

export const rowBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  paddingLeft: '20px',
  paddingRight: '8px',
  cursor: 'pointer',
  height: '28px',
  boxSizing: 'border-box',
  userSelect: 'none',
  borderLeft: '2px solid transparent',
};

export const dotStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
};

export const unpinButtonStyle: React.CSSProperties = {
  flexShrink: 0,
  background: 'none',
  border: 'none',
  padding: '2px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '3px',
  opacity: 0,
  transition: 'opacity 150ms',
};

// ─── Icons ────────────────────────────────────────────────────────────────────

export function PinnedChevron({ expanded }: { expanded: boolean }): React.ReactElement {
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

export function PinnedIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-interactive-accent"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M9.828 2.172a2 2 0 0 1 2.828 0l1.172 1.172a2 2 0 0 1 0 2.828L11 9l.5 5-3-3-4 4v-1.5L1 11l3-3-3-3 5 .5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
