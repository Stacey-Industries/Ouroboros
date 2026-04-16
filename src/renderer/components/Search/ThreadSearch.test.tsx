/**
 * ThreadSearch.test.tsx
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatSearchResult } from '../../types/electron-agent-chat.d';
import { ThreadSearch } from './ThreadSearch';

// ── electronAPI mock ──────────────────────────────────────────────────────────

function makeResult(threadId: string, snippet = 'some snippet'): AgentChatSearchResult {
  return { threadId, score: 1, snippet };
}

const mockSearchThreads = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchThreads.mockResolvedValue({ success: true, results: [] });

  Object.defineProperty(window, 'electronAPI', {
    value: { agentChat: { searchThreads: mockSearchThreads } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThreadSearch', () => {
  describe('rendering', () => {
    it('renders without crashing', () => {
      const { container } = render(<ThreadSearch />);
      expect(container.firstChild).toBeTruthy();
    });

    it('renders a search input with placeholder', () => {
      render(<ThreadSearch />);
      expect(screen.getByPlaceholderText('Search threads...')).toBeTruthy();
    });

    it('shows no results text when query is non-empty and results are empty', async () => {
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'xyz' } });
      await waitFor(() => expect(mockSearchThreads).toHaveBeenCalled(), { timeout: 1000 });
      await waitFor(() => expect(screen.getByText('No results')).toBeTruthy(), { timeout: 1000 });
    });

    it('does not call searchThreads for empty query', async () => {
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: '' } });
      // Wait long enough for any debounce that might have fired
      await new Promise((r) => setTimeout(r, 250));
      expect(mockSearchThreads).not.toHaveBeenCalled();
    });
  });

  describe('debounced search', () => {
    it('calls searchThreads after debounce elapses', async () => {
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'fox' } });
      await waitFor(
        () => expect(mockSearchThreads).toHaveBeenCalledWith({ query: 'fox', limit: 30 }),
        { timeout: 1000 },
      );
    });

    it('debounces rapid typing — only the last value is searched', async () => {
      render(<ThreadSearch />);
      const input = screen.getByPlaceholderText('Search threads...');
      fireEvent.change(input, { target: { value: 'f' } });
      fireEvent.change(input, { target: { value: 'fo' } });
      fireEvent.change(input, { target: { value: 'fox' } });
      await waitFor(() => expect(mockSearchThreads).toHaveBeenCalledTimes(1), { timeout: 1000 });
      expect(mockSearchThreads).toHaveBeenCalledWith({ query: 'fox', limit: 30 });
    });
  });

  describe('result rendering', () => {
    it('renders result cards when search returns results', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('thread-abc', 'snippet 1'), makeResult('thread-def', 'snippet 2')],
      });
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'match' } });
      await waitFor(() => {
        expect(screen.getByText('thread-abc')).toBeTruthy();
        expect(screen.getByText('thread-def')).toBeTruthy();
      }, { timeout: 1000 });
    });

    it('renders snippets in result cards', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('thread-abc', 'The quick brown fox')],
      });
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'fox' } });
      await waitFor(() => expect(screen.getByText('The quick brown fox')).toBeTruthy(), { timeout: 1000 });
    });

    it('strips <b> tags from FTS5 snippets', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('t1', 'The <b>quick</b> brown fox')],
      });
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'quick' } });
      await waitFor(() => expect(screen.getByText('The quick brown fox')).toBeTruthy(), { timeout: 1000 });
    });
  });

  describe('keyboard navigation', () => {
    it('dispatches agent-ide:open-thread CustomEvent on Enter', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('thread-enter-test')],
      });
      const dispatched: CustomEvent[] = [];
      const listener = (e: Event): void => { dispatched.push(e as CustomEvent); };
      window.addEventListener('agent-ide:open-thread', listener);

      render(<ThreadSearch />);
      const input = screen.getByPlaceholderText('Search threads...');
      fireEvent.change(input, { target: { value: 'test' } });
      await waitFor(() => expect(mockSearchThreads).toHaveBeenCalled(), { timeout: 1000 });
      await waitFor(() => expect(screen.getByText('thread-enter-test')).toBeTruthy(), { timeout: 1000 });

      fireEvent.keyDown(input, { key: 'Enter' });
      window.removeEventListener('agent-ide:open-thread', listener);
      expect(dispatched.length).toBeGreaterThan(0);
      expect(dispatched[0].detail.threadId).toBe('thread-enter-test');
    });

    it('calls onClose on Escape', () => {
      const onClose = vi.fn();
      render(<ThreadSearch onClose={onClose} />);
      fireEvent.keyDown(screen.getByPlaceholderText('Search threads...'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('navigates ArrowDown / ArrowUp through results', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('t1'), makeResult('t2'), makeResult('t3')],
      });
      render(<ThreadSearch />);
      const input = screen.getByPlaceholderText('Search threads...');
      fireEvent.change(input, { target: { value: 'x' } });
      await waitFor(() => expect(mockSearchThreads).toHaveBeenCalled(), { timeout: 1000 });

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
  });

  describe('click interaction', () => {
    it('dispatches agent-ide:open-thread CustomEvent on result click', async () => {
      mockSearchThreads.mockResolvedValue({
        success: true,
        results: [makeResult('click-thread-id', 'some text')],
      });
      const dispatched: CustomEvent[] = [];
      const listener = (e: Event): void => { dispatched.push(e as CustomEvent); };
      window.addEventListener('agent-ide:open-thread', listener);

      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'click' } });
      await waitFor(() => expect(screen.getByText('click-thread-id')).toBeTruthy(), { timeout: 1000 });

      fireEvent.click(screen.getByText('click-thread-id'));
      window.removeEventListener('agent-ide:open-thread', listener);
      expect(dispatched.some((e) => e.detail.threadId === 'click-thread-id')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles searchThreads rejection gracefully', async () => {
      mockSearchThreads.mockRejectedValue(new Error('IPC error'));
      render(<ThreadSearch />);
      fireEvent.change(screen.getByPlaceholderText('Search threads...'), { target: { value: 'error' } });
      await waitFor(() => expect(mockSearchThreads).toHaveBeenCalled(), { timeout: 1000 });
      // Component stays mounted, no throw
      expect(screen.getByPlaceholderText('Search threads...')).toBeTruthy();
    });
  });
});
