/**
 * InnerSidebarTerminals — Terminals tab content for the inner sidebar
 * (Wave 94 Phase D).
 *
 * Lists terminal sessions per project via useProjectTerminalsContext().
 * Sessions grouped by slot (Primary / Secondary).
 * Single-click activates in the session's current slot.
 * + New terminal button spawns into the primary slot (ADR Decision 4).
 * Right-click on + New shows context menu for explicit slot choice.
 */

import React, { useCallback, useState } from 'react';

import { useProjectTerminalsContext } from '../../../contexts/ProjectTerminalsContext';
import type { SlotHandle } from '../../../hooks/useProjectTerminals';

export interface InnerSidebarTerminalsProps {
  onActivateInDock?: () => void;
}

// ── ContextMenu state & components ──────────────────────────────────────────

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
}

function MenuButton({
  label,
  testId,
  onClick,
}: {
  label: string;
  testId: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      data-testid={testId}
    >
      {label}
    </button>
  );
}

function ContextMenuContent({
  state,
  onCreatePrimary,
  onCreateSecondary,
  onClose,
}: {
  state: ContextMenuState;
  onCreatePrimary?: () => void;
  onCreateSecondary?: () => void;
  onClose: () => void;
}): React.ReactElement | null {
  if (!state.open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        data-testid="inner-terminals-menu-backdrop"
      />
      <div
        className="fixed z-50 min-w-max rounded border border-border-semantic bg-surface-panel shadow-lg"
        style={{ top: `${state.y}px`, left: `${state.x}px` }}
        data-testid="inner-terminals-context-menu"
      >
        <MenuButton
          label="New in Primary"
          testId="inner-terminals-new-primary"
          onClick={() => {
            onClose();
            onCreatePrimary?.();
          }}
        />
        <MenuButton
          label="New in Shell"
          testId="inner-terminals-new-secondary"
          onClick={() => {
            onClose();
            onCreateSecondary?.();
          }}
        />
      </div>
    </>
  );
}

// ── NewTerminalRow ───────────────────────────────────────────────────────────

function NewTerminalRow({
  onCreatePrimary,
  onCreateSecondary,
}: {
  onCreatePrimary?: () => void;
  onCreateSecondary?: () => void;
}): React.ReactElement | null {
  const [menu, setMenu] = useState<ContextMenuState>({ open: false, x: 0, y: 0 });
  const hasActions = onCreatePrimary || onCreateSecondary;
  if (!hasActions) return null;
  return (
    <>
      <div className="shrink-0 border-b border-border-semantic px-3 py-2">
        <button
          type="button"
          onClick={onCreatePrimary}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ open: true, x: e.clientX, y: e.clientY });
          }}
          data-testid="inner-terminals-new"
          className="w-full rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
        >
          + New terminal
        </button>
      </div>
      <ContextMenuContent
        state={menu}
        onCreatePrimary={onCreatePrimary}
        onCreateSecondary={onCreateSecondary}
        onClose={() => setMenu({ open: false, x: 0, y: 0 })}
      />
    </>
  );
}

// ── TerminalRow ──────────────────────────────────────────────────────────────

function TerminalRow({
  active,
  label,
  onClick,
  onClose,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  onClose: () => void;
}): React.ReactElement {
  const cls = active
    ? 'bg-interactive-selection text-text-semantic-primary'
    : 'text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary';
  return (
    <div
      data-testid="inner-terminals-row"
      className={`group flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${cls}`}
    >
      <button type="button" onClick={onClick} className="flex-1 truncate text-left">
        {label}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close terminal"
        aria-label="Close terminal"
        data-testid="inner-terminals-row-close"
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-text-semantic-muted hover:text-status-error transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

// ── SlotGroup ────────────────────────────────────────────────────────────────

function SlotGroup({
  slotName,
  slotHandle,
  onSelect,
  onClose,
  onActivateInDock,
}: {
  slotName: string;
  slotHandle: SlotHandle;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onActivateInDock?: () => void;
}): React.ReactElement | null {
  if (slotHandle.sessions.length === 0) return null;
  return (
    <>
      <div className="sticky top-0 bg-surface-panel px-3 py-1.5 text-xs font-semibold text-text-semantic-muted">
        {slotName}
      </div>
      {slotHandle.sessions.map((s) => (
        <TerminalRow
          key={s.id}
          active={s.id === slotHandle.activeSessionId}
          label={s.title || s.id}
          onClick={() => {
            onSelect(s.id);
            onActivateInDock?.();
          }}
          onClose={() => onClose(s.id)}
        />
      ))}
    </>
  );
}

// ── Handlers hook ───────────────────────────────────────────────────────────

function useTerminalHandlers(
  primary: SlotHandle,
  secondary: SlotHandle,
  onActivateInDock?: () => void,
) {
  const selectPrimary = useCallback((id: string) => primary.setActiveSessionId(id), [primary]);
  const selectSecondary = useCallback(
    (id: string) => secondary.setActiveSessionId(id),
    [secondary],
  );
  const createPrimary = useCallback(() => {
    void primary.spawnSession?.();
    onActivateInDock?.();
  }, [primary, onActivateInDock]);
  const createSecondary = useCallback(() => {
    void secondary.spawnSession?.();
    onActivateInDock?.();
  }, [secondary, onActivateInDock]);
  return { selectPrimary, selectSecondary, createPrimary, createSecondary };
}

// ── Main component ───────────────────────────────────────────────────────────

export function InnerSidebarTerminals({
  onActivateInDock,
}: InnerSidebarTerminalsProps): React.ReactElement {
  const { primary, secondary } = useProjectTerminalsContext();
  const { selectPrimary, selectSecondary, createPrimary, createSecondary } = useTerminalHandlers(
    primary,
    secondary,
    onActivateInDock,
  );
  const hasAny = primary.sessions.length > 0 || secondary.sessions.length > 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="inner-sidebar-terminals"
    >
      <NewTerminalRow onCreatePrimary={createPrimary} onCreateSecondary={createSecondary} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!hasAny ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center">
            <p className="text-xs text-text-semantic-faint">No terminals open.</p>
          </div>
        ) : (
          <>
            <SlotGroup
              slotName="Primary"
              slotHandle={primary}
              onSelect={selectPrimary}
              onClose={primary.handleTerminalClose}
              onActivateInDock={onActivateInDock}
            />
            <SlotGroup
              slotName="Shell"
              slotHandle={secondary}
              onSelect={selectSecondary}
              onClose={secondary.handleTerminalClose}
              onActivateInDock={onActivateInDock}
            />
          </>
        )}
      </div>
    </div>
  );
}
