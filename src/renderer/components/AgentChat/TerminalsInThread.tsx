/**
 * TerminalsInThread.tsx — Wave 21 Phase G
 *
 * Collapsible sub-pane listing PTY sessions linked to a chat thread.
 * Calls agentChat:getLinkedTerminals on mount and on sessionCrud:changed,
 * then resolves each session ID to a pty:shellState for status display.
 */

import React, { useEffect, useState } from 'react';

import {
  FOCUS_TERMINAL_SESSION_EVENT,
} from '../../hooks/appEventNames';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkedTerminalInfo {
  sessionId: string;
  status: 'running' | 'exited';
  lastLine: string;
}

interface Props {
  threadId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchLinkedIds(threadId: string): Promise<string[]> {
  const result = await window.electronAPI.agentChat.getLinkedTerminals(threadId);
  return result.success ? (result.sessionIds ?? []) : [];
}

async function resolveTerminalInfo(sessionId: string): Promise<LinkedTerminalInfo> {
  const state = await window.electronAPI.pty.getShellState(sessionId);
  const status: 'running' | 'exited' = state.success ? 'running' : 'exited';
  const lastLine = state.success && state.lastCommand ? state.lastCommand : '';
  return { sessionId, status, lastLine };
}

async function resolveAll(sessionIds: string[]): Promise<LinkedTerminalInfo[]> {
  return Promise.all(sessionIds.map(resolveTerminalInfo));
}

function focusTerminal(sessionId: string): void {
  window.dispatchEvent(
    new CustomEvent(FOCUS_TERMINAL_SESSION_EVENT, { detail: { sessionId } }),
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'running' | 'exited' }): React.ReactElement {
  const base = 'inline-block h-2 w-2 rounded-full flex-shrink-0';
  const color = status === 'running' ? 'bg-status-success' : 'bg-text-semantic-muted';
  return <span className={`${base} ${color}`} aria-label={status} />;
}

function TerminalRow({ info }: { info: LinkedTerminalInfo }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => focusTerminal(info.sessionId)}
      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs
        text-text-semantic-secondary hover:bg-surface-hover focus:outline-none
        focus-visible:ring-1 focus-visible:ring-border-accent"
    >
      <StatusDot status={info.status} />
      <span className="min-w-0 flex-1 truncate font-mono text-text-semantic-primary">
        {info.sessionId}
      </span>
      {info.lastLine && (
        <span className="max-w-[40%] truncate text-text-semantic-muted">
          {info.lastLine}
        </span>
      )}
    </button>
  );
}

// ─── Data hook ───────────────────────────────────────────────────────────────

function useLinkedTerminals(threadId: string): LinkedTerminalInfo[] {
  const [terminals, setTerminals] = useState<LinkedTerminalInfo[]>([]);

  useEffect(() => {
    let cancelled = false;

    function refresh(): void {
      fetchLinkedIds(threadId)
        .then((ids) => {
          if (cancelled) return;
          if (ids.length === 0) { setTerminals([]); return; }
          resolveAll(ids)
            .then((infos) => { if (!cancelled) setTerminals(infos); })
            .catch(() => { /* non-fatal */ });
        })
        .catch(() => { /* non-fatal */ });
    }

    refresh();
    const cleanup = window.electronAPI.sessionCrud.onChanged(() => refresh());
    return () => { cancelled = true; cleanup(); };
  }, [threadId]);

  return terminals;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TerminalsInThread({ threadId }: Props): React.ReactElement | null {
  const [open, setOpen] = useState(true);
  const terminals = useLinkedTerminals(threadId);

  if (terminals.length === 0) return null;

  return (
    <div className="border-t border-border-subtle px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-xs font-medium
          text-text-semantic-secondary hover:text-text-semantic-primary
          focus:outline-none focus-visible:ring-1 focus-visible:ring-border-accent"
        aria-expanded={open}
      >
        <span
          className="text-[10px] transition-transform duration-150"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <span>Terminals ({terminals.length})</span>
      </button>
      {open && (
        <ul className="mt-1 space-y-px" role="list">
          {terminals.map((info) => (
            <li key={info.sessionId}><TerminalRow info={info} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
