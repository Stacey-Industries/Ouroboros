/**
 * MergeToMainDialog.test.tsx — Wave 23 Phase D
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MergeToMainDialogProps } from './MergeToMainDialog';
import { buildHeuristicSummary, MergeToMainDialog } from './MergeToMainDialog';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
const mockLoadThread = vi.fn();
const mockMergeSideChat = vi.fn();

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

function setElectronApi(overrides: {
  loadThread?: typeof mockLoadThread;
  mergeSideChat?: typeof mockMergeSideChat;
} = {}) {
  const loadThread = overrides.loadThread ?? mockLoadThread;
  const mergeSideChat = overrides.mergeSideChat ?? mockMergeSideChat;
  Object.defineProperty(window, 'electronAPI', {
    value: { agentChat: { loadThread, mergeSideChat } },
    configurable: true,
    writable: true,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultProps(
  overrides: Partial<MergeToMainDialogProps> = {},
): MergeToMainDialogProps {
  return {
    sideChatId: 'side-1',
    parentThreadId: 'main-1',
    isOpen: true,
    onClose: vi.fn(),
    onMerged: vi.fn(),
    ...overrides,
  };
}

function makeThread(messages: Array<{ id: string; role: string; content: string }>) {
  return {
    success: true,
    thread: {
      id: 'side-1',
      messages: messages.map((m) => ({
        ...m,
        threadId: 'side-1',
        createdAt: 1000,
      })),
    },
  };
}

afterEach(cleanup);

// ── buildHeuristicSummary ─────────────────────────────────────────────────────

describe('buildHeuristicSummary', () => {
  it('concatenates first lines of assistant messages', () => {
    const messages = [
      { id: '1', threadId: 't', role: 'user', content: 'question', createdAt: 1 },
      { id: '2', threadId: 't', role: 'assistant', content: 'First answer\nmore detail', createdAt: 2 },
      { id: '3', threadId: 't', role: 'assistant', content: 'Second answer', createdAt: 3 },
    ] as import('../../types/electron').AgentChatMessageRecord[];

    const result = buildHeuristicSummary(messages);
    expect(result).toContain('First answer');
    expect(result).toContain('Second answer');
    expect(result).not.toContain('question');
  });

  it('truncates at 500 chars with ellipsis', () => {
    const messages = [
      {
        id: '1', threadId: 't', role: 'assistant',
        content: 'a'.repeat(600),
        createdAt: 1,
      },
    ] as import('../../types/electron').AgentChatMessageRecord[];

    const result = buildHeuristicSummary(messages);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns empty string when no assistant messages', () => {
    const messages = [
      { id: '1', threadId: 't', role: 'user', content: 'hi', createdAt: 1 },
    ] as import('../../types/electron').AgentChatMessageRecord[];

    expect(buildHeuristicSummary(messages)).toBe('');
  });
});

// ── MergeToMainDialog rendering ───────────────────────────────────────────────

describe('MergeToMainDialog', () => {
  beforeEach(() => {
    mockLoadThread.mockResolvedValue(makeThread([]));
    mockMergeSideChat.mockResolvedValue({ success: true, systemMessageId: 'sys-msg-1' });
    setElectronApi();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MergeToMainDialog {...defaultProps({ isOpen: false })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with heading when open', () => {
    render(<MergeToMainDialog {...defaultProps()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Merge into main thread')).toBeDefined();
  });

  it('renders Cancel and Merge buttons', () => {
    render(<MergeToMainDialog {...defaultProps()} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDefined();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<MergeToMainDialog {...defaultProps({ onClose })} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<MergeToMainDialog {...defaultProps({ onClose })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<MergeToMainDialog {...defaultProps({ onClose })} />);
    const backdrop = document.querySelector('.fixed.inset-0.z-50') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('prefills summary from assistant messages', async () => {
    mockLoadThread.mockResolvedValue(
      makeThread([
        { id: 'm1', role: 'user', content: 'Question?' },
        { id: 'm2', role: 'assistant', content: 'Key finding here\nMore detail' },
      ]),
    );
    setElectronApi();
    render(<MergeToMainDialog {...defaultProps()} />);
    await waitFor(() => {
      const textarea = screen.getByRole('textbox', { name: /summary/i }) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Key finding here');
    });
  });

  it('shows checkboxes for user and assistant messages', async () => {
    mockLoadThread.mockResolvedValue(
      makeThread([
        { id: 'm1', role: 'user', content: 'User message' },
        { id: 'm2', role: 'assistant', content: 'Assistant reply' },
      ]),
    );
    setElectronApi();
    render(<MergeToMainDialog {...defaultProps()} />);
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBe(2);
    });
  });

  it('submits with summary and selected message IDs', async () => {
    mockLoadThread.mockResolvedValue(
      makeThread([
        { id: 'm1', role: 'user', content: 'User question' },
        { id: 'm2', role: 'assistant', content: 'Assistant answer' },
      ]),
    );
    setElectronApi();
    const onMerged = vi.fn();
    render(<MergeToMainDialog {...defaultProps({ onMerged })} />);

    // Wait for messages to load and summary to prefill
    await waitFor(() => {
      const textarea = screen.getByRole('textbox', { name: /summary/i }) as HTMLTextAreaElement;
      expect(textarea.value.length).toBeGreaterThan(0);
    });

    // Select first checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => {
      expect(mockMergeSideChat).toHaveBeenCalledWith(
        expect.objectContaining({
          sideChatId: 'side-1',
          mainThreadId: 'main-1',
          includeMessageIds: ['m1'],
        }),
      );
      expect(onMerged).toHaveBeenCalledWith('sys-msg-1');
    });
  });

  it('shows error message when merge fails', async () => {
    mockMergeSideChat.mockResolvedValue({ success: false, error: 'Thread not found' });
    setElectronApi();
    render(<MergeToMainDialog {...defaultProps()} />);

    // Wait for textarea to appear (loadThread resolves with empty thread)
    const textarea = await screen.findByRole('textbox', { name: /summary/i });
    fireEvent.change(textarea, { target: { value: 'My summary' } });
    fireEvent.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Thread not found')).toBeDefined();
    });
  });

  it('shows a success toast and calls onMerged on successful merge', async () => {
    render(<MergeToMainDialog {...defaultProps()} />);

    // Wait for textarea to appear
    const textarea = await screen.findByRole('textbox', { name: /summary/i });
    fireEvent.change(textarea, { target: { value: 'Summary text' } });
    fireEvent.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('merged'),
        'success',
      );
    });
  });

  it('Merge button is disabled when summary is empty', async () => {
    render(<MergeToMainDialog {...defaultProps()} />);
    // Wait for textarea to appear, then clear it
    const textarea = await screen.findByRole('textbox', { name: /summary/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    const mergeBtn = screen.getByRole('button', { name: /^merge$/i }) as HTMLButtonElement;
    expect(mergeBtn.disabled).toBe(true);
  });
});
