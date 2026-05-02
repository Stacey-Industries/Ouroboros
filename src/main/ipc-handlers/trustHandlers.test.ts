import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

vi.mock('../workspaceTrust', () => ({
  isWorkspaceTrusted: vi.fn().mockReturnValue(false),
  getWindowTrustLevel: vi.fn().mockReturnValue('untrusted'),
  trustWorkspace: vi.fn(),
  untrustWorkspace: vi.fn(),
}));

import { ipcMain } from 'electron';
import { registerTrustHandlers } from './trustHandlers';

describe('registerTrustHandlers', () => {
  it('registers all four workspace trust channels', () => {
    const channels: string[] = [];
    registerTrustHandlers(channels);
    expect(channels).toContain('workspace:isTrusted');
    expect(channels).toContain('workspace:trustLevel');
    expect(channels).toContain('workspace:trust');
    expect(channels).toContain('workspace:untrust');
    expect(ipcMain.handle).toHaveBeenCalledTimes(4);
  });
});
