/**
 * @vitest-environment jsdom
 *
 * ChatSearchOverlay — acceptance criteria tests.
 *
 * Covers:
 *  - Renders the overlay with search input.
 *  - Typing a query shows matching results.
 *  - Empty state shows when query has no matches.
 *  - No empty state when query is blank.
 *  - Clicking a result calls selectThread and closes the overlay.
 *  - Enter key on selected result calls selectThread and closes.
 *  - Escape key closes the overlay.
 *  - Backdrop click closes the overlay.
 *  - Scope toggle buttons render.
 *  - Typing in the input calls setQuery.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ChatSearchMatch,
  ChatSearchScope,
  UseChatSearchReturn,
} from '../../../hooks/useChatSearch';

// ── Mock useChatSearch ────────────────────────────────────────────────────────

let mockMatches: ChatSearchMatch[] = [];
let mockQuery = '';
let mockScope: ChatSearchScope = 'project';
const mockSetQuery = vi.fn((q: string) => {
  mockQuery = q;
});
const mockSetScope = vi.fn((s: ChatSearchScope) => {
  mockScope = s;
});
const mockSelectThread = vi.fn();

vi.mock('../../../hooks/useChatSearch', () => ({
  useChatSearch: (): UseChatSearchReturn => ({
    query: mockQuery,
    scope: mockScope,
    matches: mockMatches,
    setQuery: mockSetQuery,
    setScope: mockSetScope,
    selectThread: mockSelectThread,
  }),
}));

// ── Import after mock ─────────────────────────────────────────────────────────

import { ChatSearchOverlay } from './ChatSearchOverlay';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatch(overrides: Partial<ChatSearchMatch> = {}): ChatSearchMatch {
  return {
    threadId: 'thread-1',
    title: 'Fix the login bug',
    snippet: 'authentication service refactor',
    workspaceRoot: '/workspace/alpha',
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

function renderOverlay(onClose = vi.fn()): ReturnType<typeof render> {
  return render(<ChatSearchOverlay projectRoot="/workspace/alpha" onClose={onClose} />);
}

afterEach(() => {
  cleanup();
  mockMatches = [];
  mockQuery = '';
  mockScope = 'project';
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatSearchOverlay', () => {
  it('renders the overlay and search input', () => {
    renderOverlay();
    expect(screen.getByTestId('chat-search-overlay')).toBeTruthy();
    expect(screen.getByTestId('chat-search-input')).toBeTruthy();
  });

  it('renders results when matches are present', () => {
    mockMatches = [makeMatch(), makeMatch({ threadId: 'thread-2', title: 'Second chat' })];
    mockQuery = 'bug';
    renderOverlay();
    const results = screen.getAllByTestId('chat-search-result');
    expect(results).toHaveLength(2);
    expect(results[0].textContent).toContain('Fix the login bug');
  });

  it('shows empty state when query is non-empty and no matches', () => {
    mockMatches = [];
    mockQuery = 'xyzzy-no-match';
    renderOverlay();
    expect(screen.getByTestId('chat-search-empty')).toBeTruthy();
  });

  it('does not show empty state when query is blank', () => {
    mockMatches = [];
    mockQuery = '';
    renderOverlay();
    expect(screen.queryByTestId('chat-search-empty')).toBeNull();
  });

  it('clicking a result calls selectThread and onClose', () => {
    mockMatches = [makeMatch({ threadId: 'thread-abc' })];
    mockQuery = 'login';
    const onClose = vi.fn();
    renderOverlay(onClose);
    fireEvent.click(screen.getAllByTestId('chat-search-result')[0]);
    expect(mockSelectThread).toHaveBeenCalledWith('thread-abc');
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter key on selected result calls selectThread and onClose', () => {
    mockMatches = [makeMatch({ threadId: 'thread-enter' })];
    mockQuery = 'login';
    const onClose = vi.fn();
    renderOverlay(onClose);
    fireEvent.keyDown(screen.getByTestId('chat-search-input'), { key: 'Enter' });
    expect(mockSelectThread).toHaveBeenCalledWith('thread-enter');
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key closes the overlay', () => {
    const onClose = vi.fn();
    renderOverlay(onClose);
    fireEvent.keyDown(screen.getByTestId('chat-search-input'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the backdrop closes the overlay', () => {
    const onClose = vi.fn();
    renderOverlay(onClose);
    // fire click directly on the backdrop element (target === currentTarget)
    const backdrop = screen.getByTestId('chat-search-overlay');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders scope toggle buttons', () => {
    renderOverlay();
    expect(screen.getByText('Active project')).toBeTruthy();
    expect(screen.getByText('All projects')).toBeTruthy();
  });

  it('typing in the input calls setQuery', () => {
    renderOverlay();
    act(() => {
      fireEvent.change(screen.getByTestId('chat-search-input'), { target: { value: 'auth' } });
    });
    expect(mockSetQuery).toHaveBeenCalledWith('auth');
  });
});
