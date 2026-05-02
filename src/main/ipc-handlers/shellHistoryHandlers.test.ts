import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('./miscSymbolSearch', () => ({
  readShellHistory: vi.fn().mockResolvedValue([]),
}));

import { ipcMain } from 'electron';
import { registerShellHistoryHandlers } from './shellHistoryHandlers';

describe('registerShellHistoryHandlers', () => {
  it('registers shellHistory:read', () => {
    const channels: string[] = [];
    registerShellHistoryHandlers(channels);
    expect(channels).toContain('shellHistory:read');
    expect(ipcMain.handle).toHaveBeenCalledTimes(1);
  });
});
