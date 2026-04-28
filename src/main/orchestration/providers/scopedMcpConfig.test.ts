/**
 * scopedMcpConfig.test.ts — Wave 48 Phase D
 *
 * Verifies the temp-config builder:
 *  - respects internalMcpScope (task-gated, always, never)
 *  - goal shape drives inclusion under task-gated
 *  - other user MCP servers pass through unconditionally
 *  - ouroboros is omitted when port registry has no URL
 *  - cleanup removes the temp file
 *  - feature flag off returns null
 */

import { existsSync } from 'fs';
import { readFile as realReadFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock calls
// ---------------------------------------------------------------------------

const { mockGetConfigValue, mockGetInternalMcpUrl, mockReadFile } = vi.hoisted(() => ({
  mockGetConfigValue: vi.fn(),
  mockGetInternalMcpUrl: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('../../config', () => ({ getConfigValue: mockGetConfigValue }));
vi.mock('../../internalMcp/internalMcpPortRegistry', () => ({
  getInternalMcpUrl: mockGetInternalMcpUrl,
}));
// Selective fs/promises mock: only intercept reads of the user's settings.json;
// pass through reads of the temp config file the production code writes.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  const wrappedReadFile = (path: Parameters<typeof actual.readFile>[0], opts?: Parameters<typeof actual.readFile>[1]) => {
    if (typeof path === 'string' && path.includes('.claude') && path.endsWith('settings.json')) {
      return mockReadFile(path, opts);
    }
    return actual.readFile(path, opts);
  };
  return { ...actual, readFile: wrappedReadFile };
});
vi.mock('../../logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Selective fs mock: stub the two functions mcpSpawnCostTelemetry uses so this
// suite stops appending real records to ~/.ouroboros/telemetry/mcp-spawn-cost.jsonl.
// Preserve everything else (existsSync, readFileSync, etc.) for production code paths.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mkdirSync = vi.fn();
  const appendFile = vi.fn((_p: unknown, _d: unknown, cb?: (err: unknown) => void) => cb?.(null));
  return {
    ...actual,
    default: { ...actual, mkdirSync, appendFile },
    mkdirSync,
    appendFile,
  };
});

import { buildScopedMcpConfig } from './scopedMcpConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'test-session-abc';
const OUROBOROS_URL = 'http://127.0.0.1:54321/sse';

function configureScope(opts: {
  useStrict?: boolean;
  enabled?: boolean;
  scope?: 'always' | 'task-gated' | 'never';
  userServers?: Record<string, unknown>;
  mcpUrl?: string | null;
}): void {
  const {
    useStrict = true,
    enabled = true,
    scope = 'task-gated',
    userServers = {},
    mcpUrl = OUROBOROS_URL,
  } = opts;

  mockGetConfigValue.mockImplementation((key: string) => {
    if (key === 'internalMcpUseStrictConfig') return useStrict;
    if (key === 'internalMcpEnabled') return enabled;
    if (key === 'internalMcpScope') return scope;
    return undefined;
  });

  mockGetInternalMcpUrl.mockReturnValue(mcpUrl);

  const settingsJson = JSON.stringify({ mcpServers: userServers });
  mockReadFile.mockResolvedValue(settingsJson);
}

async function readConfigFile(configPath: string): Promise<Record<string, unknown>> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only, path produced by buildScopedMcpConfig
  const raw = await realReadFile(configPath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildScopedMcpConfig', () => {
  beforeEach(() => {
    mockGetConfigValue.mockReset();
    mockGetInternalMcpUrl.mockReset();
    mockReadFile.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when useStrictConfig feature flag is false', async () => {
    configureScope({ useStrict: false });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).toBeNull();
  });

  it('task-gated + casual goal: ouroboros NOT in config', async () => {
    configureScope({ scope: 'task-gated' });
    const result = await buildScopedMcpConfig({ goalShape: 'casual', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });

  it('task-gated + code goal: ouroboros IN config', async () => {
    configureScope({ scope: 'task-gated' });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).toHaveProperty('ouroboros');
    expect((servers['ouroboros'] as { url: string }).url).toBe(OUROBOROS_URL);
    await result!.cleanup();
  });

  it('scope=always: ouroboros IN config regardless of goal shape', async () => {
    configureScope({ scope: 'always' });
    const result = await buildScopedMcpConfig({ goalShape: 'casual', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).toHaveProperty('ouroboros');
    await result!.cleanup();
  });

  it('scope=never: ouroboros NOT in config regardless of goal shape', async () => {
    configureScope({ scope: 'never' });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });

  it('other user MCP servers pass through unconditionally', async () => {
    configureScope({
      scope: 'never',
      userServers: {
        'my-tool': { command: 'npx', args: ['my-mcp-server'] },
        'another': { url: 'http://localhost:9999/sse' },
      },
    });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).toHaveProperty('my-tool');
    expect(servers).toHaveProperty('another');
    expect(servers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });

  it('ouroboros from user servers is excluded (managed by scope gate)', async () => {
    configureScope({
      scope: 'never',
      userServers: { ouroboros: { url: 'http://127.0.0.1:11111/sse' } },
    });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });

  it('cleanup removes the temp file', async () => {
    configureScope({ scope: 'always' });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only, path from builder
    expect(existsSync(result!.configPath)).toBe(true);
    await result!.cleanup();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only, path from builder
    expect(existsSync(result!.configPath)).toBe(false);
  });

  it('cleanup is idempotent (safe to call twice)', async () => {
    configureScope({ scope: 'always' });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    await result!.cleanup();
    await expect(result!.cleanup()).resolves.not.toThrow();
  });

  it('no MCP URL: ouroboros omitted even when scope=always', async () => {
    configureScope({ scope: 'always', mcpUrl: null });
    const result = await buildScopedMcpConfig({ goalShape: 'code', sessionId: SESSION_ID });
    expect(result).not.toBeNull();
    const data = await readConfigFile(result!.configPath);
    const servers = data.mcpServers as Record<string, unknown>;
    expect(servers).not.toHaveProperty('ouroboros');
    await result!.cleanup();
  });
});
