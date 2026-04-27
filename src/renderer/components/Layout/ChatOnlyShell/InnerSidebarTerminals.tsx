/**
 * InnerSidebarTerminals — Terminals tab content for the inner sidebar
 * (Wave 59 Phase D).
 *
 * Lists terminal sessions. Click a row → activates the terminal in the
 * workbench's bottom dock (the dock stays — it's the runtime view; this
 * tab is the index). + New terminal button at the top.
 *
 * Project-scoped filtering is deferred — `TerminalSession` does not carry
 * a `cwd` field today. When that lands the filter is one map line away.
 */

import React, { useCallback } from 'react';

import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { TerminalSession } from '../../Terminal/TerminalTabs';

export interface InnerSidebarTerminalsProps {
  /** Terminal session bus. Optional because chat-only popout windows can opt out. */
  terminal?: UseTerminalSessionsReturn;
  /** Called when the dock should open (to surface the activated session). */
  onActivateInDock?: () => void;
}

function NewTerminalRow({
  onCreate,
}: {
  onCreate?: () => void;
}): React.ReactElement | null {
  if (!onCreate) return null;
  return (
    <div className="shrink-0 border-b border-border-semantic px-3 py-2">
      <button
        type="button"
        onClick={onCreate}
        data-testid="inner-terminals-new"
        className="w-full rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      >
        + New terminal
      </button>
    </div>
  );
}

function TerminalsEmpty({ message }: { message: string }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center">
      <p className="text-xs text-text-semantic-faint">{message}</p>
    </div>
  );
}

interface TerminalRowProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

function TerminalRow({ active, label, onClick }: TerminalRowProps): React.ReactElement {
  const cls = active
    ? 'bg-interactive-selection text-text-semantic-primary'
    : 'text-text-semantic-secondary hover:bg-surface-hover hover:text-text-semantic-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="inner-terminals-row"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${cls}`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function useTerminalsHandlers(
  terminal: UseTerminalSessionsReturn | undefined,
  onActivateInDock: (() => void) | undefined,
): { handleSelect: (id: string) => void; handleCreate: () => void } {
  const handleSelect = useCallback(
    (id: string) => {
      terminal?.setActiveSessionId?.(id);
      onActivateInDock?.();
    },
    [terminal, onActivateInDock],
  );
  const handleCreate = useCallback(() => {
    void terminal?.spawnSession?.();
    onActivateInDock?.();
  }, [terminal, onActivateInDock]);
  return { handleSelect, handleCreate };
}

interface TerminalsBodyProps {
  sessions: TerminalSession[];
  activeId: string | null;
  hasTerminalApi: boolean;
  onSelect: (id: string) => void;
}

function TerminalsBody({
  sessions,
  activeId,
  hasTerminalApi,
  onSelect,
}: TerminalsBodyProps): React.ReactElement {
  if (sessions.length === 0) {
    const msg = hasTerminalApi
      ? 'No terminals open.'
      : 'Terminals are not available in this window.';
    return <TerminalsEmpty message={msg} />;
  }
  return (
    <>
      {sessions.map((s) => (
        <TerminalRow
          key={s.id}
          active={s.id === activeId}
          label={s.title || s.id}
          onClick={() => onSelect(s.id)}
        />
      ))}
    </>
  );
}

export function InnerSidebarTerminals({
  terminal,
  onActivateInDock,
}: InnerSidebarTerminalsProps): React.ReactElement {
  const sessions = terminal?.sessions ?? [];
  const { handleSelect, handleCreate } = useTerminalsHandlers(terminal, onActivateInDock);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="inner-sidebar-terminals"
    >
      <NewTerminalRow onCreate={terminal ? handleCreate : undefined} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TerminalsBody
          sessions={sessions}
          activeId={terminal?.activeSessionId ?? null}
          hasTerminalApi={Boolean(terminal)}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
