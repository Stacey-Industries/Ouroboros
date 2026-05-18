/**
 * ChatOnlyTitleBar — Minimal title bar for chat-only shell.
 *
 * Drag surface: the <header> itself carries `titlebar-drag`; interactive
 * elements (sidebar-cycle, exit, window controls) override with
 * `WebkitAppRegion: 'no-drag'`. This matches the IDE TitleBar pattern and
 * gives the user a full-width drag strip. Phase D moved the model +
 * permission chips out of this bar, so there are no portaled popovers left
 * here that would need a dedicated no-drag zone.
 *
 * Sidebar-mode cycle button: pinned → collapsed → hidden → pinned. Tooltip
 * reflects current mode. onToggleDrawer kept for hidden-mode overlay compat.
 */

import React from 'react';

import ouroborosLogo from '../../../../../public/OUROBOROS.png';
import { useApprovalContext } from '../../../contexts/ApprovalContext';
import { useProject } from '../../../contexts/ProjectContext';
import { ChatOnlyHeaderControls } from './ChatOnlyHeaderControls';
import { WindowControls } from './TitleBarWindowControls';
import type { ChatSidebarMode } from './useChatSidebarMode';
import { WorkbenchMenuBar } from './WorkbenchMenuBar';
import {
  ArtifactPaneToggleButton,
  RightPaneToggleButton,
  TerminalToggleButton,
  UtilityPaneToggleButton,
} from './WorkbenchPanelToggleStrip';
import { WorkbenchRailToggleButton } from './WorkbenchRailToggle';

// ── SidebarToggleIcon ─────────────────────────────────────────────────────────

function SidebarToggleIcon({ mode }: { mode: ChatSidebarMode }): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      {mode !== 'hidden' && <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />}
      {mode === 'collapsed' && <polyline points="3,7 4.5,8.5 3,10" />}
    </svg>
  );
}

function sidebarModeLabel(mode: ChatSidebarMode): string {
  if (mode === 'pinned') return 'Sidebar pinned — click to collapse';
  if (mode === 'collapsed') return 'Sidebar collapsed — click to hide';
  return 'Sidebar hidden — click to pin';
}

// ── TitleBarLogo ──────────────────────────────────────────────────────────────

function TitleBarLogo(): React.ReactElement {
  return (
    <img
      className="titlebar-no-drag select-none shrink-0"
      src={ouroborosLogo}
      alt="Ouroboros"
      draggable={false}
      style={{ height: 20, width: 20, objectFit: 'contain', opacity: 0.9 }}
    />
  );
}

// ── TitleBarLeft ──────────────────────────────────────────────────────────────

interface TitleBarLeftProps {
  projectName: string;
  sidebarMode: ChatSidebarMode;
  onCycleSidebarMode: () => void;
  isWorkbench: boolean;
}

function ChatModeChip(): React.ReactElement {
  return (
    <span
      className="web-mobile-only items-center rounded-full border border-border-semantic px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-semantic-muted"
      data-testid="chat-mode-chip"
      title="Chat workbench mode"
    >
      Chat
    </span>
  );
}

function TitleBarLeft({
  projectName,
  sidebarMode,
  onCycleSidebarMode,
  isWorkbench,
}: TitleBarLeftProps): React.ReactElement {
  if (isWorkbench) {
    return (
      <>
        <TitleBarLogo />
        <ChatModeChip />
      </>
    );
  }
  return (
    <>
      <button
        className="flex items-center justify-center w-8 h-8 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover transition-colors shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={onCycleSidebarMode}
        title={sidebarModeLabel(sidebarMode)}
        aria-label={sidebarModeLabel(sidebarMode)}
        data-testid="sidebar-cycle-button"
      >
        <SidebarToggleIcon mode={sidebarMode} />
      </button>
      {projectName && (
        <span className="text-sm font-medium text-text-semantic-primary truncate max-w-[160px]">
          {projectName}
        </span>
      )}
      <ChatModeChip />
    </>
  );
}

// ── TitleBarRight ─────────────────────────────────────────────────────────────

