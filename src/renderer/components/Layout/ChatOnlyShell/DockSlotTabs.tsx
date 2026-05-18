/**
 * DockSlotTabs.tsx — Wave 94 Phase C
 *
 * Per-slot tab strip rendered inside DockSlot when sessions exist (ADR Decision 5).
 * Replaces the slot label row; affordances (collapse, recording, close) sit at the
 * right edge of the 28px strip. The + New button moves here from SlotHeader so
 * all tab operations live in one row.
 *
 * Also exports SlotTabsHeader — the wired version that connects a SlotHandle to
 * DockSlotTabs and owns close-with-activation semantics.
 */

import React, { useCallback } from 'react';

import type { SlotHandle } from '../../../hooks/useProjectTerminals';
import type { TerminalSession } from '../../Terminal/TerminalTabs';
import type { SlotId } from './DockSlot';
import { SlotCollapseButton, SlotExpandedButtons } from './DockSlot';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const BTN_BASE = 'rounded px-2 py-0.5 text-xs text-text-semantic-secondary transition-colors';
const BTN_HOVER = 'hover:bg-surface-hover hover:text-text-semantic-primary';

// ---------------------------------------------------------------------------
// DockSlotTabsProps
// ---------------------------------------------------------------------------

export interface DockSlotTabsProps {
  slot: 'primary' | 'secondary';
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onSpawn: () => void;
  /** Right-edge affordance buttons (collapse, recording, etc.) */
  rightControls?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Single tab
// ---------------------------------------------------------------------------

interface TabItemProps {
  session: TerminalSession;
  isActive: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function TabItem({ session, isActive, onActivate, onClose }: TabItemProps): React.ReactElement {
  const handleActivate = useCallback(() => onActivate(session.id), [onActivate, session.id]);
  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(session.id);
    },
    [onClose, session.id],
  );

  const activeCls = isActive
    ? 'bg-interactive-accent text-text-semantic-on-accent'
    : 'text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary';

  return (
    <button
      type="button"
      className={`flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${activeCls}`}
      onClick={handleActivate}
      aria-selected={isActive}
      aria-label={`Tab: ${session.title}`}
      data-testid={`dock-slot-tab-${session.id}`}
    >
      <span className="max-w-[80px] truncate">{session.title}</span>
      <span
        role="button"
        tabIndex={-1}
        className="ml-0.5 rounded px-0.5 hover:text-status-error"
        onClick={handleClose}
        aria-label={`Close tab ${session.title}`}
        data-testid={`dock-slot-tab-close-${session.id}`}
      >
        ×
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab list (extracted to keep DockSlotTabs under 40 lines)
// ---------------------------------------------------------------------------

interface TabListProps {
  slot: string;
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSpawn: () => void;
}

function TabList({
  slot,
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onSpawn,
}: TabListProps): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
      {sessions.map((s) => (
        <TabItem
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onActivate={onActivate}
          onClose={onClose}
        />
      ))}
      <button
        type="button"
        className={`shrink-0 ${BTN_BASE} ${BTN_HOVER}`}
        onClick={onSpawn}
        data-testid={`dock-slot-${slot}-spawn`}
      >
        + New
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DockSlotTabs
// ---------------------------------------------------------------------------

export function DockSlotTabs({
  slot,
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onSpawn,
  rightControls,
}: DockSlotTabsProps): React.ReactElement {
  return (
    <div
      className="flex shrink-0 items-center overflow-hidden border-b border-border-semantic"
      style={{ height: 28 }}
      data-testid={`dock-slot-tabs-${slot}`}
    >
      <TabList
        slot={slot}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onActivate={onActivate}
        onClose={onClose}
        onSpawn={onSpawn}
      />
      {rightControls !== undefined && (
        <div className="flex shrink-0 items-center gap-1 px-1">{rightControls}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlotTabsHeader — wired tab strip for DockSlot (has-sessions state)
// Owns close-with-neighbour-activation semantics and right-edge affordances.
// ---------------------------------------------------------------------------

export interface SlotTabsHeaderProps {
  slot: SlotId;
  terminal: SlotHandle;
  collapsed: boolean;
  isRecording: boolean;
  onSpawn: () => void;
  onCloseSession: () => void;
  onToggleRecording: () => void;
  onToggleCollapse: () => void;
}

/** Activate the neighbouring tab when the active one is closed. */
function activateNeighbour(terminal: SlotHandle, closedId: string): void {
  const { sessions, activeSessionId, setActiveSessionId } = terminal;
  if (closedId !== activeSessionId || sessions.length <= 1) return;
  const idx = sessions.findIndex((s) => s.id === closedId);
  const next = sessions[idx > 0 ? idx - 1 : 1];
  if (next) setActiveSessionId(next.id);
}

function useTabHandlers(terminal: SlotHandle) {
  const handleActivate = useCallback((id: string) => terminal.setActiveSessionId(id), [terminal]);
  const handleClose = useCallback(
    (id: string) => {
      activateNeighbour(terminal, id);
      terminal.handleTerminalClose(id);
    },
    [terminal],
  );
  return { handleActivate, handleClose };
}

interface RightControlsOpts {
  collapsed: boolean;
  terminal: SlotHandle;
  isRecording: boolean;
  onCloseSession: () => void;
  onToggleRecording: () => void;
  onToggleCollapse: () => void;
}

function buildRightControls(opts: RightControlsOpts): React.ReactNode {
  const { collapsed, terminal, isRecording, onCloseSession, onToggleRecording, onToggleCollapse } =
    opts;
  return (
    <>
      {!collapsed && (
        <SlotExpandedButtons
          testId="tabs"
          activeSessionId={terminal.activeSessionId}
          isRecording={isRecording}
          onCloseSession={onCloseSession}
          onToggleRecording={onToggleRecording}
        />
      )}
      <SlotCollapseButton collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
    </>
  );
}

export function SlotTabsHeader({
  slot,
  terminal,
  collapsed,
  isRecording,
  onSpawn,
  onCloseSession,
  onToggleRecording,
  onToggleCollapse,
}: SlotTabsHeaderProps): React.ReactElement {
  const { handleActivate, handleClose } = useTabHandlers(terminal);
  const rightControls = buildRightControls({
    collapsed,
    terminal,
    isRecording,
    onCloseSession,
    onToggleRecording,
    onToggleCollapse,
  });
  return (
    <DockSlotTabs
      slot={slot}
      sessions={terminal.sessions}
      activeSessionId={terminal.activeSessionId}
      onActivate={handleActivate}
      onClose={handleClose}
      onSpawn={onSpawn}
      rightControls={rightControls}
    />
  );
}
