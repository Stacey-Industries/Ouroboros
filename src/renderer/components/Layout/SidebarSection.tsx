/**
 * SidebarSection — Reusable collapsible section with a header bar.
 *
 * Used by SidebarSections to stack Explorer, Outline, Timeline, and Bookmarks
 * in the left sidebar.
 */

import React from 'react';

export interface SidebarSectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: string | number;
  children: React.ReactNode;
  /** Forwarded from the parent for height/flex control */
  style?: React.CSSProperties;
}

function ChevronIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms ease',
        flexShrink: 0,
      }}
    >
      <path
        d="M1.5 2.5L4 5.5L6.5 2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionBadge({ value }: { value: string | number }): React.ReactElement {
  return (
    <span
      className="flex-shrink-0 rounded-full text-center select-none bg-surface-raised text-text-semantic-muted"
      style={{
        fontSize: '9px',
        lineHeight: '16px',
        minWidth: '16px',
        height: '16px',
        padding: '0 4px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {value}
    </span>
  );
}

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em',
  textTransform: 'uppercase', fontFamily: 'var(--font-ui)', lineHeight: '24px',
  flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

function SectionHeader({ title, collapsed, onToggle, badge }: {
  title: string; collapsed: boolean; onToggle: () => void; badge?: string | number;
}): React.ReactElement {
  return (
    <button
      className="flex items-center gap-1.5 w-full flex-shrink-0 px-2 select-none cursor-pointer border-none outline-hidden bg-surface-panel border-b border-border-semantic"
      style={{ height: '24px' }} // touch-target-ok — mobile.css overrides min-height to 44px inside [data-mobile-active] [aria-label='Left sidebar']
      onClick={onToggle}
      title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
      aria-expanded={!collapsed}
    >
      <ChevronIcon collapsed={collapsed} />
      <span className="text-text-semantic-muted" style={SECTION_TITLE_STYLE}>{title}</span>
      {badge != null && badge !== 0 && <SectionBadge value={badge} />}
    </button>
  );
}

export function SidebarSection({ title, collapsed, onToggle, badge, children, style }: SidebarSectionProps): React.ReactElement {
  return (
    <div className="flex flex-col overflow-hidden"
      style={{ ...style, ...(collapsed ? { flex: 'none', minHeight: 0 } : {}) }}>
      <SectionHeader title={title} collapsed={collapsed} onToggle={onToggle} badge={badge} />
      {!collapsed && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">{children}</div>
      )}
    </div>
  );
}
