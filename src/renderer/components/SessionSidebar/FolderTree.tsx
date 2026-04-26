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

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import React, { useState } from 'react';

import type { SessionFolder, SessionRecord } from '../../types/electron';
import {
  type FolderBucketProps,
  FolderTreeShell,
  FolderTreeView,
  UNCATEGORIZED_ID,
} from './FolderTree.parts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FolderTreeProps {
  folders: SessionFolder[];
  sessions: SessionRecord[];
  activeSessionId: string | null;
  onSessionClick: (sessionId: string) => void;
  onRestored?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function folderForSession(sessionId: string, folders: SessionFolder[]): string | null {
  return folders.find((f) => f.sessionIds.includes(sessionId))?.id ?? null;
}

function sortedFolders(folders: SessionFolder[]): SessionFolder[] {
  return [...folders].sort((a, b) => a.order - b.order);
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

function resolveMove(sessionId: string, toBucketId: string, folders: SessionFolder[]): void {
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

function mapSessionsForFolder(folder: SessionFolder, sessions: SessionRecord[]): SessionRecord[] {
  return folder.sessionIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is SessionRecord => s !== undefined);
}

function buildBucketProps(
  folder: SessionFolder,
  sessions: SessionRecord[],
  shared: Pick<
    FolderBucketProps,
    'activeSessionId' | 'draggingSessionId' | 'overBucketId' | 'onSessionClick' | 'onRestored'
  >,
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

function buildTreeBuckets(
  folders: SessionFolder[],
  sessions: SessionRecord[],
  shared: Pick<
    FolderBucketProps,
    'activeSessionId' | 'draggingSessionId' | 'overBucketId' | 'onSessionClick' | 'onRestored'
  >,
  ): FolderBucketProps[] {
  return sortedFolders(folders).map((folder) => buildBucketProps(folder, sessions, shared));
}

function useFolderTreeModel({
  folders,
  sessions,
  activeSessionId,
  draggingId,
  overBucketId,
  onSessionClick,
  onRestored,
}: {
  folders: SessionFolder[];
  sessions: SessionRecord[];
  activeSessionId: string | null;
  draggingId: string | null;
  overBucketId: string | null;
  onSessionClick: (sessionId: string) => void;
  onRestored?: () => void;
}): {
  draggingSession: SessionRecord | null;
  uncategorized: SessionRecord[];
  buckets: FolderBucketProps[];
  shared: Pick<
    FolderBucketProps,
    'activeSessionId' | 'draggingSessionId' | 'overBucketId' | 'onSessionClick' | 'onRestored'
  >;
} {
  const shared = {
    activeSessionId,
    draggingSessionId: draggingId,
    overBucketId,
    onSessionClick,
    onRestored,
  };
  const draggingSession = draggingId ? (sessions.find((s) => s.id === draggingId) ?? null) : null;
  const categorized = new Set(folders.flatMap((f) => f.sessionIds));
  const uncategorized = sessions.filter((s) => !categorized.has(s.id));
  const buckets = buildTreeBuckets(folders, sessions, shared);
  return { draggingSession, uncategorized, buckets, shared };
}

export function FolderTree({
  folders,
  sessions,
  activeSessionId,
  onSessionClick,
  onRestored,
}: FolderTreeProps): React.ReactElement {
  const { draggingId, setDraggingId, overBucketId, setOverBucketId, sensors } = useFolderDndState();
  const { draggingSession, uncategorized, buckets, shared } = useFolderTreeModel({ folders, sessions, activeSessionId, draggingId, overBucketId, onSessionClick, onRestored });

  return (
    <FolderTreeShell
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
      onDragOver={(e: DragOverEvent) => setOverBucketId(e.over ? String(e.over.id) : null)}
      onDragEnd={(e: DragEndEvent) => {
        const sid = String(e.active.id);
        const to = e.over ? String(e.over.id) : null;
        setDraggingId(null);
        setOverBucketId(null);
        if (to) resolveMove(sid, to, folders);
      }}
    >
      <FolderTreeView
        uncategorized={{ ...shared, bucketId: UNCATEGORIZED_ID, label: 'Uncategorized', sessions: uncategorized }}
        buckets={buckets}
        draggingSession={draggingSession}
      />
    </FolderTreeShell>
  );
}
