/**
 * config.test.ts — Unit tests for sanitizeConfig (via config:getAll handler)
 * and the settings file watcher (fs.watch + debounce).
 *
 * Verifies that sensitive fields (webAccessToken, webAccessPassword, apiKey)
 * are stripped or masked before the config is returned to the renderer.
 * Also verifies the 50 ms debounce on the settings file watcher.
 *
 * Run with: npx vitest run src/main/ipc-handlers/config.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron before importing handlers ───────────────────────────────────
const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: {
    getPath: () => '/mock/userData',
    getAppPath: () => '/mock/app',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler);
    },
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));

// ── Mock fs (core) — provides fs.watch used by the settings file watcher ──────
type WatchCallback = (eventType: string, filename: string | null) => void;

const { mockFsWatcher, mockFsWatch } = vi.hoisted(() => {
  const watcher = { close: vi.fn() };
  const watchFn = vi.fn((...args: unknown[]) => { void args; return watcher; });
  return { mockFsWatcher: watcher, mockFsWatch: watchFn };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, default: { ...actual, watch: mockFsWatch }, watch: mockFsWatch };
});

// ── Mock fs/promises ──────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn().mockResolvedValue(undefined), readFile: vi.fn() },
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

// ── Mock contextLayer ─────────────────────────────────────────────────────────
vi.mock('../contextLayer/contextLayerController', () => ({
  getContextLayerController: vi.fn().mockReturnValue(null),
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ── Mock webServer ────────────────────────────────────────────────────────────
vi.mock('../web/webServer', () => ({ broadcastToWebClients: vi.fn() }));

// ── Mock config — provides a getConfig() we can control per test ──────────────
const { mockGetConfig } = vi.hoisted(() => ({ mockGetConfig: vi.fn() }));
vi.mock('../config', () => ({
  getConfig: mockGetConfig,
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
  AppConfig: {},
}));

// ── Import module under test AFTER mocks ──────────────────────────────────────
import { cleanupConfigWatcher, registerConfigHandlers } from './config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ModelProvider = { id: string; name: string; baseUrl: string; apiKey: string; models: [] };

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    webAccessToken: 'secret-token-abc',
    webAccessPassword: 'hunter2',
    modelProviders: [] as ModelProvider[],
    activeTheme: 'modern',
    defaultProjectRoot: '/home/user/project',
    ...overrides,
  };
}

async function invokeGetAll(): Promise<Record<string, unknown>> {
  const handler = registeredHandlers.get('config:getAll');
  if (!handler) throw new Error('config:getAll handler not registered');
  return handler({} as never) as Record<string, unknown>;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockFsWatch.mockClear();
  mockFsWatcher.close.mockClear();
  registeredHandlers.clear();
  mockGetConfig.mockReturnValue(makeConfig());
  registerConfigHandlers(() => ({ webContents: { send: vi.fn() } }) as never);
});

afterEach(() => {
  cleanupConfigWatcher();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── config:getAll — secret stripping ────────────────────────────────────────

describe('config:getAll — sensitive field stripping', () => {
  it('omits webAccessToken from the returned config', async () => {
    const result = await invokeGetAll();
    expect(result).not.toHaveProperty('webAccessToken');
  });

  it('omits webAccessPassword from the returned config', async () => {
    const result = await invokeGetAll();
    expect(result).not.toHaveProperty('webAccessPassword');
  });

  it('preserves non-sensitive fields', async () => {
    const result = await invokeGetAll();
    expect(result).toHaveProperty('activeTheme', 'modern');
    expect(result).toHaveProperty('defaultProjectRoot', '/home/user/project');
  });
});

// ─── config:getAll — modelProviders apiKey masking ───────────────────────────

describe('config:getAll — modelProviders apiKey masking', () => {
  it('masks a non-empty apiKey with bullet characters', async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({
        modelProviders: [
          {
            id: 'p1',
            name: 'Provider',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-real-key',
            models: [],
          },
        ],
      }),
    );

    const result = await invokeGetAll();
    const providers = result.modelProviders as ModelProvider[];
    expect(providers).toHaveLength(1);
    expect(providers[0].apiKey).toBe('••••••••');
    expect(providers[0].apiKey).not.toContain('sk-real-key');
  });

  it('keeps empty apiKey as an empty string (not masked)', async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({
        modelProviders: [
          { id: 'p2', name: 'No Key', baseUrl: 'https://api.example.com', apiKey: '', models: [] },
        ],
      }),
    );

    const result = await invokeGetAll();
    const providers = result.modelProviders as ModelProvider[];
    expect(providers[0].apiKey).toBe('');
  });

  it('masks each provider independently', async () => {
    mockGetConfig.mockReturnValue(
      makeConfig({
        modelProviders: [
          { id: 'p1', name: 'A', baseUrl: '', apiKey: 'key-one', models: [] },
          { id: 'p2', name: 'B', baseUrl: '', apiKey: '', models: [] },
          { id: 'p3', name: 'C', baseUrl: '', apiKey: 'key-three', models: [] },
        ],
      }),
    );

    const result = await invokeGetAll();
    const providers = result.modelProviders as ModelProvider[];
    expect(providers[0].apiKey).toBe('••••••••');
    expect(providers[1].apiKey).toBe('');
    expect(providers[2].apiKey).toBe('••••••••');
  });

  it('returns empty array when no modelProviders are configured', async () => {
    mockGetConfig.mockReturnValue(makeConfig({ modelProviders: [] }));

    const result = await invokeGetAll();
    const providers = result.modelProviders as ModelProvider[];
    expect(providers).toEqual([]);
  });

  it('does not mutate the original config object', async () => {
    const original: ModelProvider[] = [
      { id: 'p1', name: 'A', baseUrl: '', apiKey: 'real-key', models: [] },
    ];
    mockGetConfig.mockReturnValue(makeConfig({ modelProviders: original }));

    await invokeGetAll();
    expect(original[0].apiKey).toBe('real-key');
  });
});

// ─── Settings file watcher — fs.watch + 50 ms debounce ───────────────────────

async function invokeOpenSettingsFile(): Promise<Record<string, unknown>> {
  const handler = registeredHandlers.get('config:openSettingsFile');
  if (!handler) throw new Error('config:openSettingsFile handler not registered');
  return handler({} as never) as Promise<Record<string, unknown>>;
}

describe('settings file watcher', () => {
  it('calls fs.watch when config:openSettingsFile is invoked', async () => {
    await invokeOpenSettingsFile();
    expect(mockFsWatch).toHaveBeenCalledOnce();
    expect(mockFsWatch).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.any(Function),
    );
  });

  it('does not start a second watcher if already watching', async () => {
    await invokeOpenSettingsFile();
    await invokeOpenSettingsFile();
    expect(mockFsWatch).toHaveBeenCalledOnce();
  });

  it('debounces rapid change events and calls syncExternalSettings once', async () => {
    mockGetConfig.mockReturnValue(makeConfig());
    // config.ts imports `fs` as default from 'fs/promises', so we must spy on default.readFile
    const fsMod = await import('fs/promises');
    const mockReadFile = vi.spyOn(fsMod.default, 'readFile').mockResolvedValue('{}' as never);

    await invokeOpenSettingsFile();
    // The callback registered with fs.watch is the second argument of the first call
    const cb = mockFsWatch.mock.calls[0][1] as WatchCallback;
    expect(cb).toBeTypeOf('function');

    // Fire 'change' three times in quick succession (simulating Windows double-fire)
    cb('change', 'settings.json');
    cb('change', 'settings.json');
    cb('change', 'settings.json');

    // Before the 50ms debounce fires, readFile should not have been called
    expect(mockReadFile).not.toHaveBeenCalled();

    // Advance past the debounce window
    await vi.advanceTimersByTimeAsync(60);

    // syncExternalSettings reads the file exactly once
    expect(mockReadFile).toHaveBeenCalledOnce();
  });

  it('ignores non-change events (e.g. rename)', async () => {
    const fsMod = await import('fs/promises');
    const mockReadFile = vi.spyOn(fsMod.default, 'readFile').mockResolvedValue('{}' as never);

    await invokeOpenSettingsFile();
    // Clear any calls that happened during handler setup (e.g. from a prior watcher flush)
    mockReadFile.mockClear();

    const cb = mockFsWatch.mock.calls[0][1] as WatchCallback;
    cb('rename', 'settings.json');
    await vi.advanceTimersByTimeAsync(100);

    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('closes the watcher on cleanupConfigWatcher', async () => {
    await invokeOpenSettingsFile();
    cleanupConfigWatcher();
    expect(mockFsWatcher.close).toHaveBeenCalledOnce();
  });
});
