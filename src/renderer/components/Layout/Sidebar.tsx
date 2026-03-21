import React from 'react';

export interface SidebarProps {
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  header?: React.ReactNode;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the sidebar is clicked to acquire focus */
  onFocus?: () => void;
}

function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 11L5 7L9 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 3L9 7L5 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarHeader({
  collapsed,
  header,
  onToggleCollapse,
}: Pick<SidebarProps, 'collapsed' | 'header' | 'onToggleCollapse'>): React.ReactElement {
  return (
    <div className="flex-shrink-0 flex items-center justify-between h-9 px-3 border-b border-[var(--border)]">
      <div className="flex-1 min-w-0">
        {header}
      </div>
      <button
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        className="
          flex-shrink-0 ml-1 p-1 rounded
          text-[var(--text-muted)] hover:text-[var(--text)]
          hover:bg-[var(--bg-tertiary)]
          transition-colors duration-100
        "
      >
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
    </div>
  );
}

export function Sidebar({
  width,
  collapsed,
  onToggleCollapse,
  header,
  children,
  focusStyle,
  onFocus,
}: SidebarProps): React.ReactElement {
  return (
    <div
      data-layout="sidebar"
      className="
        flex flex-col h-full overflow-hidden
        bg-[var(--bg-secondary)] border-r border-[var(--border-muted,var(--border))]
      "
      style={{ width: collapsed ? 0 : width, minWidth: collapsed ? 0 : width, ...focusStyle }}
      aria-label="Left sidebar"
      onClick={onFocus}
    >
      {/* Collapsed indicator strip — shown when collapsed via absolute overlay trick */}
      {collapsed && (
        <div className="w-0 overflow-hidden" aria-hidden="true" />
      )}

      {/* Header: project picker slot */}
      <SidebarHeader
        collapsed={collapsed}
        header={header}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Content — children manage their own scrolling */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}

// Collapsed sidebar — a narrow strip with expand affordance
export function CollapsedSidebarStrip({
  onExpand,
}: {
  onExpand: () => void;
}): React.ReactElement {
  return (
    <div
      className="
        flex flex-col items-center pt-2 h-full w-8 flex-shrink-0
        bg-[var(--bg-secondary)] border-r border-[var(--border-muted,var(--border))]
        cursor-pointer
      "
      onClick={onExpand}
      title="Expand sidebar (Ctrl+B)"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onExpand()}
      aria-label="Expand left sidebar"
    >
      <span className="text-[var(--text-muted)] mt-2">
        <ChevronRightIcon />
      </span>
    </div>
  );
}
