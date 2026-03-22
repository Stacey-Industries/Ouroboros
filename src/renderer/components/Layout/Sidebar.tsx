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

function SidebarHeader({
  header,
}: Pick<SidebarProps, 'header'>): React.ReactElement {
  return (
    <div className="flex-shrink-0 flex items-center justify-between h-9 px-3 border-b border-border-semantic">
      <div className="flex-1 min-w-0">
        {header}
      </div>
    </div>
  );
}

export function Sidebar({
  width,
  collapsed,
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
        bg-surface-panel border-r border-border-semantic
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
      <SidebarHeader header={header} />

      {/* Content — children manage their own scrolling */}
      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}
