/**
 * internalMcpAutoInject.test.ts — Wave 53g Phase A
 *
 * Contract tests for the new MCP discovery wiring:
 *
 *   1. injectIntoProjectSettings writes `.mcp.json` at project root with
 *      `mcpServers.ouroboros` populated (URL or stdio shape).
 *   2. It updates `~/.claude.json` projects.<root>.enabledMcpjsonServers to
 *      include `'ouroboros'` (idempotently).
 *   3. It removes any orphaned `mcpServers.ouroboros` from
 *      `.claude/settings.json` (cleanup of pre-53g misplaced writes).
 *   4. removeFromProjectSettings reverses (1) and (2).
 *   5. Tolerant of missing files (treated as empty); tolerant of invalid
 *      JSON (skips the write, never partial-writes).
 *
 * `os.homedir()` is mocked to a per-test temp directory so the suite
 * never touches the real user's `~/.claude.json`.
 *
 * Why this exists: Pre-53g, `injectIntoProjectSettings` wrote
 * `mcpServers.ouroboros` to `.claude/settings.json`. Claude Code CLI
 * does NOT read MCP config from that file, so three waves of fixes
 * (53d/53e/53f) targeted the wrong file. This test prevents that
 * regression class — the assertions point directly at the file Claude
 * Code actually reads.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   test file uses validated tmpdir paths throughout (mkdtemp + path.join
   from os.tmpdir()); the fs/promises calls are not user-controlled. */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { injectIntoProjectSettings, removeFromProjectSettings } from './internalMcpAutoInject';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpRoot: string;
let projectRoot: string;
let fakeHome: string;
let originalHomedir: typeof os.homedir;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-53g-'));
  projectRoot = path.join(tmpRoot, 'project');
  fakeHome = path.join(tmpRoot, 'home');
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(fakeHome, { recursive: true });
  // Redirect os.homedir() so the tests never touch the real ~/.claude.json.
  originalHomedir = os.homedir;
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
});

