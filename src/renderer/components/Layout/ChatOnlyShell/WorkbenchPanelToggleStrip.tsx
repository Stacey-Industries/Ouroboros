/**
 * WorkbenchPanelToggleStrip — icon-button strip for toggling workbench panels
 * (terminal, utility drawer, artifact pane) from the title bar.
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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <polyline points="4,6 6.5,8 4,10" />
      <line x1="8" y1="10" x2="12" y2="10" />
    </svg>
  );
}

function UtilityIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="1.5" y1="9.5" x2="14.5" y2="9.5" />
    </svg>
  );
}

function ArtifactIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="9.5" y1="2.5" x2="9.5" y2="13.5" />
    </svg>
  );
}

export interface WorkbenchPanelToggleStripProps {
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  utilityOpen: boolean;
  onToggleUtility: () => void;
  artifactOpen: boolean;
  onToggleArtifact: () => void;
}

function StripButtons({
  terminalOpen, onToggleTerminal,
  utilityOpen, onToggleUtility,
  artifactOpen, onToggleArtifact,
}: WorkbenchPanelToggleStripProps): React.ReactElement {
  return (
    <>
      <PanelToggleBtn active={terminalOpen} label={terminalOpen ? 'Hide terminal' : 'Show terminal'} onToggle={onToggleTerminal} testId="workbench-toggle-terminal">
        <TerminalIcon />
      </PanelToggleBtn>
      <PanelToggleBtn active={utilityOpen} label={utilityOpen ? 'Hide utility drawer' : 'Show utility drawer'} onToggle={onToggleUtility} testId="workbench-toggle-utility">
        <UtilityIcon />
      </PanelToggleBtn>
      <PanelToggleBtn active={artifactOpen} label={artifactOpen ? 'Hide artifact pane' : 'Show artifact pane'} onToggle={onToggleArtifact} testId="workbench-toggle-artifact">
        <ArtifactIcon />
      </PanelToggleBtn>
    </>
  );
}

export function WorkbenchPanelToggleStrip(
  props: WorkbenchPanelToggleStripProps,
): React.ReactElement {
  return (
    <div
      className="flex items-center gap-0.5"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      data-testid="workbench-panel-toggle-strip"
    >
      <StripButtons {...props} />
    </div>
  );
}
