import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../updater', () => ({
  getAutoUpdater: vi.fn(),
  getLastOfferedVersion: vi.fn(),
  isVersionRejected: vi.fn(),
}));

import { ipcMain } from 'electron';

import { registerUpdaterHandlers } from './updaterHandlers';

describe('registerUpdaterHandlers', () => {
  it('registers updater:check, updater:download, updater:install', () => {
    const channels: string[] = [];
    registerUpdaterHandlers(channels);
    expect(channels).toContain('updater:check');
    expect(channels).toContain('updater:download');
    expect(channels).toContain('updater:install');
    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
  });
});
