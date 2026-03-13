import React from 'react';
import { TerminalTabs } from '../Terminal/TerminalTabs';
import type { TerminalSession } from '../Terminal/TerminalTabs';
import { Tooltip } from '../shared';

export interface TerminalPaneProps {
  height: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onNewClaude: () => void;
  onReorder?: (reordered: TerminalSession[]) => void;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
  onFocus?: () => void;
}

const MIN_HEIGHT = 120;

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 4L6 8L10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronUpIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 8L6 4L10 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TerminalPane({
  height,
  collapsed,
  onToggleCollapse,
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onNew,
  onNewClaude,
  onReorder,
  children,
  focusStyle,
  onFocus,
}: TerminalPaneProps): React.ReactElement {
  const clampedHeight = Math.max(MIN_HEIGHT, height);

  return (
    <div
      className="
        flex flex-col w-full overflow-hidden flex-shrink-0
        bg-[var(--term-bg,var(--bg))] border-t border-[var(--border)]
      "
      style={{ height: collapsed ? 28 : clampedHeight, ...focusStyle }}
      aria-label="Terminal"
      onClick={onFocus}
    >
      {/* Tab bar */}
      <div
        className="
          flex items-center h-7 min-h-[28px] flex-shrink-0
          bg-[var(--bg-secondary)] border-b border-[var(--border)]
          overflow-x-auto overflow-y-hidden
        "
      >
        {/* TerminalTabs handles tabs + new button */}
        <TerminalTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onActivate={onActivate}
          onClose={onClose}
          onNew={onNew}
          onNewClaude={onNewClaude}
          onReorder={onReorder}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Collapse toggle */}
        <Tooltip text={collapsed ? 'Expand terminal (Ctrl+J)' : 'Collapse terminal (Ctrl+J)'} position="bottom">
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            className="
              flex-shrink-0 flex items-center justify-center w-7 h-full
              text-[var(--text-muted)] hover:text-[var(--text)]
              hover:bg-[var(--bg-tertiary)]
              transition-colors duration-100
            "
          >
            {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
        </Tooltip>
      </div>

      {/* Terminal content */}
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden relative font-mono text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