/**
 * WorkbenchModelChips — kept but unmounted. Chips were inert (write side wired
 * but no consumer in the slot sessions); removed from render pending a real
 * target-slot wiring decision. Restore the `{<WorkbenchModelChips />}` in
 * TitleBarRight when wiring lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkbenchModelChips(): React.ReactElement {
  return (
    <div
      className="flex items-center gap-1 shrink-0 overflow-x-auto"
      style={{ WebkitAppRegion: 'no-drag', scrollbarWidth: 'none' } as React.CSSProperties}
      data-testid="workbench-model-chips"
    >
      <ChatOnlyHeaderControls />
    </div>
  );
}

function TitleBarRight(): React.ReactElement {
  const { pendingCount } = useApprovalContext();
  return (
    <>
      {pendingCount > 0 && (
        <div
          className="rounded-full border border-status-warning bg-status-warning-subtle px-2 py-0.5 text-[11px] font-medium text-status-warning"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={`${pendingCount} approval${pendingCount === 1 ? '' : 's'} waiting`}
          aria-label={`${pendingCount} approval${pendingCount === 1 ? '' : 's'} waiting`}
          data-testid="chat-approval-pill"
        >
          {pendingCount} approval{pendingCount === 1 ? '' : 's'}
        </div>
      )}
      <WindowControls />
    </>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ChatOnlyTitleBarProps {
  /** Legacy: used only when sidebarMode='hidden' to toggle the overlay drawer. */
  onToggleDrawer: () => void;
  /** Cycles sidebar mode: pinned → collapsed → hidden → pinned. */
  onCycleSidebarMode: () => void;
  /** Current sidebar mode — controls icon and tooltip on the cycle button. */
  sidebarMode: ChatSidebarMode;
  /** Workbench rail toggle — shows an extra icon button when provided. */
  onToggleRail?: () => void;
  /** Whether the workbench rail is currently open. */
  railOpen?: boolean;
  /** Workbench panel toggles — shown only in workbench mode (when onToggleRail is set). */
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
  /** Phase A (Wave 94): individual surface toggles replace the single right-pane toggle. */
  onToggleUtility?: () => void;
  utilityOpen?: boolean;
  onToggleArtifact?: () => void;
  artifactOpen?: boolean;
  /** @deprecated Use onToggleUtility + onToggleArtifact. Kept for keyboard-shortcut consumers. */
  onToggleRightPane?: () => void;
  rightPaneOpen?: boolean;
}

// ── WorkbenchControls — rail + panel strip, workbench-mode only ───────────────

type WorkbenchControlsProps = Omit<
  ChatOnlyTitleBarProps,
  'onToggleDrawer' | 'onCycleSidebarMode' | 'sidebarMode'
>;

function RightPaneButtons({
  onToggleUtility,
  utilityOpen,
  onToggleArtifact,
  artifactOpen,
  onToggleRightPane,
  rightPaneOpen,
}: Pick<
  WorkbenchControlsProps,
  | 'onToggleUtility'
  | 'utilityOpen'
  | 'onToggleArtifact'
  | 'artifactOpen'
  | 'onToggleRightPane'
  | 'rightPaneOpen'
>): React.ReactElement {
  if (onToggleUtility ?? onToggleArtifact) {
    return (
      <>
        {onToggleUtility && (
          <UtilityPaneToggleButton open={utilityOpen ?? false} onToggle={onToggleUtility} />
        )}
        {onToggleArtifact && (
          <ArtifactPaneToggleButton open={artifactOpen ?? false} onToggle={onToggleArtifact} />
        )}
      </>
    );
  }
  if (onToggleRightPane) {
    return <RightPaneToggleButton open={rightPaneOpen ?? false} onToggle={onToggleRightPane} />;
  }
  return <></>;
}

function WorkbenchControls({
  onToggleRail,
  railOpen,
  onToggleTerminal,
  terminalOpen,
  onToggleUtility,
  utilityOpen,
  onToggleArtifact,
  artifactOpen,
  onToggleRightPane,
  rightPaneOpen,
}: WorkbenchControlsProps): React.ReactElement | null {
  if (onToggleRail === undefined) return null;
  return (
    <div
      className="flex items-center gap-0.5"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <WorkbenchRailToggleButton railOpen={railOpen ?? false} onToggle={onToggleRail} />
      {onToggleTerminal && (
        <TerminalToggleButton open={terminalOpen ?? false} onToggle={onToggleTerminal} />
      )}
      <RightPaneButtons
        onToggleUtility={onToggleUtility}
        utilityOpen={utilityOpen}
        onToggleArtifact={onToggleArtifact}
        artifactOpen={artifactOpen}
        onToggleRightPane={onToggleRightPane}
        rightPaneOpen={rightPaneOpen}
      />
    </div>
  );
}

// ── ChatOnlyTitleBar ──────────────────────────────────────────────────────────

export function ChatOnlyTitleBar(props: ChatOnlyTitleBarProps): React.ReactElement {
  const { projectName } = useProject();
  const { onCycleSidebarMode, sidebarMode } = props;
  const isWorkbench = props.onToggleRail !== undefined;
  return (
    <header
      className="titlebar-drag flex flex-col text-text-semantic-primary select-none shrink-0"
      style={{
        background: 'var(--titlebar-bg)',
        backdropFilter: 'blur(var(--material-blur))',
        WebkitBackdropFilter: 'blur(var(--material-blur))',
        boxShadow: 'var(--shadow-inset)',
        borderBottom: '1px solid var(--stroke-inner)',
      }}
      data-testid="chat-only-title-bar"
    >
      <div
        className="flex items-center px-2 gap-2"
        style={{ height: 'var(--titlebar-height, 36px)' }}
      >
        <TitleBarLeft
          projectName={projectName}
          sidebarMode={sidebarMode}
          onCycleSidebarMode={onCycleSidebarMode}
          isWorkbench={isWorkbench}
        />
        {isWorkbench && <WorkbenchMenuBar />}
        <div className="flex-1" />
        <WorkbenchControls {...props} />
        <TitleBarRight />
      </div>
    </header>
  );
}
