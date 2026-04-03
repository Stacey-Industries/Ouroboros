import React from 'react';

import type { TerminalSession } from '../Terminal/TerminalTabs';
import { TerminalTabs } from '../Terminal/TerminalTabs';

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
  /** When true, the pane fills its parent using flex:1 instead of a fixed height */
  fillContainer?: boolean;
  /** Inline style from focus manager (e.g. box-shadow ring) */
  focusStyle?: React.CSSProperties;
  /** Called when the pane is clicked to acquire focus */
  onFocus?: () => void;
}

const MIN_HEIGHT = 120;
type TerminalPaneHeaderProps = Pick<
  TerminalPaneProps,
  | 'sessions'
  | 'activeSessionId'
  | 'onActivate'
  | 'onClose'
  | 'onNew'
  | 'onNewClaude'
  | 'onNewCodex'
  | 'onReorder'
>;

function TerminalPaneHeader({
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
        bg-surface-panel border-b border-border-semantic
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
    </div>
  );
}

function getTerminalPaneHeaderProps(props: TerminalPaneProps): TerminalPaneHeaderProps {
  return {
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
  const { height, collapsed, fillContainer, children, focusStyle, onFocus } = props;
  const clampedHeight = Math.max(MIN_HEIGHT, height);

  return (
    <div
      className={`
        flex flex-col overflow-hidden
        ${fillContainer ? '' : 'flex-shrink-0'}
        bg-[var(--term-bg,var(--surface-base))]
      `}
      style={{
        ...(fillContainer && !collapsed
          ? { flex: 1, minHeight: 0 }
          : { height: collapsed ? 32 : clampedHeight }),
        ...focusStyle,
      }}
      aria-label="Terminal"
      onClick={onFocus}
    >
      <TerminalPaneHeader {...getTerminalPaneHeaderProps(props)} />

      {/* Terminal content */}
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden relative font-mono text-sm">{children}</div>
      )}
    </div>
  );
}
