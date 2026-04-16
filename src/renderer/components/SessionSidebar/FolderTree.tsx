/**
 * FolderTree — collapsible folder groups with drag-and-drop session assignment.
 *
 * Wave 21 Phase D.
 *
 * Layout:
 *   - "Uncategorized" bucket at top for sessions not in any folder.
 *   - User-created folders rendered as collapsible groups below.
 *   - Each SessionRow is a draggable item; each bucket is a drop target.
 *   - On drop: optimistic local state update, then folderCrud.moveSession IPC call.
 *   - folderCrud:changed broadcast reconciles final state.
 */

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import React, { useCallback, useState } from 'react';

import type { SessionFolder, SessionRecord } from '../../types/electron';
import { SessionRow } from './SessionRow';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FolderTreeProps {
  folders: SessionFolder[];
  sessions: SessionRecord[];
  activeSessionId: string | null;
  onSessionClick: (sessionId: string) => void;
  onRestored?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNCATEGORIZED_ID = '__uncategorized__';

function folderForSession(
  sessionId: string,
  folders: SessionFolder[],
): string | null {
  return folders.find((f) => f.sessionIds.includes(sessionId))?.id ?? null;
}

function sortedFolders(folders: SessionFolder[]): SessionFolder[] {
  return [...folders].sort((a, b) => a.order - b.order);
}

// ─── FolderHeader ─────────────────────────────────────────────────────────────

interface FolderActionButtonProps {
  onClick: () => void;
  label: string;
  icon: string;
  hoverClass: string;
}

function FolderActionButton({ onClick, label, icon, hoverClass }: FolderActionButtonProps): React.ReactElement {
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

interface FolderHeaderProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

function FolderHeader({ label, count, expanded, onToggle, onRename, onDelete }: FolderHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 px-2 py-1 select-none">
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
      {onRename && (
        <FolderActionButton onClick={onRename} label={`Rename folder ${label}`} icon="✎" hoverClass="hover:text-text-semantic-primary" />
      )}
      {onDelete && (
        <FolderActionButton onClick={onDelete} label={`Delete folder ${label}`} icon="✕" hoverClass="hover:text-status-error" />
      )}
    </div>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  id: string;
  isOver: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}

function DropZone({ id, isOver, isEmpty, children }: DropZoneProps): React.ReactElement {
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

// ─── DraggableRow ─────────────────────────────────────────────────────────────

interface DraggableRowProps {
  session: SessionRecord;
  isActive: boolean;
  isDragging: boolean;
  onClick: (id: string) => void;
  onRestored?: () => void;
}

function DraggableRow({
  session, isActive, isDragging, onClick, onRestored,
}: DraggableRowProps): React.ReactElement {
  return (
    <div
      data-draggable-id={session.id}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="transition-opacity"
    >
      <SessionRow
        session={session}
        isActive={isActive}
        onClick={onClick}
        onRestored={onRestored}
      />
    </div>
  );
}

// ─── FolderBucket ─────────────────────────────────────────────────────────────

interface FolderBucketProps {
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

function FolderBucket({
  bucketId, label, sessions, activeSessionId, draggingSessionId,
  overBucketId, onSessionClick, onRestored, onRename, onDelete,
}: FolderBucketProps): React.ReactElement {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
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
        <DropZone id={bucketId} isOver={isOver} isEmpty={sessions.length === 0}>
          {sessions.map((s) => (
            <DraggableRow
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              isDragging={s.id === draggingSessionId}
              onClick={onSessionClick}
              onRestored={onRestored}
            />
          ))}
        </DropZone>
      )}
    </div>
  );
}

// ─── Folder mutation helpers (module-level to stay within per-function limit) ──

function promptRenameFolder(folder: SessionFolder): void {
  if (!window.electronAPI) return;
  const name = prompt('Rename folder:', folder.name);
  if (!name || !name.trim() || name.trim() === folder.name) return;
  void window.electronAPI.folderCrud.rename(folder.id, name.trim());
}

function confirmDeleteFolder(folder: SessionFolder): void {
  if (!window.electronAPI) return;
  if (!confirm(`Delete folder "${folder.name}"? Sessions will become uncategorized.`)) return;
  void window.electronAPI.folderCrud.delete(folder.id);
}

function resolveMove(
  sessionId: string,
  toBucketId: string,
  folders: SessionFolder[],
): void {
  if (!window.electronAPI) return;
  const fromBucketId = folderForSession(sessionId, folders);
  const toFolder = toBucketId === UNCATEGORIZED_ID ? null : toBucketId;
  const fromFolder = fromBucketId ?? null;
  if (fromFolder === toFolder) return;
  void window.electronAPI.folderCrud.moveSession(fromFolder, toFolder, sessionId);
}

// ─── FolderTree ───────────────────────────────────────────────────────────────

function useFolderDndState() {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overBucketId, setOverBucketId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  return { draggingId, setDraggingId, overBucketId, setOverBucketId, sensors };
}

// ─── Module-level session-to-folder mapper ────────────────────────────────────

function mapSessionsForFolder(
  folder: SessionFolder,
  sessions: SessionRecord[],
): SessionRecord[] {
  return folder.sessionIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is SessionRecord => s !== undefined);
}

// ─── FolderTree ───────────────────────────────────────────────────────────────

function buildBucketProps(
  folder: SessionFolder,
  sessions: SessionRecord[],
  shared: Pick<FolderBucketProps, 'activeSessionId' | 'draggingSessionId' | 'overBucketId' | 'onSessionClick' | 'onRestored'>,
): FolderBucketProps {
  return {
    ...shared,
    bucketId: folder.id,
    label: folder.name,
    sessions: mapSessionsForFolder(folder, sessions),
    onRename: () => promptRenameFolder(folder),
    onDelete: () => confirmDeleteFolder(folder),
  };
}

export function FolderTree({
  folders, sessions, activeSessionId, onSessionClick, onRestored,
}: FolderTreeProps): React.ReactElement {
  const { draggingId, setDraggingId, overBucketId, setOverBucketId, sensors } = useFolderDndState();
  const draggingSession = draggingId ? sessions.find((s) => s.id === draggingId) ?? null : null;
  const categorized = new Set(folders.flatMap((f) => f.sessionIds));
  const uncategorized = sessions.filter((s) => !categorized.has(s.id));
  const shared = { activeSessionId, draggingSessionId: draggingId, overBucketId, onSessionClick, onRestored };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragOver={(e: { over: { id: string } | null }) => setOverBucketId(e.over ? String(e.over.id) : null)}
      onDragEnd={(e: DragEndEvent) => { const sid = String(e.active.id); const to = e.over ? String(e.over.id) : null; setDraggingId(null); setOverBucketId(null); if (to) resolveMove(sid, to, folders); }}
    >
      <FolderBucket {...shared} bucketId={UNCATEGORIZED_ID} label="Uncategorized" sessions={uncategorized} />
      {sortedFolders(folders).map((folder) => (
        <FolderBucket key={folder.id} {...buildBucketProps(folder, sessions, shared)} />
      ))}
      <DragOverlay>
        {draggingSession && (
          <div className="opacity-90 shadow-lg rounded border border-border-accent bg-surface-raised">
            <SessionRow session={draggingSession} isActive={false} onClick={() => undefined} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
