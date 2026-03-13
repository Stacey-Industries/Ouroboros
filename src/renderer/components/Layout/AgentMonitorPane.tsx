import React from 'react';

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
  onToggleCollapse,
  children,
  focusStyle,
  onFocus,
}: AgentMonitorPaneProps): React.ReactElement {
  return (
    <div
      className="
        flex flex-col h-full overflow-hidden
        bg-[var(--bg-secondary)] border-l border-[var(--border)]
      "
      style={{ width: collapsed ? 0 : width, minWidth: collapsed ? 0 : width, ...focusStyle }}
      aria-label="Agent monitor"
      onClick={onFocus}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between h-10 px-3 border-b border-[var(--border)]">
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand agent monitor (Ctrl+\\)' : 'Collapse agent monitor (Ctrl+\\)'}
          className="
            flex-shrink-0 p-1 rounded
            text-[var(--text-muted)] hover:text-[var(--text)]
            hover:bg-[var(--bg-tertiary)]
            transition-colors duration-100
          "
        >
          {collapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] ml-1 flex-1">
          Panel
        </span>
      </div>

      {/* Content — AgentMonitorManager owns its own empty state */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
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
      className="
        flex flex-col items-center pt-2 h-full w-8 flex-shrink-0
        bg-[var(--bg-secondary)] border-l border-[var(--border)]
        cursor-pointer relative
      "
      onClick={onExpand}
      title="Expand agent monitor (Ctrl+\\)"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onExpand()}
      aria-label="Expand agent monitor"
    >
      <span className="text-[var(--text-muted)] mt-2">
        <ChevronLeftIcon />
      </span>
      {runningCount > 0 && (
        <span className="mt-2 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
      )}
    </div>
  );
}
