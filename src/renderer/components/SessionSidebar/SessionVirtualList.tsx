/**
 * SessionVirtualList.tsx — Virtualized session list (Wave 20 Phase E).
 *
 * Flattens SessionGroup[] into a typed flat-row array so @tanstack/react-virtual
 * can handle heterogeneous header + session rows in a single pass.
 *
 * Virtualization is active when total session count > 20. Below that threshold
 * the list renders the flat rows directly (no overhead from the virtualizer).
 *
 * Row heights:
 *   header row — 28px
 *   session row — 48px (two lines of text + optional restore button padding)
 */

import React from 'react';

import type { SessionRecord } from '../../types/electron';
import {
  flattenGroups,
  SessionVirtualListBody,
  SessionVirtualListLoading,
} from './SessionVirtualList.parts';

export { flattenGroups } from './SessionVirtualList.parts';

/** Total session count above which the list switches to the virtualizer. */
export const VIRTUALIZE_THRESHOLD = 20;

// ─── Group → flat array ───────────────────────────────────────────────────────

export interface SessionGroup {
  projectRoot: string;
  label: string;
  sessions: SessionRecord[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SessionVirtualListProps {
  groups: SessionGroup[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function SessionVirtualList({
  groups,
  activeSessionId,
  isLoading,
  onSessionClick,
  onRestored,
  onKeyDown,
}: SessionVirtualListProps): React.ReactElement {
  if (isLoading) {
    return <SessionVirtualListLoading />;
  }

  const totalSessions = groups.reduce((n, g) => n + g.sessions.length, 0);
  const rows = flattenGroups(groups);
  return (
    <SessionVirtualListBody
      totalSessions={totalSessions}
      rows={rows}
      activeSessionId={activeSessionId}
      onSessionClick={onSessionClick}
      onRestored={onRestored}
      onKeyDown={onKeyDown}
    />
  );
}
