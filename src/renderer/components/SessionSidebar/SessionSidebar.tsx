/**
 * SessionSidebar — top-level session list panel (Wave 20 Phase A).
 *
 * Renders sessions grouped by project root.  Clicking a row emits the
 * DOM custom event `agent-ide:session-switch` (renderer-only — not IPC).
 * Keyboard nav: Tab between rows, ArrowUp/Down moves focus, Enter/Space activates.
 *
 * Gated by the `layout.chatPrimary` feature flag — renders null when off.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { SESSION_SWITCH_EVENT } from '../../hooks/appEventNames';
import type { SessionRecord } from '../../types/electron';
import { NewSessionButton } from './NewSessionButton';
import { SessionGroupHeader } from './SessionGroupHeader';
import { SessionRow } from './SessionRow';
import { useSessions } from './useSessions';

// ─── Feature-flag helper ──────────────────────────────────────────────────────

async function isChatPrimaryEnabled(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.electronAPI) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.chatPrimary === true;
  } catch {
    return false;
  }
}

// ─── Grouping helpers ─────────────────────────────────────────────────────────

function projectBasename(root: string): string {
  return root.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? root;
}

interface SessionGroup { projectRoot: string; label: string; sessions: SessionRecord[] }

function groupSessions(sessions: SessionRecord[]): SessionGroup[] {
  const map = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    const group = map.get(s.projectRoot) ?? [];
    group.push(s);
    map.set(s.projectRoot, group);
  }
  return [...map.entries()].map(([root, list]) => ({
    projectRoot: root, label: projectBasename(root), sessions: list,
  }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SessionListProps {
  groups: SessionGroup[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSessionClick: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

function SessionList({ groups, activeSessionId, isLoading, onSessionClick, onKeyDown, listRef }: SessionListProps): React.ReactElement {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
      {isLoading && <div className="px-3 py-4 text-xs text-text-semantic-muted">Loading…</div>}
      {!isLoading && groups.length === 0 && (
        <div className="px-3 py-4 text-xs text-text-semantic-muted">
          No sessions yet. Click <strong>New</strong> to start one.
        </div>
      )}
      {!isLoading && groups.map((group) => (
        <div key={group.projectRoot} role="rowgroup">
          <SessionGroupHeader projectName={group.label} count={group.sessions.length} />
          {group.sessions.map((s) => (
            <SessionRow key={s.id} session={s} isActive={s.id === activeSessionId} onClick={onSessionClick} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── SessionSidebar ───────────────────────────────────────────────────────────

export function SessionSidebar(): React.ReactElement | null {
  const { sessions, activeSessionId, isLoading, refresh } = useSessions();
  const [flagEnabled, setFlagEnabled] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void isChatPrimaryEnabled().then(setFlagEnabled); }, []);

  const handleSessionClick = useCallback((sessionId: string) => {
    window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="row"]');
    if (!rows || rows.length === 0) return;
    const idx = [...rows].indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') rows[Math.min(idx + 1, rows.length - 1)]?.focus();
    else rows[Math.max(idx - 1, 0)]?.focus();
  }, []);

  if (!flagEnabled) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-panel" aria-label="Sessions" role="table">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-sm font-semibold text-text-semantic-primary">Sessions</span>
        <NewSessionButton onCreated={refresh} />
      </div>
      <SessionList
        groups={groupSessions(sessions)}
        activeSessionId={activeSessionId}
        isLoading={isLoading}
        onSessionClick={handleSessionClick}
        onKeyDown={handleKeyDown}
        listRef={listRef}
      />
    </div>
  );
}
