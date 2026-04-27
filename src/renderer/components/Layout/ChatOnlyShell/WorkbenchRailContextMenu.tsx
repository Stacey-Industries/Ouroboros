/**
 * WorkbenchRailContextMenu — right-click / "…" context menu for rail rows.
 *
 * Session rows: Delete, Archive.
 * Chat rows: Pin/Unpin, Rename, Delete.
 *
 * Follows the ChatHistoryRow.ContextMenu pattern (portal + backdrop).
 */

import React, { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AgentChatThreadRecord } from '../../../types/electron';
import type { WorkbenchRecentChatItem } from './useWorkbenchRecentChats';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';

export type WorkbenchRowItem = WorkbenchSessionItem | WorkbenchRecentChatItem;

// ── Handlers interface ────────────────────────────────────────────────────────

export interface WorkbenchRailActions {
  onDeleteSession: (sessionId: string) => Promise<void>;
  onArchiveSession: (sessionId: string) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
  onPinThread: (threadId: string, pinned: boolean) => Promise<void>;
  onRenameThread: (thread: AgentChatThreadRecord) => void;
}

const WorkbenchRailActionsContext = createContext<WorkbenchRailActions | null>(null);

export function WorkbenchRailActionsProvider({
  children,
  actions,
}: {
  children: React.ReactNode;
  actions: WorkbenchRailActions;
}): React.ReactElement {
  return (
    <WorkbenchRailActionsContext.Provider value={actions}>
      {children}
    </WorkbenchRailActionsContext.Provider>
  );
}

export function useWorkbenchRailActions(): WorkbenchRailActions | null {
  return useContext(WorkbenchRailActionsContext);
}

// ── Menu primitives ───────────────────────────────────────────────────────────

const MENU_ITEM_CLS =
  'px-3 py-1.5 text-sm text-text-semantic-primary hover:bg-surface-hover cursor-pointer select-none';

function MenuDivider(): React.ReactElement {
  return <div className="my-1 border-t border-border-subtle" />;
}

interface MenuItemProps {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

function MenuItem({ label, danger, onClick }: MenuItemProps): React.ReactElement {
  return (
    <div
      className={`${MENU_ITEM_CLS}${danger ? ' hover:text-status-error' : ''}`}
      onClick={onClick}
    >
      {label}
    </div>
  );
}

interface MenuPosition {
  x: number;
  y: number;
}

function MenuBackdrop({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-[9000]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
  );
}

function MenuPanel({
  position,
  testId,
  children,
}: {
  position: MenuPosition;
  testId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className="fixed z-[9001] min-w-[160px] rounded border border-border-subtle bg-surface-overlay py-1 shadow-lg"
      style={{ top: position.y, left: position.x }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

// ── Session context menu ──────────────────────────────────────────────────────

function SessionMenuBody({
  item,
  position,
  actions,
  onClose,
}: {
  item: WorkbenchSessionItem;
  position: MenuPosition;
  actions: WorkbenchRailActions;
  onClose: () => void;
}): React.ReactElement {
  const close = (fn: () => void): (() => void) => (): void => {
    fn();
    onClose();
  };
  return (
    <>
      <MenuBackdrop onClose={onClose} />
      <MenuPanel position={position} testId="workbench-session-context-menu">
        <MenuItem
          label="Archive"
          onClick={close(() => {
            void actions.onArchiveSession(item.id);
          })}
        />
        <MenuDivider />
        <MenuItem
          label="Delete"
          danger
          onClick={close(() => {
            void actions.onDeleteSession(item.id);
          })}
        />
      </MenuPanel>
    </>
  );
}

// ── Chat context menu ─────────────────────────────────────────────────────────

function ChatMenuBody({
  item,
  position,
  actions,
  onClose,
}: {
  item: WorkbenchRecentChatItem;
  position: MenuPosition;
  actions: WorkbenchRailActions;
  onClose: () => void;
}): React.ReactElement {
  const thread = item.thread;
  const close = (fn: () => void): (() => void) => (): void => {
    fn();
    onClose();
  };
  return (
    <>
      <MenuBackdrop onClose={onClose} />
      <MenuPanel position={position} testId="workbench-chat-context-menu">
        <MenuItem
          label={thread.pinned ? 'Unpin' : 'Pin'}
          onClick={close(() => actions.onPinThread(thread.id, !thread.pinned))}
        />
        <MenuItem label="Rename" onClick={close(() => actions.onRenameThread(thread))} />
        <MenuDivider />
        <MenuItem
          label="Delete"
          danger
          onClick={close(() => {
            void actions.onDeleteThread(thread.id);
          })}
        />
      </MenuPanel>
    </>
  );
}

// ── useRowContextMenu ─────────────────────────────────────────────────────────

interface ContextMenuState {
  item: WorkbenchRowItem;
  position: MenuPosition;
}

export interface RowContextMenuResult {
  menuState: ContextMenuState | null;
  openMenu: (item: WorkbenchRowItem, e: React.MouseEvent) => void;
  closeMenu: () => void;
}

export function useRowContextMenu(): RowContextMenuResult {
  const [menuState, setMenuState] = useState<ContextMenuState | null>(null);
  const openMenu = useCallback((item: WorkbenchRowItem, e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ item, position: { x: e.clientX, y: e.clientY } });
  }, []);
  const closeMenu = useCallback((): void => {
    setMenuState(null);
  }, []);
  return { menuState, openMenu, closeMenu };
}

// ── WorkbenchRailContextMenu ──────────────────────────────────────────────────

export interface WorkbenchRailContextMenuProps {
  state: ContextMenuState;
  actions: WorkbenchRailActions;
  onClose: () => void;
}

function WorkbenchRailContextMenuBody({
  state,
  actions,
  onClose,
}: WorkbenchRailContextMenuProps): React.ReactElement {
  if (state.item.kind === 'session') {
    return (
      <SessionMenuBody
        item={state.item}
        position={state.position}
        actions={actions}
        onClose={onClose}
      />
    );
  }
  return (
    <ChatMenuBody
      item={state.item}
      position={state.position}
      actions={actions}
      onClose={onClose}
    />
  );
}

export function WorkbenchRailContextMenu(
  props: WorkbenchRailContextMenuProps,
): React.ReactElement {
  return createPortal(<WorkbenchRailContextMenuBody {...props} />, document.body);
}
