/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { AgentChatThreadList } from './AgentChatThreadList';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/project',
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
    title: 'My Thread',
    status: 'idle',
    messages: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('AgentChatThreadList — rendering', () => {
  it('renders without crashing with empty threads', () => {
    const { container } = render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[]}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('shows "No previous chats yet." when threads is empty', () => {
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[]}
      />,
    );
    expect(screen.getByText(/No previous chats yet/)).toBeTruthy();
  });

  it('renders thread title for each thread', () => {
    const threads = [
      makeThread({ id: 'a', title: 'Alpha Thread' }),
      makeThread({ id: 'b', title: 'Beta Thread' }),
    ];
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={threads}
      />,
    );
    expect(screen.getByText('Alpha Thread')).toBeTruthy();
    expect(screen.getByText('Beta Thread')).toBeTruthy();
  });

  it('renders the "New" button', () => {
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[]}
      />,
    );
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('calls onNewChat when New button is clicked', () => {
    const onNewChat = vi.fn();
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={onNewChat}
        onSelectThread={vi.fn()}
        threads={[]}
      />,
    );
    fireEvent.click(screen.getByText('New'));
    expect(onNewChat).toHaveBeenCalledOnce();
  });
});

// ─── Thread selection ─────────────────────────────────────────────────────────

describe('AgentChatThreadList — selection', () => {
  it('calls onSelectThread when a thread button is clicked', () => {
    const onSelectThread = vi.fn();
    const thread = makeThread({ id: 'thread-xyz', title: 'Click Me' });
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={onSelectThread}
        threads={[thread]}
      />,
    );
    fireEvent.click(screen.getByText('Click Me'));
    expect(onSelectThread).toHaveBeenCalledWith('thread-xyz');
  });

  it('shows export/import row only for the active thread', () => {
    const threads = [
      makeThread({ id: 'active-1', title: 'Active Thread' }),
      makeThread({ id: 'other-1', title: 'Other Thread' }),
    ];
    render(
      <AgentChatThreadList
        activeThreadId="active-1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={threads}
      />,
    );
    // Export format selector appears for active thread
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(1);
    // Export button appears
    expect(screen.getByText('Export')).toBeTruthy();
    // Import label appears
    expect(screen.getByText('Import')).toBeTruthy();
  });

  it('does not show export/import row when no thread is active', () => {
    const threads = [makeThread({ id: 't1', title: 'Thread One' })];
    render(
      <AgentChatThreadList
        activeThreadId={null}
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={threads}
      />,
    );
    expect(screen.queryByText('Export')).toBeNull();
    expect(screen.queryByText('Import')).toBeNull();
  });
});

// ─── Export format selector ───────────────────────────────────────────────────

describe('AgentChatThreadList — export format selector', () => {
  it('has MD, JSON, HTML options in the format selector', () => {
    const thread = makeThread({ id: 't1', title: 'T1' });
    render(
      <AgentChatThreadList
        activeThreadId="t1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[thread]}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('markdown');
    expect(optionValues).toContain('json');
    expect(optionValues).toContain('html');
  });

  it('defaults to markdown format', () => {
    const thread = makeThread({ id: 't1', title: 'T1' });
    render(
      <AgentChatThreadList
        activeThreadId="t1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[thread]}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('markdown');
  });

  it('updates format when select changes', () => {
    const thread = makeThread({ id: 't1', title: 'T1' });
    render(
      <AgentChatThreadList
        activeThreadId="t1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[thread]}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'json' } });
    expect(select.value).toBe('json');
  });
});

// ─── Import file input ────────────────────────────────────────────────────────

describe('AgentChatThreadList — import input', () => {
  it('renders a hidden file input for import', () => {
    const thread = makeThread({ id: 't1', title: 'T1' });
    const { container } = render(
      <AgentChatThreadList
        activeThreadId="t1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[thread]}
      />,
    );
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    expect(fileInput?.classList.contains('sr-only')).toBe(true);
  });

  it('file input accepts .json, .md, .txt', () => {
    const thread = makeThread({ id: 't1', title: 'T1' });
    const { container } = render(
      <AgentChatThreadList
        activeThreadId="t1"
        onNewChat={vi.fn()}
        onSelectThread={vi.fn()}
        threads={[thread]}
      />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput?.accept).toBe('.json,.md,.txt');
  });
});
