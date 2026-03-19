/**
 * ActivityBar — VS Code-style vertical icon strip on the far-left edge.
 *
 * Always visible (never collapses). Clicking the active icon toggles the sidebar
 * collapsed/expanded. Clicking an inactive icon switches the sidebar view and
 * ensures it is expanded.
 */

import React from 'react';

export type SidebarView = 'files' | 'search' | 'git' | 'extensions';

export interface ActivityBarProps {
  activeView: SidebarView;
  sidebarCollapsed: boolean;
  onViewChange: (view: SidebarView) => void;
  onToggleSidebar: () => void;
}

/* ── SVG Icons (20x20) ── */

function FilesIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Back page */}
      <rect x="5" y="2" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      {/* Front page */}
      <rect x="3" y="5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="var(--bg-secondary)" />
    </svg>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12.3" y1="12.3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GitIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Main branch line */}
      <line x1="7" y1="4" x2="7" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Branch line */}
      <path d="M13 6 C13 10, 7 10, 7 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Dots */}
      <circle cx="7" cy="4" r="1.8" fill="currentColor" />
      <circle cx="7" cy="16" r="1.8" fill="currentColor" />
      <circle cx="13" cy="6" r="1.8" fill="currentColor" />
    </svg>
  );
}

function ExtensionsIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* 2x2 grid */}
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/* ── View definitions ── */

interface ViewDef {
  id: SidebarView;
  label: string;
  icon: React.ReactElement;
}

const VIEWS: ViewDef[] = [
  { id: 'files', label: 'Explorer', icon: <FilesIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'git', label: 'Source Control', icon: <GitIcon /> },
  { id: 'extensions', label: 'Extensions', icon: <ExtensionsIcon /> },
];

/* ── Activity Bar Icon Button ── */

function ActivityBarIcon({
  view,
  isActive,
  onClick,
}: {
  view: ViewDef;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={view.label}
      aria-label={view.label}
      className="relative flex items-center justify-center w-[40px] h-[40px] transition-colors duration-100"
      style={{
        color: isActive ? 'var(--text)' : 'var(--text-muted)',
      }}
    >
      {/* Active indicator: 2px left border in accent */}
      {isActive && (
        <span
          className="absolute left-0 top-[6px] bottom-[6px] w-[2px] rounded-r-sm"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      )}
      {/* Hover background */}
      <span
        className="flex items-center justify-center w-[28px] h-[28px] rounded-[4px] hover:bg-[var(--bg-tertiary)] transition-colors duration-100"
      >
        {view.icon}
      </span>
    </button>
  );
}

/* ── Main Component ── */

export function ActivityBar({
  activeView,
  sidebarCollapsed,
  onViewChange,
  onToggleSidebar,
}: ActivityBarProps): React.ReactElement {
  const handleClick = (view: SidebarView): void => {
    if (view === activeView) {
      // Clicking the already-active icon toggles sidebar collapse
      onToggleSidebar();
    } else {
      // Switch to the new view — ensure sidebar is visible
      onViewChange(view);
    }
  };

  return (
    <div
      data-layout="activity-bar"
      className="flex flex-col items-center flex-shrink-0 h-full border-r border-[var(--border-muted,var(--border))]"
      style={{
        width: 40,
        minWidth: 40,
        backgroundColor: 'var(--bg-secondary)',
        filter: 'brightness(0.92)',
        paddingTop: 8,
        gap: 0,
      }}
      aria-label="Activity bar"
      role="toolbar"
      aria-orientation="vertical"
    >
      {VIEWS.map((view) => (
        <ActivityBarIcon
          key={view.id}
          view={view}
          isActive={view.id === activeView && !sidebarCollapsed}
          onClick={() => handleClick(view.id)}
        />
      ))}
    </div>
  );
}
