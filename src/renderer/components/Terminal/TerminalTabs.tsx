/**
 * TerminalTabs — tab bar for managing multiple terminal sessions.
 */

import React, { useCallback, useRef, useState } from 'react';

import { ProductIcon } from '../shared/ProductIcon';
import { shortModelName } from './ClaudeModelMenu';
import { NewTerminalMenu } from './NewTerminalMenu';
import { getTabClasses, type TabDragDropState,useTabDragDrop } from './TerminalTabs.dnd';

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
    <ProductIcon
      iconId="close"
      size={8}
      fallback={
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
      }
    />
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <ProductIcon
      iconId="add"
      size={10}
      fallback={
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
      }
    />
  );
}

// ─── Tab badges ───────────────────────────────────────────────────────────────

function TabBadges({
  session,
  isExited,
}: {
  session: TerminalSession;
  isExited: boolean;
}): React.ReactElement {
  return (
    <>
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
    </>
  );
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

function TabCloseButton({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex-shrink-0 p-0.5 rounded text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-panel transition-colors duration-100"
      title={`Close ${title}`}
      aria-label={`Close ${title}`}
    >
      <CloseIcon />
    </button>
  );
}

interface TabItemContentProps extends TabItemProps {
  hovered: boolean;
  setHovered: React.Dispatch<React.SetStateAction<boolean>>;
  isExited: boolean;
  label: string;
}

function TabItemContent(p: TabItemContentProps): React.ReactElement {
  return (
    <div
      draggable
      role="tab"
      aria-selected={p.isActive}
      tabIndex={0}
      title={p.label}
      className={getTabClasses(p.isActive, p.isExited, p.isDragging, p.isDragOver)}
      onClick={p.onActivate}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          p.onClose();
        }
      }}
      onMouseEnter={() => p.setHovered(true)}
      onMouseLeave={() => p.setHovered(false)}
      onKeyDown={(e) => e.key === 'Enter' && p.onActivate()}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      onDragEnd={p.onDragEnd}
    >
      <TabBadges session={p.session} isExited={p.isExited} />
      <span className="truncate max-w-[120px]">{p.label}</span>
      {(p.hovered || p.isActive) && <TabCloseButton title={p.session.title} onClose={p.onClose} />}
    </div>
  );
}

function TabItem(props: TabItemProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const isExited = props.session.status === 'exited';
  const modelSuffix = props.session.model ? ` (${shortModelName(props.session.model)})` : '';
  const label = isExited
    ? `${props.session.title} [exited]${modelSuffix}`
    : `${props.session.title}${modelSuffix}`;
  return (
    <TabItemContent
      {...props}
      hovered={hovered}
      setHovered={setHovered}
      isExited={isExited}
      label={label}
    />
  );
}

// ─── Tab renderer ─────────────────────────────────────────────────────────────

function renderSessionTab({
  session,
  activeSessionId,
  dnd,
  onActivate,
  onClose,
}: {
  session: TerminalSession;
  activeSessionId: string | null;
  dnd: TabDragDropState;
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

// ─── New terminal button ───────────────────────────────────────────────────────

function NewTerminalButton({
  onNew,
  onNewClaude,
  onNewCodex,
}: Pick<TerminalTabsProps, 'onNew' | 'onNewClaude' | 'onNewCodex'>): React.ReactElement {
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const handleToggleMenu = useCallback(() => setShowNewMenu((prev) => !prev), []);
  const handleMenuClose = useCallback(() => setShowNewMenu(false), []);
  return (
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
  return (
    <div
      className="flex items-stretch h-full overflow-x-auto overflow-y-hidden"
      role="tablist"
      aria-label="Terminal sessions"
    >
      {sessions.map((session) =>
        renderSessionTab({ session, activeSessionId, dnd, onActivate, onClose }),
      )}
      <NewTerminalButton onNew={onNew} onNewClaude={onNewClaude} onNewCodex={onNewCodex} />
    </div>
  );
}
