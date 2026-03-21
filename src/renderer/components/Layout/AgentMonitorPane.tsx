import React, { useEffect, useState } from 'react';

export interface AgentMonitorPaneProps {
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
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

export function AgentMonitorPane({
  width,
  collapsed,
  onToggleCollapse: _onToggleCollapse,
  children,
  focusStyle,
  onFocus,
}: AgentMonitorPaneProps): React.ReactElement {
  // Detect mobile viewport — applied as a CSS class to override the inline width
  // (CSS !important cannot override inline styles, so we need a class instead).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function checkMobile(): void {
      setIsMobile(window.innerWidth <= 768 && document.documentElement.classList.contains('web-mode'));
    }
    checkMobile();
    const ro = new ResizeObserver(checkMobile);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      data-layout="agent-sidebar"
      className={`
        flex flex-col h-full overflow-hidden
        bg-[var(--bg-secondary)] border-l border-[var(--border-muted,var(--border))]
        ${isMobile ? 'mobile-agent-sidebar' : ''}
      `}
      style={isMobile ? focusStyle : { width: collapsed ? 0 : width, minWidth: collapsed ? 0 : width, ...focusStyle }}
      aria-label="Agent sidebar"
      onClick={onFocus}
    >
      {/* No separate header — RightSidebarTabs owns the header with collapse button */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// Collapsed strip — narrow right-side affordance
export function CollapsedAgentStrip({
  onExpand,
  runningCount = 0,
}: {
  onExpand: () => void;
  runningCount?: number;
}): React.ReactElement {
  return (
    <div
      data-layout="collapsed-agent-strip"
      className="
        flex flex-col items-center pt-2 h-full w-10 flex-shrink-0
        bg-[var(--bg-secondary)] border-l border-[var(--border-muted,var(--border))]
        cursor-pointer relative
      "
      onClick={onExpand}
      title="Expand agent sidebar (Ctrl+\\)"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onExpand()}
      aria-label="Expand agent sidebar"
    >
      <span className="text-[var(--text-muted)] mt-2">
        <ChevronLeftIcon />
      </span>
      {runningCount > 0 && (
        <span className="mt-2 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" style={{ boxShadow: '0 0 6px var(--accent)' }} />
      )}
    </div>
  );
}
