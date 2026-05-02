import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('./miscSymbolSearch', () => ({
  searchSymbols: vi.fn().mockResolvedValue([]),
}));

vi.mock('./pathSecurity', () => ({
  assertPathAllowed: vi.fn().mockReturnValue(null),
}));

import { ipcMain } from 'electron';
import { registerSymbolHandlers } from './symbolHandlers';

describe('registerSymbolHandlers', () => {
  it('registers symbol:search', () => {
    const channels: string[] = [];
    registerSymbolHandlers(channels);
    expect(channels).toContain('symbol:search');
    expect(ipcMain.handle).toHaveBeenCalledTimes(1);
  });
});
