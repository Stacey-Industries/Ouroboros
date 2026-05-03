import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../approvalManager', () => ({
  respondToApproval: vi.fn().mockResolvedValue(true),
  addAlwaysAllowRule: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../approvalMemory', () => ({
  forget: vi.fn(),
  listAll: vi.fn().mockReturnValue([]),
  rememberAllow: vi.fn(),
  rememberDeny: vi.fn(),
}));

import { ipcMain } from 'electron';

import { registerApprovalHandlers } from './approvalHandlers';

describe('registerApprovalHandlers', () => {
  it('registers all five approval channels', () => {
    const channels: string[] = [];
    registerApprovalHandlers(channels);
    expect(channels).toContain('approval:respond');
    expect(channels).toContain('approval:alwaysAllow');
    expect(channels).toContain('approval:remember');
    expect(channels).toContain('approval:listMemory');
    expect(channels).toContain('approval:forget');
    expect(ipcMain.handle).toHaveBeenCalledTimes(5);
  });
});
