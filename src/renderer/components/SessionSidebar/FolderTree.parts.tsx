import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { closestCenter, DndContext } from '@dnd-kit/core';
import React, { useCallback, useState } from 'react';

import type { SessionRecord } from '../../types/electron';
import { SessionRow } from './SessionRow';

export const UNCATEGORIZED_ID = '__uncategorized__';

export interface FolderBucketProps {
  bucketId: string;
  label: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  draggingSessionId: string | null;
  overBucketId: string | null;
  onSessionClick: (id: string) => void;
  onRestored?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderActionButton({
  onClick,
  label,
  icon,
  hoverClass,
}: {
  onClick: () => void;
  label: string;
  icon: string;
  hoverClass: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`shrink-0 text-xs text-text-semantic-faint ${hoverClass} transition-colors px-1`}
    >
      {icon}
    </button>
  );
}

function FolderHeaderToggle({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 flex-1 min-w-0 text-left text-xs font-semibold
        text-text-semantic-secondary hover:text-text-semantic-primary transition-colors"
      aria-expanded={expanded}
    >
      <span className="shrink-0">{expanded ? '▾' : '▸'}</span>
      <span className="truncate">{label}</span>
      <span className="text-text-semantic-faint ml-1">({count})</span>
    </button>
  );
}

function FolderHeader({
  label,
  count,
  expanded,
  onToggle,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1 px-2 py-1 select-none">
      <FolderHeaderToggle label={label} count={count} expanded={expanded} onToggle={onToggle} />
      {onRename && (
        <FolderActionButton
          onClick={onRename}
          label={`Rename folder ${label}`}
          icon="✎"
          hoverClass="hover:text-text-semantic-primary"
        />
      )}
      {onDelete && (
        <FolderActionButton
          onClick={onDelete}
          label={`Delete folder ${label}`}
          icon="✕"
          hoverClass="hover:text-status-error"
        />
      )}
    </div>
  );
}

function DropZone({
  id,
  isOver,
  isEmpty,
  children,
}: {
  id: string;
  isOver: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const borderCls = isOver
    ? 'border border-dashed border-interactive-accent bg-interactive-accent-subtle'
    : 'border border-transparent';
  return (
    <div data-dropzone-id={id} className={`rounded transition-colors ${borderCls}`}>
      {isEmpty && !isOver && (
        <p className="px-4 py-2 text-xs text-text-semantic-faint italic">
          No sessions yet — drag one here
        </p>
      )}
      {children}
    </div>
  );
}

function DraggableRow({
  session,
  isActive,
  isDragging,
  onClick,
  onRestored,
}: {
  session: SessionRecord;
  isActive: boolean;
  isDragging: boolean;
  onClick: (id: string) => void;
  onRestored?: () => void;
}): React.ReactElement {
  return (
    <div
      data-draggable-id={session.id}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="transition-opacity"
    >
      <SessionRow session={session} isActive={isActive} onClick={onClick} onRestored={onRestored} />
    </div>
  );
}

function FolderBucketRows({
  bucketId,
  sessions,
  isOver,
  activeSessionId,
  draggingSessionId,
  onSessionClick,
  onRestored,
}: Pick<
  FolderBucketProps,
  'bucketId' | 'sessions' | 'activeSessionId' | 'draggingSessionId' | 'onSessionClick' | 'onRestored'
> & {
  isOver: boolean;
}): React.ReactElement {
  return (
    <DropZone id={bucketId} isOver={isOver} isEmpty={sessions.length === 0}>
      {sessions.map((session) => (
        <DraggableRow
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          isDragging={session.id === draggingSessionId}
          onClick={onSessionClick}
          onRestored={onRestored}
        />
      ))}
    </DropZone>
  );
}

export function FolderBucket({
  bucketId,
  label,
  sessions,
  activeSessionId,
  draggingSessionId,
  overBucketId,
  onSessionClick,
  onRestored,
  onRename,
  onDelete,
}: FolderBucketProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const isOver = overBucketId === bucketId;

  return (
    <div>
      <FolderHeader
        label={label}
        count={sessions.length}
        expanded={expanded}
        onToggle={toggle}
        onRename={onRename}
        onDelete={onDelete}
      />
      {expanded && (
        <FolderBucketRows
          bucketId={bucketId}
          sessions={sessions}
          isOver={isOver}
          activeSessionId={activeSessionId}
          draggingSessionId={draggingSessionId}
          onSessionClick={onSessionClick}
          onRestored={onRestored}
        />
      )}
    </div>
  );
}

export function FolderTreeView({
  uncategorized,
  buckets,
  draggingSession,
}: {
  uncategorized: FolderBucketProps;
  buckets: FolderBucketProps[];
  draggingSession: SessionRecord | null;
}): React.ReactElement {
  return (
    <>
      <FolderBucket {...uncategorized} />
      {buckets.map((bucket) => (
        <FolderBucket key={bucket.bucketId} {...bucket} />
      ))}
      <div className="pointer-events-none">
        {draggingSession && (
          <div className="opacity-90 shadow-lg rounded border border-border-accent bg-surface-raised">
            <SessionRow session={draggingSession} isActive={false} onClick={() => undefined} />
          </div>
        )}
      </div>
    </>
  );
}

export function FolderTreeShell({
  sensors,
  onDragStart,
  onDragOver,
  onDragEnd,
  children,
}: {
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}
