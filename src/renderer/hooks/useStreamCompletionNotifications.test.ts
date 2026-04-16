/**
 * useStreamCompletionNotifications.test.ts
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockOnStreamChunk = vi.fn();
const mockLoadThread = vi.fn();
const mockShowStreamCompletionNotification = vi.fn();

vi.mock('electron-log/renderer', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub window.electronAPI before the module is imported
const electronAPI = {
  agentChat: {
    onStreamChunk: mockOnStreamChunk,
    loadThread: mockLoadThread,
  },
  app: {
    showStreamCompletionNotification: mockShowStreamCompletionNotification,
  },
};

Object.defineProperty(window, 'electronAPI', {
  value: electronAPI,
  writable: true,
  configurable: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeThread(title: string, lastAssistantText: string) {
  return {
    id: 'thread-1',
    title,
    messages: [
      { role: 'user', content: 'Hello', blocks: [{ kind: 'text', content: 'Hello' }] },
      {
        role: 'assistant',
        content: lastAssistantText,
        blocks: [{ kind: 'text', content: lastAssistantText }],
      },
    ],
  };
}

function makeCompleteChunk(threadId = 'thread-1') {
  return { type: 'complete' as const, messageId: 'msg-1', threadId };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useStreamCompletionNotifications', () => {
  let capturedChunkHandler: ((chunk: unknown) => void) | null = null;
  const cleanupFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    capturedChunkHandler = null;

    mockOnStreamChunk.mockImplementation((cb: (chunk: unknown) => void) => {
      capturedChunkHandler = cb;
      return cleanupFn;
    });

    mockLoadThread.mockResolvedValue({
      success: true,
      thread: makeThread('My thread', 'Here is the answer.'),
    });

    mockShowStreamCompletionNotification.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountHook(config: Record<string, unknown> | null) {
    const { renderHook } = await import('@testing-library/react');
    const { useStreamCompletionNotifications } = await import(
      './useStreamCompletionNotifications'
    );
    const result = renderHook(() =>
      useStreamCompletionNotifications(config as never),
    );
    return result;
  }

  it('subscribes to onStreamChunk on mount', async () => {
    await mountHook({ chat: { desktopNotifications: true } });
    expect(mockOnStreamChunk).toHaveBeenCalledOnce();
  });

  it('ignores non-complete chunk types', async () => {
    await mountHook({ chat: { desktopNotifications: true } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.({ type: 'text_delta', messageId: 'x', threadId: 'thread-1' });

    await Promise.resolve();
    expect(mockShowStreamCompletionNotification).not.toHaveBeenCalled();
  });

  it('does not notify when document has focus', async () => {
    await mountHook({ chat: { desktopNotifications: true } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    capturedChunkHandler?.(makeCompleteChunk());

    await Promise.resolve();
    expect(mockShowStreamCompletionNotification).not.toHaveBeenCalled();
  });

  it('does not notify when desktopNotifications is false', async () => {
    await mountHook({ chat: { desktopNotifications: false } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.(makeCompleteChunk());

    await Promise.resolve();
    expect(mockShowStreamCompletionNotification).not.toHaveBeenCalled();
  });

  it('fires notification with thread title and first assistant line when unfocused', async () => {
    await mountHook({ chat: { desktopNotifications: true } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.(makeCompleteChunk('thread-1'));

    // Allow loadThread + IPC call to resolve
    await vi.waitFor(() => expect(mockShowStreamCompletionNotification).toHaveBeenCalledOnce());

    expect(mockShowStreamCompletionNotification).toHaveBeenCalledWith({
      title: 'My thread',
      body: 'Here is the answer.',
      threadId: 'thread-1',
    });
  });

  it('truncates long title and body', async () => {
    const longTitle = 'A'.repeat(80);
    const longBody = 'B'.repeat(120);
    mockLoadThread.mockResolvedValue({
      success: true,
      thread: makeThread(longTitle, longBody),
    });

    await mountHook({ chat: { desktopNotifications: true } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.(makeCompleteChunk());

    await vi.waitFor(() => expect(mockShowStreamCompletionNotification).toHaveBeenCalledOnce());

    const call = mockShowStreamCompletionNotification.mock.calls[0][0] as {
      title: string;
      body: string;
    };
    expect(call.title.length).toBeLessThanOrEqual(60);
    expect(call.body.length).toBeLessThanOrEqual(100);
  });

  it('notifies when desktopNotifications is absent (defaults to enabled)', async () => {
    await mountHook({ chat: {} });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.(makeCompleteChunk());

    await vi.waitFor(() => expect(mockShowStreamCompletionNotification).toHaveBeenCalledOnce());
  });

  it('skips chunk with no threadId', async () => {
    await mountHook({ chat: { desktopNotifications: true } });

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    capturedChunkHandler?.({ type: 'complete', messageId: 'x' });

    await Promise.resolve();
    expect(mockShowStreamCompletionNotification).not.toHaveBeenCalled();
  });

  it('returns cleanup from onStreamChunk on unmount', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useStreamCompletionNotifications } = await import(
      './useStreamCompletionNotifications'
    );
    const { unmount } = renderHook(() =>
      useStreamCompletionNotifications({ chat: { desktopNotifications: true } } as never),
    );
    unmount();
    expect(cleanupFn).toHaveBeenCalledOnce();
  });
});
