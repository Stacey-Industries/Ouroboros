/**
 * @vitest-environment jsdom
 *
 * ChatSearchOverlay.parts — smoke tests for stateless UI atoms.
 *
 * Covers:
 *  - ScopeToggle renders both buttons; clicking each calls onChange.
 *  - ResultRow renders title/snippet/model; click calls onActivate.
 *  - ResultRow Enter key calls onActivate.
 *  - ResultsList renders one row per match.
 *  - DialogPanel shows empty state when query non-empty + no matches.
 *  - DialogPanel renders results list when matches present.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatSearchMatch } from '../../../hooks/useChatSearch';
import { DialogPanel, ResultRow, ResultsList, ScopeToggle } from './ChatSearchOverlay.parts';

afterEach(() => cleanup());

function makeMatch(overrides: Partial<ChatSearchMatch> = {}): ChatSearchMatch {
  return {
    threadId: 'thread-1',
    title: 'Fix the login bug',
    snippet: 'auth service refactor',
    workspaceRoot: '/workspace/alpha',
    model: 'claude-sonnet-4-6',
    ...overrides,
  };
}

describe('ScopeToggle', () => {
  it('renders both scope buttons', () => {
    render(<ScopeToggle scope="project" onChange={vi.fn()} />);
    expect(screen.getByText('Active project')).toBeTruthy();
    expect(screen.getByText('All projects')).toBeTruthy();
  });

  it('clicking Active project calls onChange with project', () => {
    const onChange = vi.fn();
    render(<ScopeToggle scope="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Active project'));
    expect(onChange).toHaveBeenCalledWith('project');
  });

  it('clicking All projects calls onChange with all', () => {
    const onChange = vi.fn();
    render(<ScopeToggle scope="project" onChange={onChange} />);
    fireEvent.click(screen.getByText('All projects'));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});

describe('ResultRow', () => {
  it('renders title, snippet, and model', () => {
    render(<ResultRow match={makeMatch()} isSelected={false} onActivate={vi.fn()} />);
    expect(screen.getByText('Fix the login bug')).toBeTruthy();
    expect(screen.getByText('auth service refactor')).toBeTruthy();
    expect(screen.getByText('claude-sonnet-4-6')).toBeTruthy();
  });

  it('click calls onActivate', () => {
    const onActivate = vi.fn();
    render(<ResultRow match={makeMatch()} isSelected={false} onActivate={onActivate} />);
    fireEvent.click(screen.getByTestId('chat-search-result'));
    expect(onActivate).toHaveBeenCalled();
  });

  it('Enter key calls onActivate', () => {
    const onActivate = vi.fn();
    render(<ResultRow match={makeMatch()} isSelected={false} onActivate={onActivate} />);
    fireEvent.keyDown(screen.getByTestId('chat-search-result'), { key: 'Enter' });
    expect(onActivate).toHaveBeenCalled();
  });
});

describe('ResultsList', () => {
  it('renders one row per match', () => {
    const matches = [makeMatch(), makeMatch({ threadId: 'thread-2', title: 'Second chat' })];
    render(
      <ResultsList matches={matches} selectedIdx={0} onSelectIdx={vi.fn()} onActivate={vi.fn()} />,
    );
    expect(screen.getAllByTestId('chat-search-result')).toHaveLength(2);
  });

  it('calls onSelectIdx and onActivate when a row is clicked', () => {
    const onSelectIdx = vi.fn();
    const onActivate = vi.fn();
    render(
      <ResultsList
        matches={[makeMatch({ threadId: 'abc' })]}
        selectedIdx={0}
        onSelectIdx={onSelectIdx}
        onActivate={onActivate}
      />,
    );
    fireEvent.click(screen.getByTestId('chat-search-result'));
    expect(onSelectIdx).toHaveBeenCalledWith(0);
    expect(onActivate).toHaveBeenCalledWith('abc');
  });
});

describe('DialogPanel', () => {
  const baseProps = {
    query: '',
    scope: 'project' as const,
    matches: [],
    selectedIdx: 0,
    inputRef: createRef<HTMLInputElement>(),
    onQueryChange: vi.fn(),
    onScopeChange: vi.fn(),
    onKeyDown: vi.fn(),
    onSelectIdx: vi.fn(),
    onActivate: vi.fn(),
  };

  it('shows empty state when query is non-empty and no matches', () => {
    render(<DialogPanel {...baseProps} query="xyzzy" matches={[]} />);
    expect(screen.getByTestId('chat-search-empty')).toBeTruthy();
  });

  it('does not show empty state when query is blank', () => {
    render(<DialogPanel {...baseProps} query="" matches={[]} />);
    expect(screen.queryByTestId('chat-search-empty')).toBeNull();
  });

  it('renders results list when matches are present', () => {
    render(<DialogPanel {...baseProps} query="bug" matches={[makeMatch()]} />);
    expect(screen.getAllByTestId('chat-search-result')).toHaveLength(1);
  });
});
