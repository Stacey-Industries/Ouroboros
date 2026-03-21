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
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
  onReorder?: (reordered: TerminalSession[]) => void;
  children?: React.ReactNode;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
  onFocus?: () => void;
}

const MIN_HEIGHT = 120;
type TerminalPaneHeaderProps = Pick<
  TerminalPaneProps,
  'collapsed' | 'onToggleCollapse' | 'sessions' | 'activeSessionId' | 'onActivate' | 'onClose' | 'onNew' | 'onNewClaude' | 'onNewCodex' | 'onReorder'
>;

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

function TerminalCollapseButton({
  collapsed,
  onToggleCollapse,
}: Pick<TerminalPaneProps, 'collapsed' | 'onToggleCollapse'>): React.ReactElement {
  const toggleLabel = collapsed ? 'Expand terminal (Ctrl+J)' : 'Collapse terminal (Ctrl+J)';

  return (
    <Tooltip text={toggleLabel} position="bottom">
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
  );
}

function TerminalPaneHeader({
  collapsed,
  onToggleCollapse,
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onNew,
  onNewClaude,
  onNewCodex,
  onReorder,
}: TerminalPaneHeaderProps): React.ReactElement {
  return (
    <div
      data-layout="terminal-header"
      className="
        flex items-center h-8 min-h-[32px] flex-shrink-0
        bg-[var(--bg-secondary)] border-b border-[var(--border-muted,var(--border))]
        overflow-x-auto overflow-y-hidden
      "
    >
      <TerminalTabs
        sessions={sessions}
        activeSessionId={activeSessionId}
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNew}
        onNewClaude={onNewClaude}
        onNewCodex={onNewCodex}
        onReorder={onReorder}
      />
      <div className="flex-1" />
      <TerminalCollapseButton
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
}

function getTerminalPaneHeaderProps(props: TerminalPaneProps): TerminalPaneHeaderProps {
  return {
    collapsed: props.collapsed,
    onToggleCollapse: props.onToggleCollapse,
    sessions: props.sessions,
    activeSessionId: props.activeSessionId,
    onActivate: props.onActivate,
    onClose: props.onClose,
    onNew: props.onNew,
    onNewClaude: props.onNewClaude,
    onNewCodex: props.onNewCodex,
    onReorder: props.onReorder,
  };
}

export function TerminalPane(props: TerminalPaneProps): React.ReactElement {
  const { height, collapsed, children, focusStyle, onFocus } = props;
  const clampedHeight = Math.max(MIN_HEIGHT, height);

  return (
    <div
      className="
        flex flex-col overflow-hidden flex-shrink-0
        bg-[var(--term-bg,var(--bg))]
      "
      style={{ height: collapsed ? 32 : clampedHeight, ...focusStyle }}
      aria-label="Terminal"
      onClick={onFocus}
    >
      <TerminalPaneHeader {...getTerminalPaneHeaderProps(props)} />

      {/* Terminal content */}
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden relative font-mono text-sm">
          {children}
        </div>
      )}
    </div>
  );
}
