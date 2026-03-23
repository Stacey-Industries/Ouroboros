/**
 * TerminalTabs — tab bar for managing multiple terminal sessions.
 */

import React, { useCallback, useRef, useState } from 'react';

import { shortModelName } from './ClaudeModelMenu';
import { NewTerminalMenu } from './NewTerminalMenu';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string;
  title: string;
  status: 'running' | 'exited';
  isClaude?: boolean;
  isCodex?: boolean;
  claudeSessionId?: string;
  codexThreadId?: string;
  splitSessionId?: string;
  splitStatus?: 'running' | 'exited';
  /** Provider:model override used when spawning (for tab tooltip display) */
  model?: string;
}

export interface TerminalTabsProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onNewClaude: (providerModel?: string) => void;
  onNewCodex: (model?: string) => void;
  onReorder?: (reordered: TerminalSession[]) => void;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M5 1V9M1 5H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Tab class builder ────────────────────────────────────────────────────────

function getTabClasses(
  isActive: boolean,
  isExited: boolean,
  isDragging: boolean,
  isDragOver: boolean,
): string {
  const base =
    'relative flex items-center gap-1.5 px-3 h-full cursor-pointer select-none text-xs font-mono border-r border-border-semantic shrink-0 transition-all duration-150';
  const dragOver =
    isDragOver && !isDragging
      ? 'bg-surface-raised border-l-2 border-l-[var(--interactive-accent)]'
      : '';
  const dragging = isDragging ? 'opacity-40' : '';
  const state = isActive
    ? 'bg-[var(--term-bg,var(--surface-base))] text-text-semantic-primary after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-interactive-accent'
    : isExited
      ? 'bg-surface-panel text-text-semantic-muted opacity-60 hover:opacity-80 hover:bg-surface-raised'
      : 'bg-surface-panel text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-raised';
  return [base, dragOver, dragging, state].filter(Boolean).join(' ');
}

// ─── Single tab ───────────────────────────────────────────────────────────────

interface TabItemProps {
  session: TerminalSession;
  isActive: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onActivate: () => void;
  onClose: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function TabItem({
  session,
  isActive,
  isDragging,
  isDragOver,
  onActivate,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TabItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const isExited = session.status === 'exited';
  const modelSuffix = session.model ? ` (${shortModelName(session.model)})` : '';
  const label = isExited
    ? `${session.title} [exited]${modelSuffix}`
    : `${session.title}${modelSuffix}`;

  return (
    <div
      draggable
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      title={label}
      className={getTabClasses(isActive, isExited, isDragging, isDragOver)}
      onClick={onActivate}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => e.key === 'Enter' && onActivate()}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {session.isClaude && (
        <span
          className="flex-shrink-0 text-interactive-accent"
          style={{ fontSize: '10px', lineHeight: 1 }}
          title="Claude Code session"
        >
          &#9670;
        </span>
      )}
      {session.isCodex && (
        <span
          className="flex-shrink-0 text-[var(--accent-blue,var(--interactive-accent))]"
          style={{ fontSize: '10px', lineHeight: 1 }}
          title="Codex session"
        >
          &#9671;
        </span>
      )}
      {isExited && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-text-semantic-muted flex-shrink-0"
          aria-label="exited"
        />
      )}
      <span className="truncate max-w-[120px]">{label}</span>
      {(hovered || isActive) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-0.5 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-panel transition-colors duration-100"
          title={`Close ${session.title}`}
          aria-label={`Close ${session.title}`}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

// ─── Drag-and-drop hook ──────────────────────────────────────────────────────

function useTabDragDrop(
  sessions: TerminalSession[],
  onReorder?: (reordered: TerminalSession[]) => void,
) {
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggingIdRef.current !== id) setDragOverId(id);
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = draggingIdRef.current;
      if (!sourceId || sourceId === targetId || !onReorder) {
        setDragOverId(null);
        return;
      }
      const reordered = [...sessions];
      const fromIdx = reordered.findIndex((s) => s.id === sourceId);
      const toIdx = reordered.findIndex((s) => s.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      const [item] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, item);
      onReorder(reordered);
      setDragOverId(null);
    },
    [sessions, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragLeave = useCallback(() => setDragOverId(null), []);

  return {
    draggingId,
    dragOverId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}

function renderSessionTab({
  session,
  activeSessionId,
  dnd,
  onActivate,
  onClose,
}: {
  session: TerminalSession;
  activeSessionId: string | null;
  dnd: ReturnType<typeof useTabDragDrop>;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}): React.ReactElement {
  return (
    <TabItem
      key={session.id}
      session={session}
      isActive={session.id === activeSessionId}
      isDragging={dnd.draggingId === session.id}
      isDragOver={dnd.dragOverId === session.id}
      onActivate={() => onActivate(session.id)}
      onClose={() => onClose(session.id)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        dnd.handleDragStart(session.id);
      }}
      onDragOver={(e) => dnd.handleDragOver(e, session.id)}
      onDragLeave={dnd.handleDragLeave}
      onDrop={() => dnd.handleDrop(session.id)}
      onDragEnd={dnd.handleDragEnd}
    />
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

export function TerminalTabs({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onNew,
  onNewClaude,
  onNewCodex,
  onReorder,
}: TerminalTabsProps): React.ReactElement {
  const dnd = useTabDragDrop(sessions, onReorder);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const handleToggleMenu = useCallback(() => setShowNewMenu((prev) => !prev), []);
  const handleMenuClose = useCallback(() => setShowNewMenu(false), []);
  return (
    <div
      className="flex items-stretch h-full overflow-x-auto overflow-y-hidden"
      role="tablist"
      aria-label="Terminal sessions"
    >
      {sessions.map((session) =>
        renderSessionTab({ session, activeSessionId, dnd, onActivate, onClose }),
      )}
      <div className="relative flex items-stretch">
        <button
          ref={plusBtnRef}
          onClick={handleToggleMenu}
          aria-label="New terminal"
          aria-haspopup="true"
          aria-expanded={showNewMenu}
          className="flex-shrink-0 flex items-center justify-center w-7 h-full text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-raised transition-all duration-150 border-r border-border-semantic rounded-sm"
        >
          <PlusIcon />
        </button>
        {showNewMenu && (
          <NewTerminalMenu
            anchorRef={plusBtnRef}
            onNew={onNew}
            onNewClaude={onNewClaude}
            onNewCodex={onNewCodex}
            onClose={handleMenuClose}
          />
        )}
      </div>
    </div>
  );
}
