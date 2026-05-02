import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../costHistory', () => ({
  saveCostEntry: vi.fn(),
  getCostHistory: vi.fn().mockResolvedValue([]),
  clearCostHistory: vi.fn(),
}));

import { ipcMain } from 'electron';
import { registerCostHandlers } from './costHandlers';

describe('registerCostHandlers', () => {
  it('registers cost:addEntry, cost:getHistory, cost:clearHistory', () => {
    const channels: string[] = [];
    registerCostHandlers(channels);
    expect(channels).toContain('cost:addEntry');
    expect(channels).toContain('cost:getHistory');
    expect(channels).toContain('cost:clearHistory');
    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
  });
});
