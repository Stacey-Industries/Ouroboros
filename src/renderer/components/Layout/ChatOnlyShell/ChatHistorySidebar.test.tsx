/**
 * @vitest-environment jsdom
 *
 * ChatHistorySidebar — smoke tests (Wave 44 Phase B).
 *
 * Covers:
 *  - mode='pinned' renders the full 280px sidebar.
 *  - mode='collapsed' renders the icon rail only.
 *  - mode='hidden' renders nothing.
 *  - Search input filters displayed threads.
 *  - New chat button calls onSelectThread(null) to start a fresh draft.
 *  - Footer placeholder present in pinned mode.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../../types/electron';
import { ChatHistorySidebar } from './ChatHistorySidebar';

afterEach(() => cleanup());

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOnSelectThread = vi.fn();
const mockThreads: AgentChatThreadRecord[] = [
  {
    version: 1, id: 't1', workspaceRoot: '/project/alpha',
    createdAt: Date.now() - 7200_000, updatedAt: Date.now() - 60_000,
    title: 'Fix login bug', status: 'complete', messages: [],
  },
  {
    version: 1, id: 't2', workspaceRoot: '/project/alpha',
    createdAt: Date.now() - 3600_000, updatedAt: Date.now() - 120_000,
    title: 'Add dark mode', status: 'idle', messages: [],
  },
];

vi.mock('../../AgentChat/agentChatStore', () => ({
  AgentChatStoreContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  useAgentChatStoreContext: (selector: (s: unknown) => unknown) => {
    const fakeStore = {
      threads: mockThreads,
      activeThread: null,
      onSelectThread: mockOnSelectThread,
    };
    return selector(fakeStore);
  },
}));

vi.mock('../../AgentChat/BranchRenameDialog', () => ({
  BranchRenameDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="rename-dialog">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('./ChatHistoryList', () => ({
  ChatHistoryList: ({
    threads,
    onSelectThread,
  }: {
    threads: AgentChatThreadRecord[];
    activeThreadId: string | null;
    onSelectThread: (id: string) => void;
    onDeleteThread: (id: string) => Promise<void>;
    onPinThread: (id: string, pinned: boolean) => Promise<void>;
    onRenameThread: (t: AgentChatThreadRecord) => void;
  }) => (
    <div data-testid="chat-history-list">
      {threads.map((t) => (
        <div key={t.id} data-testid="list-row" data-thread-id={t.id}
          onClick={() => onSelectThread(t.id)}>
          {t.title}
        </div>
      ))}
    </div>
  ),
}));

// ── Setup electron API stub ───────────────────────────────────────────────────

beforeEach(() => {
  mockOnSelectThread.mockClear();
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: { deleteThread: vi.fn().mockResolvedValue({ success: true }) },
    },
    configurable: true,
    writable: true,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatHistorySidebar', () => {
  describe('mode=pinned', () => {
    it('renders the full sidebar', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      expect(screen.getByTestId('chat-history-sidebar')).toBeDefined();
    });

    it('renders the thread list', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      expect(screen.getByTestId('chat-history-list')).toBeDefined();
    });

    it('renders the search input', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      expect(screen.getByTestId('search-input')).toBeDefined();
    });

    it('renders the new-chat button', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      expect(screen.getByTestId('new-chat-button')).toBeDefined();
    });

    it('mounts ChatOnlyUserMenu in the footer slot (Phase C)', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      expect(screen.getByTestId('user-menu-trigger')).toBeDefined();
    });

    it('new-chat button calls onSelectThread with null (start new draft)', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      fireEvent.click(screen.getByTestId('new-chat-button'));
      expect(mockOnSelectThread).toHaveBeenCalledWith(null);
    });

    it('search input filters threads by title', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'login' } });
      // List should only show the matching thread
      const rows = screen.getAllByTestId('list-row');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Fix login bug');
    });

    it('empty search shows all threads', () => {
      render(<ChatHistorySidebar mode="pinned" />);
      const rows = screen.getAllByTestId('list-row');
      expect(rows.length).toBe(2);
    });
  });

  describe('mode=collapsed', () => {
    it('renders the collapsed rail', () => {
      render(<ChatHistorySidebar mode="collapsed" />);
      expect(screen.getByTestId('sidebar-collapsed-rail')).toBeDefined();
    });

    it('does NOT render the full sidebar', () => {
      render(<ChatHistorySidebar mode="collapsed" />);
      expect(screen.queryByTestId('chat-history-sidebar')).toBeNull();
    });

    it('does NOT render the thread list', () => {
      render(<ChatHistorySidebar mode="collapsed" />);
      expect(screen.queryByTestId('chat-history-list')).toBeNull();
    });

    it('new-chat button in rail calls onSelectThread with null (start new draft)', () => {
      render(<ChatHistorySidebar mode="collapsed" />);
      fireEvent.click(screen.getByTitle('New chat'));
      expect(mockOnSelectThread).toHaveBeenCalledWith(null);
    });
  });

  describe('mode=hidden', () => {
    it('renders nothing', () => {
      const { container } = render(<ChatHistorySidebar mode="hidden" />);
      expect(container.firstChild).toBeNull();
    });
  });
});
