/**
 * BranchCompareView.test.tsx — Wave 23 Phase E
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatThreadRecord } from '../../types/electron';
import { BranchCompareView } from './BranchCompareView';

afterEach(cleanup);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeThread(id: string, overrides: Partial<AgentChatThreadRecord> = {}): AgentChatThreadRecord {
  return {
    version: 1,
    id,
    workspaceRoot: '/proj',
    createdAt: 1000,
    updatedAt: 1001,
    title: `Thread ${id}`,
    status: 'idle',
    messages: [],
    ...overrides,
  };
}

function makeMessage(id: string, role: 'user' | 'assistant', content: string) {
  return { id, threadId: 'thread', role, content, createdAt: 1000 };
}

function setupElectronApi(
  handler: (threadId: string) => Promise<{ success: boolean; thread?: AgentChatThreadRecord; error?: string }>,
): void {
  Object.defineProperty(window, 'electronAPI', {
    value: { agentChat: { loadThread: vi.fn().mockImplementation(handler) } },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  setupElectronApi((id) => Promise.resolve({ success: true, thread: makeThread(id) }));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BranchCompareView', () => {
  it('shows loading state initially', () => {
    setupElectronApi(() => new Promise(() => undefined));
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('renders both thread labels after load', async () => {
    setupElectronApi((id) =>
      Promise.resolve({ success: true, thread: makeThread(id, { title: `Title-${id}` }) }),
    );
    render(
      <BranchCompareView leftThreadId="left" rightThreadId="right" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getAllByText('Title-left'));
    expect(screen.getAllByText('Title-left').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Title-right').length).toBeGreaterThan(0);
  });

  it('uses branchName when set instead of title', async () => {
    setupElectronApi((id) =>
      Promise.resolve({
        success: true,
        thread: makeThread(id, { branchName: `Branch-${id}`, title: 'ignored' }),
      }),
    );
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getAllByText('Branch-l'));
    expect(screen.getAllByText('Branch-l').length).toBeGreaterThan(0);
  });

  it('shows "No messages" when thread has empty messages', async () => {
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getAllByText(/no messages/i));
    expect(screen.getAllByText(/no messages/i).length).toBe(2);
  });

  it('renders messages from both threads', async () => {
    const leftThread = makeThread('l', {
      messages: [makeMessage('m1', 'user', 'Hello left')],
    });
    const rightThread = makeThread('r', {
      messages: [makeMessage('m2', 'assistant', 'Hello right')],
    });
    setupElectronApi((id) =>
      Promise.resolve({ success: true, thread: id === 'l' ? leftThread : rightThread }),
    );
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByText('Hello left'));
    expect(screen.getByText('Hello left')).toBeTruthy();
    expect(screen.getByText('Hello right')).toBeTruthy();
  });

  it('shows an error when loadThread fails', async () => {
    setupElectronApi(() => Promise.resolve({ success: false, error: 'DB error' }));
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toContain('DB error');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={onClose} />,
    );
    await waitFor(() => screen.getByLabelText('Close comparison'));
    fireEvent.click(screen.getByLabelText('Close comparison'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the dialog role with aria-modal', () => {
    setupElectronApi(() => new Promise(() => undefined));
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders swap arrow between branch labels in header', async () => {
    render(
      <BranchCompareView leftThreadId="l" rightThreadId="r" onClose={vi.fn()} />,
    );
    await waitFor(() => screen.getAllByText(/Thread l/));
    // The ⇄ (U+21C4) arrow is in the header
    expect(document.body.innerHTML).toContain('\u21C4');
  });
});
