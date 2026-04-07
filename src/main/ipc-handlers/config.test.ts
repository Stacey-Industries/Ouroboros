/**
 * config.test.ts — Unit tests for sanitizeConfig (via config:getAll handler).
 *
 * Verifies that sensitive fields (webAccessToken, webAccessPassword, apiKey)
 * are stripped or masked before the config is returned to the renderer.
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

// ── Mock chokidar ─────────────────────────────────────────────────────────────
vi.mock('chokidar', () => ({
  default: { watch: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }) },
}));

// ── Mock fs/promises ──────────────────────────────────────────────────────────
vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn(), readFile: vi.fn() },
  writeFile: vi.fn(),
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
import { registerConfigHandlers } from './config';

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
  registeredHandlers.clear();
  mockGetConfig.mockReturnValue(makeConfig());
  registerConfigHandlers(() => ({ webContents: { send: vi.fn() } }) as never);
});

afterEach(() => {
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
