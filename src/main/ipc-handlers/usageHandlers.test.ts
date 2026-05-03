import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../costHistory', () => ({
  getCostHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../costHistoryAggregation', () => ({
  aggregateUsageSummary: vi.fn().mockReturnValue({}),
  aggregateWindowedUsage: vi.fn().mockReturnValue({}),
  findSessionDetailById: vi.fn().mockReturnValue(null),
  getRecentSessionsFromEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('../claudeRateLimits', () => ({
  getLatestClaudeUsageSnapshot: vi.fn().mockResolvedValue(null),
}));

vi.mock('../codexRateLimits', () => ({
  getLatestCodexUsageSnapshot: vi.fn().mockResolvedValue(null),
}));

import { ipcMain } from 'electron';

import { registerUsageHandlers } from './usageHandlers';

describe('registerUsageHandlers', () => {
  it('registers all five usage channels', () => {
    const channels: string[] = [];
    registerUsageHandlers(channels);
    expect(channels).toContain('usage:getSummary');
    expect(channels).toContain('usage:getSessionDetail');
    expect(channels).toContain('usage:getRecentSessions');
    expect(channels).toContain('usage:getWindowedUsage');
    expect(channels).toContain('usage:getUsageWindowSnapshot');
    expect(ipcMain.handle).toHaveBeenCalledTimes(5);
  });
});
