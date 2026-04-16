/**
 * SessionSidebar — top-level session list panel (Wave 20 Phase A/E).
 *
 * Phase E additions:
 *   - Filter bar (status / project / worktree) sits between header and list.
 *   - SessionVirtualList handles flat-row virtualisation for > 20 sessions.
 *   - Restore button wired through onRestored → refresh.
 *
 * Gated by the `layout.chatPrimary` feature flag — renders null when off.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { SESSION_SWITCH_EVENT } from '../../hooks/appEventNames';
import type { SessionRecord } from '../../types/electron';
import { FolderTree } from './FolderTree';
import { NewSessionButton } from './NewSessionButton';
import { SessionFilterBar } from './SessionFilterBar';
import type { FilterState } from './sessionFilters';
import { applyFilters,DEFAULT_FILTER_STATE } from './sessionFilters';
import type { SessionGroup } from './SessionVirtualList';
import { SessionVirtualList } from './SessionVirtualList';
import { useFolders } from './useFolders';
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

// ─── SessionListArea — folder tree vs flat virtual list ───────────────────────

interface SessionListAreaProps {
  folders: import('../../types/electron').SessionFolder[];
  sessions: SessionRecord[];
  filtered: SessionRecord[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

function SessionListArea({
  folders, filtered, activeSessionId, isLoading, onSessionClick, onRestored, onKeyDown,
}: SessionListAreaProps): React.ReactElement {
  if (folders.length > 0) {
    return (
      <FolderTree folders={folders} sessions={filtered} activeSessionId={activeSessionId}
        onSessionClick={onSessionClick} onRestored={onRestored} />
    );
  }
  return (
    <SessionVirtualList groups={groupSessions(filtered)} activeSessionId={activeSessionId}
      isLoading={isLoading} onSessionClick={onSessionClick} onRestored={onRestored}
      onKeyDown={onKeyDown} />
  );
}

// ─── SessionSidebar ───────────────────────────────────────────────────────────

export function SessionSidebar(): React.ReactElement | null {
  const { sessions, activeSessionId, isLoading, refresh } = useSessions();
  const { folders } = useFolders();
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { void isChatPrimaryEnabled().then(setFlagEnabled); }, []);

  const handleSessionClick = useCallback((sessionId: string) => {
    window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="row"][tabindex="0"]');
    if (!rows || rows.length === 0) return;
    const idx = [...rows].indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') rows[Math.min(idx + 1, rows.length - 1)]?.focus();
    else rows[Math.max(idx - 1, 0)]?.focus();
  }, []);

  if (!flagEnabled) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-panel">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-sm font-semibold text-text-semantic-primary">Sessions</span>
        <NewSessionButton onCreated={refresh} />
      </div>
      <SessionFilterBar filters={filters} onChange={setFilters} />
      <div ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <SessionListArea folders={folders} sessions={sessions} filtered={applyFilters(sessions, filters)}
          activeSessionId={activeSessionId} isLoading={isLoading} onSessionClick={handleSessionClick}
          onRestored={refresh} onKeyDown={handleKeyDown} />
      </div>
    </div>
  );
}
