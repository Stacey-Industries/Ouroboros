/**
 * Workbench panel toggle buttons — terminal (bottom dock) and right-pane.
 *
 * The right pane consolidates the utility drawer + artifact pane (mutually
 * exclusive) under a single toggle. The internal view is switched via a
 * dropdown header inside the pane itself.
 */

import React from 'react';

const PANEL_BTN_BASE =
  'flex items-center justify-center w-7 h-7 rounded transition-colors shrink-0';
const PANEL_BTN_ON =
  'text-interactive-accent bg-interactive-accent-subtle hover:bg-interactive-accent-subtle';
const PANEL_BTN_OFF =
  'text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover';

function PanelToggleBtn({
  active,
  label,
  onToggle,
  testId,
  children,
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
  testId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`${PANEL_BTN_BASE} ${active ? PANEL_BTN_ON : PANEL_BTN_OFF}`}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function TerminalIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <polyline points="4,6 6.5,8 4,10" />
      <line x1="8" y1="10" x2="12" y2="10" />
    </svg>
  );
}

function RightPaneIcon(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" />
    </svg>
  );
}

export function TerminalToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <PanelToggleBtn
      active={open}
      label={open ? 'Hide terminal' : 'Show terminal'}
      onToggle={onToggle}
      testId="workbench-toggle-terminal"
    >
      <TerminalIcon />
    </PanelToggleBtn>
  );
}

export function RightPaneToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <PanelToggleBtn
      active={open}
      label={open ? 'Hide right pane' : 'Show right pane'}
      onToggle={onToggle}
      testId="workbench-toggle-right-pane"
    >
      <RightPaneIcon />
    </PanelToggleBtn>
  );
}
