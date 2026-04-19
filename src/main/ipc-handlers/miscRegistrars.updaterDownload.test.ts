/**
 * miscRegistrars.updaterDownload.test.ts
 *
 * Wave 41 Phase D — asserts that the `updater:download` IPC handler refuses to
 * call `downloadUpdate()` when the offered version was rejected by the downgrade
 * guard.
 *
 * Strategy: mock ipcMain.handle to capture handlers; mock ../updater to control
 * isVersionRejected / getLastOfferedVersion / getAutoUpdater; invoke the captured
 * handler directly and assert the return value + call count.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockHandle = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '2.5.0'),
    commandLine: { appendSwitch: vi.fn() },
  },
  ipcMain: { handle: mockHandle, on: vi.fn() },
  shell: { openPath: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}));

vi.mock('mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindowMock {},
}));

const mockIsVersionRejected = vi.fn<(v: string) => boolean>(() => false);
const mockGetLastOfferedVersion = vi.fn<() => string | null>(() => null);
const mockDownloadUpdate = vi.fn(() => Promise.resolve());

vi.mock('../updater', () => ({
  getAutoUpdater: vi.fn(() => ({
    checkForUpdates: vi.fn(),
    downloadUpdate: mockDownloadUpdate,
    quitAndInstall: vi.fn(),
  })),
  isVersionRejected: (v: string) => mockIsVersionRejected(v),
  getLastOfferedVersion: () => mockGetLastOfferedVersion(),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../agentChat/utils', () => ({
  getErrorMessage: (e: unknown) => String(e),
}));

// Stub every other dependency miscRegistrars.ts touches so the import doesn't blow up
vi.mock('../approvalManager', () => ({
  addAlwaysAllowRule: vi.fn(),
  respondToApproval: vi.fn(),
}));
vi.mock('../approvalMemory', () => ({
  forget: vi.fn(),
  listAll: vi.fn(() => []),
  rememberAllow: vi.fn(),
  rememberDeny: vi.fn(),
}));
vi.mock('../claudeRateLimits', () => ({ getLatestClaudeUsageSnapshot: vi.fn() }));
vi.mock('../codexRateLimits', () => ({ getLatestCodexUsageSnapshot: vi.fn() }));
vi.mock('../costHistory', () => ({
  clearCostHistory: vi.fn(),
  getCostHistory: vi.fn(() => Promise.resolve([])),
  saveCostEntry: vi.fn(),
}));
vi.mock('../costHistoryAggregation', () => ({
  aggregateUsageSummary: vi.fn(() => ({})),
  aggregateWindowedUsage: vi.fn(() => ({})),
  findSessionDetailById: vi.fn(() => null),
  getRecentSessionsFromEntries: vi.fn(() => []),
}));
vi.mock('../crashReporterStorage', () => ({ getCrashReportDirPath: vi.fn(() => '/mock/crashes') }));
vi.mock('../workspaceTrust', () => ({
  getWindowTrustLevel: vi.fn(),
  isWorkspaceTrusted: vi.fn(),
  trustWorkspace: vi.fn(),
  untrustWorkspace: vi.fn(),
}));
vi.mock('./miscRegistrarsHelpers', () => ({
  registerExtensionHandlers: vi.fn(),
  registerWindowHandlers: vi.fn(),
}));
vi.mock('./miscSymbolSearch', () => ({
  readShellHistory: vi.fn(() => Promise.resolve([])),
  searchSymbols: vi.fn(() => Promise.resolve([])),
}));
vi.mock('./pathSecurity', () => ({ assertPathAllowed: vi.fn(() => null) }));
vi.mock('./graphHandlers', () => ({ registerGraphHandlers: vi.fn() }));
vi.mock('./lspHandlers', () => ({ registerLspHandlers: vi.fn() }));
vi.mock('./perfHandlers', () => ({ registerPerfHandlers: vi.fn() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type IpcHandler = Parameters<typeof mockHandle>[1];

function captureHandlers(): Record<string, IpcHandler> {
  const map: Record<string, IpcHandler> = {};
  mockHandle.mockImplementation((channel: string, handler: IpcHandler) => {
    // eslint-disable-next-line security/detect-object-injection -- channel is an IPC name from the module under test, not user input
    map[channel] = handler;
  });
  return map;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updater:download handler — downgrade block', () => {
  let handlers: Record<string, IpcHandler>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    handlers = captureHandlers();

    const { registerUpdaterHandlers } = await import('./miscRegistrars');
    const channels: string[] = [];
    registerUpdaterHandlers(channels);
  });

  it('registers the updater:download channel', () => {
    expect(handlers['updater:download']).toBeDefined();
  });

  it('calls downloadUpdate and returns success when version is not rejected', async () => {
    mockIsVersionRejected.mockReturnValue(false);
    mockGetLastOfferedVersion.mockReturnValue('2.6.0');

    const result = await handlers['updater:download']?.({} as never, ...([] as never[]));

    expect(result).toMatchObject({ success: true });
    expect(mockDownloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns downgrade-rejected without calling downloadUpdate when version is rejected', async () => {
    mockIsVersionRejected.mockReturnValue(true);
    mockGetLastOfferedVersion.mockReturnValue('2.4.0');

    const result = await handlers['updater:download']?.({} as never, ...([] as never[]));

    expect(result).toEqual({ success: false, error: 'downgrade-rejected' });
    expect(mockDownloadUpdate).not.toHaveBeenCalled();
  });

  it('returns downgrade-rejected when lastOfferedVersion is null but empty string is rejected', async () => {
    // Edge case: no version offered yet, but '' is in the rejected set (edge case safety)
    mockIsVersionRejected.mockImplementation((v) => v === '');
    mockGetLastOfferedVersion.mockReturnValue(null);

    const result = await handlers['updater:download']?.({} as never, ...([] as never[]));

    expect(result).toEqual({ success: false, error: 'downgrade-rejected' });
    expect(mockDownloadUpdate).not.toHaveBeenCalled();
  });
});