afterEach(async () => {
  vi.restoreAllMocks();
  os.homedir = originalHomedir;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mcpJsonPath = (): string => path.join(projectRoot, '.mcp.json');
const claudeJsonPath = (): string => path.join(fakeHome, '.claude.json');
const legacySettingsPath = (): string => path.join(projectRoot, '.claude', 'settings.json');

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Contract: writeMcpJson
// ---------------------------------------------------------------------------

describe('injectIntoProjectSettings — .mcp.json (the file Claude Code actually reads)', () => {
  it('writes .mcp.json at project root with mcpServers.ouroboros (SSE shape, with type)', async () => {
    await injectIntoProjectSettings(projectRoot, 12345);

    const mcpJson = await readJson(mcpJsonPath());
    expect(mcpJson).not.toBeNull();
    const servers = mcpJson?.mcpServers as
      | Record<string, { type?: string; url?: string }>
      | undefined;
    expect(servers?.ouroboros?.type).toBe('sse');
    expect(servers?.ouroboros?.url).toBe('http://127.0.0.1:12345/sse');
  });

  it('writes .mcp.json with stdio shape when transport is stdio (includes type)', async () => {
    await injectIntoProjectSettings(projectRoot, 12345, {
      transport: 'stdio',
      stdioTransportPath: '/fake/ouroborosMcp.js',
    });

    const mcpJson = await readJson(mcpJsonPath());
    const servers = mcpJson?.mcpServers as
      | Record<
          string,
          { type?: string; command?: string; args?: string[]; env?: Record<string, string> }
        >
      | undefined;
    expect(servers?.ouroboros?.type).toBe('stdio');
    // Wave 60 Phase C+ (binding fix): command is the IDE's Electron binary
    // (process.execPath) launched in Node mode via ELECTRON_RUN_AS_NODE=1.
    // Sidesteps the better-sqlite3 NODE_MODULE_VERSION mismatch between
    // Electron (ABI 145) and system Node (ABI 137).
    expect(servers?.ouroboros?.command).toBe(process.execPath);
    expect(servers?.ouroboros?.env?.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(servers?.ouroboros?.args).toEqual(['/fake/ouroborosMcp.js']);
  });

  it('preserves other servers in .mcp.json (does not stomp user entries)', async () => {
    await writeJson(mcpJsonPath(), {
      mcpServers: { 'user-server': { url: 'http://example/sse' } },
    });

    await injectIntoProjectSettings(projectRoot, 99999);

    const mcpJson = await readJson(mcpJsonPath());
    const servers = mcpJson?.mcpServers as Record<string, { url?: string }> | undefined;
    expect(servers?.['user-server']?.url).toBe('http://example/sse');
    expect(servers?.ouroboros?.url).toBe('http://127.0.0.1:99999/sse');
  });
});

// ---------------------------------------------------------------------------
// Contract: ~/.claude.json enabledMcpjsonServers
// ---------------------------------------------------------------------------

describe('injectIntoProjectSettings — ~/.claude.json enable flag', () => {
  it('adds ouroboros to enabledMcpjsonServers for the project (creates entry if absent)', async () => {
    await injectIntoProjectSettings(projectRoot, 12345);

    const claudeJson = await readJson(claudeJsonPath());
    const projects = claudeJson?.projects as Record<string, Record<string, unknown>> | undefined;
    const key = path.normalize(projectRoot);
    // eslint-disable-next-line security/detect-object-injection -- normalized test path
    const entry = projects?.[key];
    expect(entry?.enabledMcpjsonServers).toEqual(['ouroboros']);
  });

  it('preserves existing enabledMcpjsonServers entries when adding ouroboros', async () => {
    const key = path.normalize(projectRoot);
    await writeJson(claudeJsonPath(), {
      projects: {
        [key]: { enabledMcpjsonServers: ['existing-server'] },
      },
    });

    await injectIntoProjectSettings(projectRoot, 12345);

    const claudeJson = await readJson(claudeJsonPath());
    const projects = claudeJson?.projects as Record<string, Record<string, unknown>> | undefined;
    // eslint-disable-next-line security/detect-object-injection -- normalized test path
    const entry = projects?.[key];
    expect(entry?.enabledMcpjsonServers).toEqual(['existing-server', 'ouroboros']);
  });

  it('is idempotent — second call does not duplicate ouroboros in the array', async () => {
    await injectIntoProjectSettings(projectRoot, 12345);
    await injectIntoProjectSettings(projectRoot, 67890);

    const claudeJson = await readJson(claudeJsonPath());
    const projects = claudeJson?.projects as Record<string, Record<string, unknown>> | undefined;
    const key = path.normalize(projectRoot);
    // eslint-disable-next-line security/detect-object-injection -- normalized test path
    const entry = projects?.[key];
    expect(entry?.enabledMcpjsonServers).toEqual(['ouroboros']);
  });

  it('removes ouroboros from disabledMcpjsonServers if previously disabled', async () => {
    const key = path.normalize(projectRoot);
    await writeJson(claudeJsonPath(), {
      projects: {
        [key]: { disabledMcpjsonServers: ['ouroboros'] },
      },
    });

    await injectIntoProjectSettings(projectRoot, 12345);

    const claudeJson = await readJson(claudeJsonPath());
    const projects = claudeJson?.projects as Record<string, Record<string, unknown>> | undefined;
    // eslint-disable-next-line security/detect-object-injection -- normalized test path
    const entry = projects?.[key];
    expect(entry?.disabledMcpjsonServers).toBeUndefined();
    expect(entry?.enabledMcpjsonServers).toEqual(['ouroboros']);
  });

  it('preserves other top-level ~/.claude.json keys (does not stomp user state)', async () => {
    await writeJson(claudeJsonPath(), {
      numStartups: 42,
      hasCompletedOnboarding: true,
      projects: {},
    });

    await injectIntoProjectSettings(projectRoot, 12345);

    const claudeJson = await readJson(claudeJsonPath());
    expect(claudeJson?.numStartups).toBe(42);
    expect(claudeJson?.hasCompletedOnboarding).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract: legacy .claude/settings.json cleanup
// ---------------------------------------------------------------------------

describe('injectIntoProjectSettings — legacy cleanup', () => {
  it('removes orphaned mcpServers.ouroboros from .claude/settings.json', async () => {
    await writeJson(legacySettingsPath(), {
      hooks: { PreToolUse: [] },
      mcpServers: { ouroboros: { url: 'http://127.0.0.1:99/sse' } },
    });

    await injectIntoProjectSettings(projectRoot, 12345);

    const settings = await readJson(legacySettingsPath());
    expect(settings?.mcpServers).toBeUndefined();
    expect(settings?.hooks).toBeDefined();
  });

  it('preserves other mcpServers entries in legacy settings.json (only removes ouroboros)', async () => {
    await writeJson(legacySettingsPath(), {
      mcpServers: {
        ouroboros: { url: 'http://127.0.0.1:99/sse' },
        'user-managed': { url: 'http://example/sse' },
      },
    });

    await injectIntoProjectSettings(projectRoot, 12345);

    const settings = await readJson(legacySettingsPath());
    const servers = settings?.mcpServers as Record<string, unknown> | undefined;
    expect(servers).toBeDefined();
    expect(servers?.ouroboros).toBeUndefined();
    expect(servers?.['user-managed']).toBeDefined();
  });

  it('does not write legacy settings.json if mcpServers.ouroboros is absent (no churn)', async () => {
    await writeJson(legacySettingsPath(), { hooks: { PreToolUse: [] } });
    const beforeStat = await fs.stat(legacySettingsPath());
    // Wait a hair so mtime would change if a write happened.
    await new Promise((resolve) => setTimeout(resolve, 10));

    await injectIntoProjectSettings(projectRoot, 12345);

    const afterStat = await fs.stat(legacySettingsPath());
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
  });
});

// ---------------------------------------------------------------------------
// Contract: tolerance
// ---------------------------------------------------------------------------

describe('injectIntoProjectSettings — tolerance', () => {
  it('does not throw when project root has no .mcp.json yet', async () => {
    await expect(injectIntoProjectSettings(projectRoot, 12345)).resolves.toBeUndefined();
    const mcpJson = await readJson(mcpJsonPath());
    expect(mcpJson?.mcpServers).toBeDefined();
  });

  it('does not throw when ~/.claude.json does not exist yet', async () => {
    // beforeEach creates fakeHome but not the .claude.json file.
    await expect(injectIntoProjectSettings(projectRoot, 12345)).resolves.toBeUndefined();
    const claudeJson = await readJson(claudeJsonPath());
    expect(claudeJson?.projects).toBeDefined();
  });

  it('skips the .mcp.json write if existing file is invalid JSON (does not corrupt user state)', async () => {
    await fs.writeFile(mcpJsonPath(), '{ this is not valid json', 'utf-8');

    await injectIntoProjectSettings(projectRoot, 12345);

    const raw = await fs.readFile(mcpJsonPath(), 'utf-8');
    expect(raw).toBe('{ this is not valid json'); // Untouched.
  });
});

// ---------------------------------------------------------------------------
// Contract: removeFromProjectSettings
// ---------------------------------------------------------------------------

describe('removeFromProjectSettings', () => {
  it('removes ouroboros from .mcp.json', async () => {
    await injectIntoProjectSettings(projectRoot, 12345);
    await removeFromProjectSettings(projectRoot);

    const mcpJson = await readJson(mcpJsonPath());
    const servers = mcpJson?.mcpServers as Record<string, unknown> | undefined;
    expect(servers?.ouroboros).toBeUndefined();
  });

  it('removes ouroboros from ~/.claude.json enabledMcpjsonServers', async () => {
    await injectIntoProjectSettings(projectRoot, 12345);
    await removeFromProjectSettings(projectRoot);

    const claudeJson = await readJson(claudeJsonPath());
    const projects = claudeJson?.projects as Record<string, Record<string, unknown>> | undefined;
    const key = path.normalize(projectRoot);
    // eslint-disable-next-line security/detect-object-injection -- normalized test path
    const entry = projects?.[key];
    expect(entry?.enabledMcpjsonServers).toBeUndefined();
  });

  it('preserves other servers in .mcp.json when removing ouroboros', async () => {
    await writeJson(mcpJsonPath(), {
      mcpServers: { 'user-server': { url: 'http://example/sse' } },
    });
    await injectIntoProjectSettings(projectRoot, 12345);
    await removeFromProjectSettings(projectRoot);

    const mcpJson = await readJson(mcpJsonPath());
    const servers = mcpJson?.mcpServers as Record<string, { url?: string }> | undefined;
    expect(servers?.['user-server']?.url).toBe('http://example/sse');
    expect(servers?.ouroboros).toBeUndefined();
  });
});
