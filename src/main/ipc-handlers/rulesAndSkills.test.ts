/**
 * rulesAndSkills.test.ts — Tests for assertPathAllowed gates in rulesAndSkills handlers.
 *
 * Verifies that rules:create, rules:list, rules:read, and
 * rulesAndSkills:startWatcher all reject paths outside the workspace.
 *
 * Run with: npx vitest run src/main/ipc-handlers/rulesAndSkills.test.ts
 */

import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron before any imports ─────────────────────────────────────────
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
}));

// ── Mock windowManager ────────────────────────────────────────────────────────
const { mockGetWindowProjectRoots } = vi.hoisted(() => ({
  mockGetWindowProjectRoots: vi.fn().mockReturnValue([]),
}));
vi.mock('../windowManager', () => ({
  getWindowProjectRoots: mockGetWindowProjectRoots,
}));

// ── Mock config ───────────────────────────────────────────────────────────────
const { mockGetConfigValue } = vi.hoisted(() => ({ mockGetConfigValue: vi.fn() }));
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

// ── Mock heavy dependencies that would pull in filesystem or native modules ───
vi.mock('../rulesAndSkills/commandsDiscovery', () => ({ discoverCommands: vi.fn() }));
vi.mock('../rulesAndSkills/commandsManager', () => ({
  createCommand: vi.fn(),
  deleteCommand: vi.fn(),
  readCommand: vi.fn(),
  updateCommand: vi.fn(),
}));
vi.mock('../rulesAndSkills/hooksManager', () => ({
  addHook: vi.fn(),
  readHooksConfig: vi.fn(),
  removeHook: vi.fn(),
}));
vi.mock('../rulesAndSkills/rulesDirectoryManager', () => ({
  createRuleFile: vi.fn(),
  deleteRuleFile: vi.fn(),
  discoverRuleFiles: vi.fn(),
  readRuleFile: vi.fn(),
  updateRuleFile: vi.fn(),
}));
vi.mock('../rulesAndSkills/rulesReader', () => ({
  listRulesFiles: vi.fn().mockResolvedValue([]),
  readRulesFile: vi.fn().mockResolvedValue({ content: '' }),
}));
vi.mock('../rulesAndSkills/rulesWatcher', () => ({
  startRulesWatcher: vi.fn().mockReturnValue(() => {}),
}));
vi.mock('../rulesAndSkills/settingsManager', () => ({
  readClaudeSettings: vi.fn(),
  readClaudeSettingsKey: vi.fn(),
  writeClaudeSettingsKey: vi.fn(),
}));
vi.mock('../web/webServer', () => ({ broadcastToWebClients: vi.fn() }));
vi.mock('fs', () => ({
  default: { writeFileSync: vi.fn() },
  writeFileSync: vi.fn(),
}));

// ── Import module under test AFTER mocks are set up ───────────────────────────
import { registerRulesAndSkillsHandlers } from './rulesAndSkills';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WORKSPACE = process.platform === 'win32' ? 'C:\\projects\\myapp' : '/projects/myapp';
const WORKSPACE_RESOLVED = path.resolve(WORKSPACE);

const OUTSIDE_PATH = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/passwd';

/** Build a minimal IpcMainInvokeEvent-like object. */
function makeEvent(windowId: number | undefined): object {
  return {
    sender: {
      getOwnerBrowserWindow: () => (windowId !== undefined ? { id: windowId } : null),
    },
  };
}

/** Call a registered handler by channel name with the given event and args. */
async function invoke(channel: string, event: object, ...args: unknown[]): Promise<unknown> {
  const handler = registeredHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for '${channel}'`);
  return handler(event, ...args);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  registeredHandlers.clear();
  mockGetConfigValue.mockReturnValue(undefined);
  mockGetWindowProjectRoots.mockReturnValue([WORKSPACE_RESOLVED]);

  // Register all handlers so the map is populated
  registerRulesAndSkillsHandlers(() => ({ webContents: { send: vi.fn() } }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── rules:create ─────────────────────────────────────────────────────────────

describe('rules:create path validation', () => {
  it('allows a valid path inside the workspace', async () => {
    const result = await invoke('rules:create', makeEvent(1), WORKSPACE_RESOLVED, 'claude-md');
    expect(result).toHaveProperty('success', true);
  });

  it('rejects a path outside the workspace', async () => {
    const result = await invoke('rules:create', makeEvent(1), OUTSIDE_PATH, 'claude-md');
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/outside the workspace/i);
  });

  it('rejects when no workspace is configured', async () => {
    mockGetWindowProjectRoots.mockReturnValue([]);
    const result = await invoke('rules:create', makeEvent(1), WORKSPACE_RESOLVED, 'claude-md');
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/No workspace root configured/i);
  });
});

// ─── rules:list ──────────────────────────────────────────────────────────────

describe('rules:list path validation', () => {
  it('allows a path inside the workspace', async () => {
    const result = await invoke('rules:list', makeEvent(1), WORKSPACE_RESOLVED);
    expect(result).toHaveProperty('success', true);
  });

  it('rejects a path outside the workspace', async () => {
    const result = await invoke('rules:list', makeEvent(1), OUTSIDE_PATH);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/outside the workspace/i);
  });

  it('rejects a traversal path', async () => {
    const traversal = path.join(WORKSPACE_RESOLVED, '..', '..', 'etc', 'passwd');
    const result = await invoke('rules:list', makeEvent(1), traversal);
    expect(result).toMatchObject({ success: false });
  });
});

// ─── rules:read ──────────────────────────────────────────────────────────────

describe('rules:read path validation', () => {
  it('allows a path inside the workspace', async () => {
    const result = await invoke('rules:read', makeEvent(1), WORKSPACE_RESOLVED, 'claude-md');
    expect(result).toHaveProperty('success', true);
  });

  it('rejects a path outside the workspace', async () => {
    const result = await invoke('rules:read', makeEvent(1), OUTSIDE_PATH, 'claude-md');
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/outside the workspace/i);
  });
});

// ─── rulesAndSkills:startWatcher ─────────────────────────────────────────────

describe('rulesAndSkills:startWatcher path validation', () => {
  it('allows a path inside the workspace', async () => {
    const result = await invoke('rulesAndSkills:startWatcher', makeEvent(1), WORKSPACE_RESOLVED);
    expect(result).toHaveProperty('success', true);
  });

  it('rejects a path outside the workspace', async () => {
    const result = await invoke('rulesAndSkills:startWatcher', makeEvent(1), OUTSIDE_PATH);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/outside the workspace/i);
  });

  it('rejects when no workspace root is configured', async () => {
    mockGetWindowProjectRoots.mockReturnValue([]);
    const result = await invoke('rulesAndSkills:startWatcher', makeEvent(1), WORKSPACE_RESOLVED);
    expect(result).toMatchObject({ success: false });
  });
});
