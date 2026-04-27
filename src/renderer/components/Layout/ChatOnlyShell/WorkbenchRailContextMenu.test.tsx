/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import type { WorkbenchRecentChatItem } from './useWorkbenchRecentChats';
import type { WorkbenchSessionItem } from './useWorkbenchSessions';
import {
  WorkbenchRailContextMenu,
  type WorkbenchRailContextMenuProps,
} from './WorkbenchRailContextMenu';

afterEach(() => {
  cleanup();
});

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/workspace',
    createdAt: 1,
    updatedAt: 2,
    title: 'Test thread',
    status: 'idle',
    messages: [],
    pinned: false,
    ...overrides,
  };
}

function makeSessionItem(id = 'session-1'): WorkbenchSessionItem {
  return {
    kind: 'session',
    id,
    projectLabel: 'My Project',
    projectRoot: '/workspace',
    shortId: id.slice(0, 6),
    lastUsedLabel: 'just now',
    terminalCount: 0,
    chatCount: 1,
    isPinned: false,
    isWorktree: false,
    isActive: false,
    status: 'active',
    threadStatus: null,
    attention: { kind: 'none', rank: 0, label: null, tone: 'neutral', isSticky: false },
    rawSession: {
      id,
      projectRoot: '/workspace',
      createdAt: 1,
      lastUsedAt: 2,
    } as WorkbenchSessionItem['rawSession'],
  };
}

function makeChatItem(thread?: AgentChatThreadRecord): WorkbenchRecentChatItem {
  const t = thread ?? makeThread();
  return {
    kind: 'chat',
    id: t.id,
    title: t.title,
    projectLabel: 'My Project',
    shortId: t.id.slice(0, 6),
    lastUpdatedLabel: 'just now',
    messageCount: 3,
    isPinned: Boolean(t.pinned),
    isActive: false,
    attention: { kind: 'none', rank: 0, label: null, tone: 'neutral', isSticky: false },
    rawThread: t,
  };
}

function makeActions() {
  return {
    onDeleteSession: vi.fn().mockResolvedValue(undefined),
    onArchiveSession: vi.fn().mockResolvedValue(undefined),
    onDeleteThread: vi.fn().mockResolvedValue(undefined),
    onPinThread: vi.fn().mockResolvedValue(undefined),
    onRenameThread: vi.fn(),
  };
}

function renderMenu(props: WorkbenchRailContextMenuProps): void {
  render(<WorkbenchRailContextMenu {...props} />);
}

describe('WorkbenchRailContextMenu — session row', () => {
  it('shows Archive and Delete items for a session', () => {
    const actions = makeActions();
    renderMenu({
      state: { item: makeSessionItem(), position: { x: 10, y: 10 } },
      actions,
      onClose: vi.fn(),
    });
    expect(screen.getByTestId('workbench-session-context-menu')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('has role=menu on the session panel and no border-border-subtle class', () => {
    const actions = makeActions();
    renderMenu({
      state: { item: makeSessionItem(), position: { x: 10, y: 10 } },
      actions,
      onClose: vi.fn(),
    });
    const panel = screen.getByTestId('workbench-session-context-menu');
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.className).not.toContain('border-border-subtle');
  });

  it('menu items have role=menuitem', () => {
    const actions = makeActions();
    renderMenu({
      state: { item: makeSessionItem(), position: { x: 10, y: 10 } },
      actions,
      onClose: vi.fn(),
    });
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
  });

  it('calls onArchiveSession and onClose when Archive is clicked', () => {
    const actions = makeActions();
    const onClose = vi.fn();
    renderMenu({
      state: { item: makeSessionItem('sess-2'), position: { x: 0, y: 0 } },
      actions,
      onClose,
    });
    fireEvent.click(screen.getByText('Archive'));
    expect(actions.onArchiveSession).toHaveBeenCalledWith('sess-2');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onDeleteSession and onClose when Delete is clicked', () => {
    const actions = makeActions();
    const onClose = vi.fn();
    renderMenu({
      state: { item: makeSessionItem('sess-3'), position: { x: 0, y: 0 } },
      actions,
      onClose,
    });
    fireEvent.click(screen.getByText('Delete'));
    expect(actions.onDeleteSession).toHaveBeenCalledWith('sess-3');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WorkbenchRailContextMenu — chat row', () => {
  it('shows Pin, Rename, and Delete items for an unpinned thread', () => {
    const actions = makeActions();
    renderMenu({
      state: { item: makeChatItem(), position: { x: 10, y: 10 } },
      actions,
      onClose: vi.fn(),
    });
    expect(screen.getByTestId('workbench-chat-context-menu')).toBeTruthy();
    expect(screen.getByText('Pin')).toBeTruthy();
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('has role=menu on the chat panel and no border-border-subtle class', () => {
    const actions = makeActions();
    renderMenu({
      state: { item: makeChatItem(), position: { x: 10, y: 10 } },
      actions,
      onClose: vi.fn(),
    });
    const panel = screen.getByTestId('workbench-chat-context-menu');
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.className).not.toContain('border-border-subtle');
  });

  it('shows Unpin for a pinned thread', () => {
    const actions = makeActions();
    renderMenu({
      state: {
        item: makeChatItem(makeThread({ pinned: true })),
        position: { x: 0, y: 0 },
      },
      actions,
      onClose: vi.fn(),
    });
    expect(screen.getByText('Unpin')).toBeTruthy();
  });

  it('calls onPinThread with correct args when Pin is clicked', () => {
    const actions = makeActions();
    const onClose = vi.fn();
    const thread = makeThread({ id: 'thread-pin', pinned: false });
    renderMenu({
      state: { item: makeChatItem(thread), position: { x: 0, y: 0 } },
      actions,
      onClose,
    });
    fireEvent.click(screen.getByText('Pin'));
    expect(actions.onPinThread).toHaveBeenCalledWith('thread-pin', true);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onRenameThread when Rename is clicked', () => {
    const actions = makeActions();
    const onClose = vi.fn();
    const thread = makeThread({ id: 'thread-rename' });
    renderMenu({
      state: { item: makeChatItem(thread), position: { x: 0, y: 0 } },
      actions,
      onClose,
    });
    fireEvent.click(screen.getByText('Rename'));
    expect(actions.onRenameThread).toHaveBeenCalledWith(thread);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onDeleteThread when Delete is clicked', () => {
    const actions = makeActions();
    const onClose = vi.fn();
    const thread = makeThread({ id: 'thread-del' });
    renderMenu({
      state: { item: makeChatItem(thread), position: { x: 0, y: 0 } },
      actions,
      onClose,
    });
    fireEvent.click(screen.getByText('Delete'));
    expect(actions.onDeleteThread).toHaveBeenCalledWith('thread-del');
    expect(onClose).toHaveBeenCalled();
  });
});
