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

export function AgentMonitorPane({
  width,
  collapsed,
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
        bg-surface-panel border-l border-border-semantic
        ${isMobile ? 'mobile-agent-sidebar' : ''}
      `}
      style={isMobile ? focusStyle : { width: collapsed ? 0 : width, minWidth: collapsed ? 0 : width, ...focusStyle }}
      aria-label="Agent sidebar"
      onClick={onFocus}
    >
      {/* No separate header — RightSidebarTabs owns the header */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
