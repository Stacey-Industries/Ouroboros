import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/userData'),
    getVersion: vi.fn().mockReturnValue('0.0.0'),
  },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn().mockResolvedValue('') },
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(''),
    stat: vi.fn().mockResolvedValue({ mtime: new Date() }),
    unlink: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../crashReporterStorage', () => ({
  getCrashReportDirPath: vi.fn().mockReturnValue('/tmp/crashReports'),
}));

vi.mock('../logger', () => ({
  default: { error: vi.fn() },
}));

import { ipcMain } from 'electron';

import { registerCrashLogHandlers } from './crashHandlers';

describe('registerCrashLogHandlers', () => {
  it('registers all five crash/log channels', () => {
    const channels: string[] = [];
    registerCrashLogHandlers(channels);
    expect(channels).toContain('app:getCrashLogs');
    expect(channels).toContain('app:clearCrashLogs');
    expect(channels).toContain('app:openCrashLogDir');
    expect(channels).toContain('platform:openCrashReportsDir');
    expect(channels).toContain('app:logError');
    expect(ipcMain.handle).toHaveBeenCalledTimes(5);
  });
});
