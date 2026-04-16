/**
 * notifications.test.ts — unit tests for showStreamCompletionNotification.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock Electron ─────────────────────────────────────────────────────────────

const mockShow = vi.fn();
const mockOnNotif = vi.fn();
let notificationSupported = true;

function MockNotification(this: unknown) {
  (this as Record<string, unknown>).on = mockOnNotif;
  (this as Record<string, unknown>).show = mockShow;
}
MockNotification.isSupported = () => notificationSupported;

const mockSend = vi.fn();
const mockIsDestroyed = vi.fn(() => false);
const mockIsMinimized = vi.fn(() => false);
const mockRestore = vi.fn();
const mockFocus = vi.fn();

function makeMockWin(focused = false) {
  return {
    isDestroyed: mockIsDestroyed,
    isMinimized: mockIsMinimized,
    restore: mockRestore,
    focus: mockFocus,
    isFocused: vi.fn(() => focused),
    webContents: { send: mockSend },
  };
}

const mockGetAllWindows = vi.fn(() => [makeMockWin()]);

vi.mock('electron', () => ({
  Notification: MockNotification,
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('showStreamCompletionNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationSupported = true;
    mockGetAllWindows.mockReturnValue([makeMockWin(false)]);
  });

  it('shows notification when no window is focused', async () => {
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'Done', body: 'Stream complete' });
    expect(mockShow).toHaveBeenCalledOnce();
  });

  it('skips notification when a window is focused', async () => {
    mockGetAllWindows.mockReturnValue([makeMockWin(true)]);
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'Done', body: 'Stream complete' });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('skips when Notification.isSupported() is false', async () => {
    notificationSupported = false;
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'T', body: 'B' });
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('registers click handler on the notification', async () => {
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'T', body: 'B', threadId: 'thread-1' });
    expect(mockOnNotif).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('click handler focuses the main window and sends navigateToPermalink', async () => {
    const win = makeMockWin(false);
    mockGetAllWindows.mockReturnValue([win]);
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'T', body: 'B', threadId: 'thread-42' });

    // Simulate the click event
    const [, clickFn] = mockOnNotif.mock.calls[0] as [string, () => void];
    clickFn();

    expect(win.focus).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith('app:navigateToPermalink', { threadId: 'thread-42' });
  });

  it('click handler without threadId only focuses the window', async () => {
    const win = makeMockWin(false);
    mockGetAllWindows.mockReturnValue([win]);
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    showStreamCompletionNotification({ title: 'T', body: 'B' });

    const [, clickFn] = mockOnNotif.mock.calls[0] as [string, () => void];
    clickFn();

    expect(win.focus).toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('no-ops gracefully when there are no windows', async () => {
    mockGetAllWindows.mockReturnValue([]);
    vi.resetModules();
    const { showStreamCompletionNotification } = await import('./notifications');
    expect(() =>
      showStreamCompletionNotification({ title: 'T', body: 'B' }),
    ).not.toThrow();
    expect(mockShow).toHaveBeenCalledOnce();
  });
});
