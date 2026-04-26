import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import React, { useRef } from 'react';

import type { SessionRecord } from '../../types/electron';
import { SessionGroupHeader } from './SessionGroupHeader';
import { SessionRow } from './SessionRow';
import type { SessionGroup } from './SessionVirtualList';

interface FlatRowHeader {
  kind: 'header';
  projectRoot: string;
  label: string;
  count: number;
}

interface FlatRowSession {
  kind: 'row';
  session: SessionRecord;
}

type FlatRow = FlatRowHeader | FlatRowSession;

function estimateSize(row: FlatRow): number {
  return row.kind === 'header' ? 28 : 48;
}

export function flattenGroups(groups: SessionGroup[]): FlatRow[] {
  const sorted = [...groups].sort((a, b) => {
    const ap = a.sessions.some((s) => s.pinned) ? 1 : 0;
    const bp = b.sessions.some((s) => s.pinned) ? 1 : 0;
    return bp - ap;
  });
  const rows: FlatRow[] = [];
  for (const group of sorted) {
    rows.push({
      kind: 'header',
      projectRoot: group.projectRoot,
      label: group.label,
      count: group.sessions.length,
    });
    for (const session of group.sessions) {
      rows.push({ kind: 'row', session });
    }
  }
  return rows;
}

function LoadingState(): React.ReactElement {
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

function EmptyState(): React.ReactElement {
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

function VirtualRow({
  item,
  rows,
  activeSessionId,
  onSessionClick,
  onRestored,
}: {
  item: { key: React.Key; index: number; start: number };
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
}): React.ReactElement {
  return (
    <div
      key={item.key}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${item.start}px)`,
      }}
    >
      {renderVirtualRow(rows[item.index], activeSessionId, onSessionClick, onRestored)}
    </div>
  );
}

function VirtualizedRowsViewport({
  parentRef,
  virtualizer,
  rows,
  activeSessionId,
  onSessionClick,
  onRestored,
  onKeyDown,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}): React.ReactElement {
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
          <VirtualRow key={item.key} item={item} rows={rows} activeSessionId={activeSessionId} onSessionClick={onSessionClick} onRestored={onRestored} />
        ))}
      </div>
    </div>
  );
}

export function VirtualizedRows({
  rows,
  activeSessionId,
  onSessionClick,
  onRestored,
  onKeyDown,
}: {
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}): React.ReactElement {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateSize(rows[index]),
    overscan: 5,
  });
  return (
    <VirtualizedRowsViewport
      parentRef={parentRef}
      virtualizer={virtualizer}
      rows={rows}
      activeSessionId={activeSessionId}
      onSessionClick={onSessionClick}
      onRestored={onRestored}
      onKeyDown={onKeyDown}
    />
  );
}

function FlatRows({
  rows,
  activeSessionId,
  onSessionClick,
  onRestored,
  onKeyDown,
}: {
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}): React.ReactElement {
  return (
    <div role="grid" aria-label="Session list" className="flex-1 overflow-y-auto" onKeyDown={onKeyDown}>
      {rows.map((row) =>
        row.kind === 'header' ? (
          <SessionGroupHeader
            key={`h-${row.projectRoot}`}
            projectName={row.label}
            count={row.count}
          />
        ) : (
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

export function SessionVirtualListBody({
  totalSessions,
  rows,
  activeSessionId,
  onSessionClick,
  onRestored,
  onKeyDown,
}: {
  totalSessions: number;
  rows: FlatRow[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onRestored: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}): React.ReactElement {
  if (totalSessions === 0) {
    return <EmptyState />;
  }

  return totalSessions > 20 ? (
    <VirtualizedRows
      rows={rows}
      activeSessionId={activeSessionId}
      onSessionClick={onSessionClick}
      onRestored={onRestored}
      onKeyDown={onKeyDown}
    />
  ) : (
    <FlatRows
      rows={rows}
      activeSessionId={activeSessionId}
      onSessionClick={onSessionClick}
      onRestored={onRestored}
      onKeyDown={onKeyDown}
    />
  );
}

export function SessionVirtualListLoading(): React.ReactElement {
  return <LoadingState />;
}
