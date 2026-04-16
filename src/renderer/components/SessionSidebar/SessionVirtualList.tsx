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

import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef } from 'react';

import type { SessionRecord } from '../../types/electron';
import { SessionGroupHeader } from './SessionGroupHeader';
import { SessionRow } from './SessionRow';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VIRTUALIZE_THRESHOLD = 20;
const HEADER_HEIGHT = 28;
const ROW_HEIGHT = 48;

// ─── Flat row types ───────────────────────────────────────────────────────────

interface HeaderRow { kind: 'header'; projectRoot: string; label: string; count: number }
interface SessionFlatRow { kind: 'row'; session: SessionRecord }
type FlatRow = HeaderRow | SessionFlatRow;

// ─── Group → flat array ───────────────────────────────────────────────────────

export interface SessionGroup {
  projectRoot: string;
  label: string;
  sessions: SessionRecord[];
}

/**
 * Flatten groups into a typed flat-row array for the virtualizer.
 *
 * Within each group, sessions are already sorted by `applyFilters` (pinned
 * first). Across groups, groups that contain at least one pinned session sort
 * before groups that contain none — preserving "pinned items to the top"
 * across the entire list.
 */
export function flattenGroups(groups: SessionGroup[]): FlatRow[] {
  const sorted = [...groups].sort((a, b) => {
    const ap = a.sessions.some((s) => s.pinned) ? 1 : 0;
    const bp = b.sessions.some((s) => s.pinned) ? 1 : 0;
    return bp - ap;
  });
  const rows: FlatRow[] = [];
  for (const g of sorted) {
    rows.push({ kind: 'header', projectRoot: g.projectRoot, label: g.label, count: g.sessions.length });
    for (const s of g.sessions) {
      rows.push({ kind: 'row', session: s });
    }
  }
  return rows;
}

function estimateSize(row: FlatRow): number {
  return row.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;
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

// ─── Virtualized renderer ─────────────────────────────────────────────────────

interface VirtualCoreProps {
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

function renderVirtualRow(
  row: FlatRow,
  activeSessionId: string | null,
  onSessionClick: (id: string) => void,
  onRestored: () => void,
): React.ReactNode {
  if (row.kind === 'header') {
    return <SessionGroupHeader projectName={row.label} count={row.count} />;
  }
  return (
    <SessionRow
      session={row.session}
      isActive={row.session.id === activeSessionId}
      onClick={onSessionClick}
      onRestored={onRestored}
    />
  );
}

function VirtualizedRows({
  rows, activeSessionId, onSessionClick, onRestored, onKeyDown,
}: VirtualCoreProps): React.ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (idx) => estimateSize(rows[idx]),
    overscan: 5,
  });
  return (
    <div
      ref={parentRef}
      role="grid"
      aria-label="Session list"
      data-testid="session-virtual-list"
      className="flex-1 overflow-y-auto"
      onKeyDown={onKeyDown}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
          >
            {renderVirtualRow(rows[item.index], activeSessionId, onSessionClick, onRestored)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Flat (non-virtual) renderer ──────────────────────────────────────────────

function FlatRows({
  rows, activeSessionId, onSessionClick, onRestored, onKeyDown,
}: VirtualCoreProps): React.ReactElement {
  return (
    <div
      role="grid"
      aria-label="Session list"
      className="flex-1 overflow-y-auto"
      onKeyDown={onKeyDown}
    >
      {rows.map((row) =>
        row.kind === 'header'
          ? <SessionGroupHeader key={`h-${row.projectRoot}`} projectName={row.label} count={row.count} />
          : (
            <SessionRow
              key={row.session.id}
              session={row.session}
              isActive={row.session.id === activeSessionId}
              onClick={onSessionClick}
              onRestored={onRestored}
            />
          ),
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function SessionVirtualList({
  groups,
  activeSessionId,
  isLoading,
  onSessionClick,
  onRestored,
  onKeyDown,
}: SessionVirtualListProps): React.ReactElement {
  if (isLoading) {
    return (
      <div role="grid" aria-label="Session list" className="flex-1 overflow-y-auto">
        <div role="row">
          <div role="gridcell" aria-live="polite" className="px-3 py-4 text-xs text-text-semantic-muted">
            Loading…
          </div>
        </div>
      </div>
    );
  }

  const totalSessions = groups.reduce((n, g) => n + g.sessions.length, 0);
  if (totalSessions === 0) {
    return (
      <div role="grid" aria-label="Session list" className="flex-1 overflow-y-auto">
        <div role="row">
          <div role="gridcell" className="px-3 py-4 text-xs text-text-semantic-muted">
            No sessions yet. Click <strong>New</strong> to start one.
          </div>
        </div>
      </div>
    );
  }

  const rows = flattenGroups(groups);
  const coreProps: VirtualCoreProps = {
    rows, activeSessionId, onSessionClick, onRestored, onKeyDown,
  };

  return totalSessions > VIRTUALIZE_THRESHOLD
    ? <VirtualizedRows {...coreProps} />
    : <FlatRows {...coreProps} />;
}
