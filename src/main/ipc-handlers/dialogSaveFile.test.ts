/**
 * dialogSaveFile.test.ts — Unit tests for handleSaveFileDialog in app.ts.
 *
 * Tests the dialog:saveFile IPC handler which opens a native save dialog
 * and writes the chosen file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoist mocks so they are available before vi.mock factory runs ─────────────
const { mockShowSaveDialog, mockFromWebContents, mockWriteFile } = vi.hoisted(() => ({
  mockShowSaveDialog: vi.fn(),
  mockFromWebContents: vi.fn(),
  mockWriteFile: vi.fn(),
}));

// ── Mock electron before importing handler ────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: () => '/mock/userData',
    getAppPath: () => '/mock/app',
    isPackaged: false,
  },
  BrowserWindow: {
    fromWebContents: mockFromWebContents,
    getAllWindows: () => [],
  },
  ipcMain: { handle: vi.fn() },
  dialog: { showSaveDialog: mockShowSaveDialog },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), openExternal: vi.fn() },
  Notification: class { show = vi.fn(); },
}));

// ── Mock fs/promises ──────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  default: { writeFile: mockWriteFile },
  writeFile: mockWriteFile,
}));

// ── Mock child_process ────────────────────────────────────────────────────────
vi.mock('child_process', () => ({ exec: vi.fn(), spawn: vi.fn() }));

// ── Mock dependencies ─────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('../web/webServer', () => ({ broadcastToWebClients: vi.fn() }));
vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  AppConfig: {},
}));
vi.mock('../notifications', () => ({ showStreamCompletionNotification: vi.fn() }));
vi.mock('./pathSecurity', () => ({ assertPathAllowed: vi.fn().mockReturnValue(null) }));

// ── Import after mocks ────────────────────────────────────────────────────────
import { handleSaveFileDialog } from './app';

// ── Fake IpcMainInvokeEvent ───────────────────────────────────────────────────
function makeEvent() {
  const sender = { id: 1 };
  return { sender } as unknown as Electron.IpcMainInvokeEvent;
}

describe('handleSaveFileDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromWebContents.mockReturnValue({ id: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls showSaveDialog with correct defaults', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    await handleSaveFileDialog(makeEvent(), 'pr-description.md', '# content');
    expect(mockShowSaveDialog).toHaveBeenCalledOnce();
    const callArgs = mockShowSaveDialog.mock.calls[0] as unknown[];
    // With a window, args are (win, opts)
    const opts = callArgs[1] as { defaultPath: string; filters: Array<{ name: string; extensions: string[] }> };
    expect(opts.defaultPath).toBe('pr-description.md');
    expect(opts.filters[0].name).toBe('Markdown');
    expect(opts.filters[0].extensions).toContain('md');
  });

  it('returns cancelled when user cancels', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    const result = await handleSaveFileDialog(makeEvent(), 'out.md', 'hello');
    expect(result).toEqual({ success: false, cancelled: true });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('returns cancelled when filePath is empty', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '' });
    const result = await handleSaveFileDialog(makeEvent(), 'out.md', 'hello');
    expect(result).toEqual({ success: false, cancelled: true });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('writes file content to disk when user confirms', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/out.md' });
    mockWriteFile.mockResolvedValue(undefined);
    const result = await handleSaveFileDialog(makeEvent(), 'out.md', '# PR description');
    expect(mockWriteFile).toHaveBeenCalledWith('/home/user/out.md', '# PR description', 'utf-8');
    expect(result).toEqual({ success: true, filePath: '/home/user/out.md' });
  });

  it('returns error when writeFile throws', async () => {
    mockShowSaveDialog.mockResolvedValue({ canceled: false, filePath: '/home/user/out.md' });
    mockWriteFile.mockRejectedValue(new Error('disk full'));
    const result = await handleSaveFileDialog(makeEvent(), 'out.md', 'content');
    expect(result).toEqual({ success: false, error: 'disk full' });
  });

  it('falls back to dialog without window when BrowserWindow.fromWebContents returns null', async () => {
    mockFromWebContents.mockReturnValue(null);
    mockShowSaveDialog.mockResolvedValue({ canceled: true });
    await handleSaveFileDialog(makeEvent(), 'pr-description.md', 'content');
    // Without a window, called with just opts (single arg)
    const callArgs = mockShowSaveDialog.mock.calls[0] as unknown[];
    expect(callArgs).toHaveLength(1);
    const opts = callArgs[0] as { defaultPath: string };
    expect(opts.defaultPath).toBe('pr-description.md');
  });
});
