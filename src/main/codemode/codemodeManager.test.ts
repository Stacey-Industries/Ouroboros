/* eslint-disable security/detect-non-literal-fs-filename -- test-only paths under fresh temp directories */
/**
 * codemodeManager.test.ts — Wave 53k acceptance smoke.
 *
 * End-to-end exercise of the public API against real (temp) files.
 * Mocks `os.homedir` so the test never touches the user's `~/.claude.json`.
 *
 * Scenarios:
 *   - enable + disable cycle for a global server: __codemode_proxy
 *     appears and disappears; original entry is preserved through both.
 *   - enable for a project-scope server (ouroboros in .mcp.json): toggles
 *     the disabled flag in ~/.claude.json projects.<root> while leaving
 *     .mcp.json untouched.
 *   - "no servers found" returns success:false and rolls back the proxy
 *     entry rather than leaving a dangling __codemode_proxy.
 *   - getMcpServers reads the right files (not the legacy
 *     .claude/settings.json shape).
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let homeDir: string;

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => homeDir },
    homedir: () => homeDir,
    tmpdir: actual.tmpdir,
  };
});

import {
  __resetCodemodeState,
  disableCodeMode,
  enableCodeMode,
  getCodeModeStatus,
  getMcpServers,
  isCodeModeEnabled,
} from './codemodeManager';

let projectDir: string;

async function readUserClaudeJson(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(homeDir, '.claude.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function writeUserClaudeJson(data: unknown): Promise<void> {
  await fs.writeFile(path.join(homeDir, '.claude.json'), JSON.stringify(data, null, 2), 'utf-8');
}

async function writeProjectMcpJson(root: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(root, '.mcp.json'), JSON.stringify(data, null, 2), 'utf-8');
}

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemode-mgr-home-'));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemode-mgr-proj-'));
  __resetCodemodeState();
});

afterEach(async () => {
  await fs.rm(homeDir, { recursive: true, force: true });
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('getMcpServers — reads ~/.claude.json + <root>/.mcp.json', () => {
  it('returns global servers from ~/.claude.json', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        github: { command: 'npx', args: ['gh'] },
        sentry: { url: 'http://x' },
      },
    });
    const entries = await getMcpServers();
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['github', 'sentry']);
    expect(entries.every((e) => e.scope === 'global' && e.enabled)).toBe(true);
  });

  it('returns project servers from <root>/.mcp.json with disabled flag honored', async () => {
    await writeProjectMcpJson(projectDir, {
      mcpServers: { ouroboros: { type: 'stdio', command: 'node', args: ['x'] } },
    });
    await writeUserClaudeJson({
      projects: {
        [path.normalize(projectDir)]: { disabledMcpjsonServers: ['ouroboros'] },
      },
    });
    const entries = await getMcpServers(projectDir);
    const ouroboros = entries.find((e) => e.name === 'ouroboros');
    expect(ouroboros).toBeDefined();
    expect(ouroboros!.scope).toBe('project');
    expect(ouroboros!.enabled).toBe(false);
  });

  it('hides __codemode_proxy from the listing', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        sentry: { url: 'http://x' },
        __codemode_proxy: { type: 'stdio', command: 'node', args: ['p'] },
      },
    });
    const entries = await getMcpServers();
    expect(entries.some((e) => e.name === '__codemode_proxy')).toBe(false);
  });
});

describe('enableCodeMode — global server', () => {
  it('moves the proxied server out and adds __codemode_proxy', async () => {
    await writeUserClaudeJson({
      mcpServers: { github: { command: 'npx', args: ['gh'] } },
    });

    const result = await enableCodeMode(['github'], 'global');
    expect(result.success).toBe(true);
    expect(isCodeModeEnabled()).toBe(true);

    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).not.toHaveProperty('github');
    expect(after).toHaveProperty('__codemode_proxy');

    const restoration = JSON.parse(
      await fs.readFile(path.join(homeDir, '.claude', 'codemode-managed.json'), 'utf-8'),
    ) as { global: Record<string, unknown>; proxiedNames: string[] };
    expect(restoration.global).toHaveProperty('github');
    expect(restoration.proxiedNames).toContain('github');
  });

  it('returns success:false and rolls back when no requested servers exist', async () => {
    await writeUserClaudeJson({ mcpServers: { sentry: { url: 'http://x' } } });
    const result = await enableCodeMode(['nonexistent'], 'global');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/None of the requested MCP servers were found/);
    expect(isCodeModeEnabled()).toBe(false);

    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).not.toHaveProperty('__codemode_proxy');
    expect(after).toHaveProperty('sentry');
  });

  it('refuses to re-enable when already active', async () => {
    await writeUserClaudeJson({ mcpServers: { github: { command: 'npx' } } });
    await enableCodeMode(['github'], 'global');
    const result = await enableCodeMode(['github'], 'global');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already enabled/);
  });
});

describe('enableCodeMode — project (ouroboros in .mcp.json)', () => {
  it('removes ouroboros from .mcp.json (destructive write) and adds __codemode_proxy at user scope', async () => {
    const ouroborosCfg = { type: 'stdio', command: 'node', args: ['x'] };
    await writeProjectMcpJson(projectDir, { mcpServers: { ouroboros: ouroborosCfg } });

    const result = await enableCodeMode(['ouroboros'], 'project', projectDir);
    expect(result.success).toBe(true);

    // .mcp.json no longer surfaces ouroboros (load-bearing for v2.1.122 isolation)
    const mcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers?: Record<string, unknown>;
    };
    if (mcp.mcpServers) {
      expect(mcp.mcpServers).not.toHaveProperty('ouroboros');
    }

    // __codemode_proxy added at user scope
    const claude = await readUserClaudeJson();
    expect(claude.mcpServers).toHaveProperty('__codemode_proxy');

    // Restoration record holds the verbatim .mcp.json entry for resurrect-on-disable
    const restoration = JSON.parse(
      await fs.readFile(path.join(homeDir, '.claude', 'codemode-managed.json'), 'utf-8'),
    ) as { project: Record<string, Record<string, unknown>>; version: number };
    expect(restoration.version).toBe(2);
    // eslint-disable-next-line security/detect-object-injection -- projectDir is a test-local mkdtemp path
    const projectEntry = restoration.project[projectDir];
    expect(projectEntry?.ouroboros).toEqual(ouroborosCfg);
  });
});

describe('disableCodeMode', () => {
  it('restores global servers and removes __codemode_proxy', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        github: { command: 'npx', args: ['gh'] },
        sentry: { url: 'http://x' },
      },
    });
    await enableCodeMode(['github'], 'global');

    const beforeDisable = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(beforeDisable).not.toHaveProperty('github');
    expect(beforeDisable).toHaveProperty('__codemode_proxy');

    const result = await disableCodeMode();
    expect(result.success).toBe(true);
    expect(isCodeModeEnabled()).toBe(false);

    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).toHaveProperty('github');
    expect(after).toHaveProperty('sentry');
    expect(after).not.toHaveProperty('__codemode_proxy');

    // Restoration file gone
    await expect(
      fs.access(path.join(homeDir, '.claude', 'codemode-managed.json')),
    ).rejects.toThrow();
  });

  it('restores ouroboros entry to .mcp.json verbatim on disable', async () => {
    const ouroborosCfg = { type: 'stdio', command: 'node', args: ['x'] };
    await writeProjectMcpJson(projectDir, { mcpServers: { ouroboros: ouroborosCfg } });
    await enableCodeMode(['ouroboros'], 'project', projectDir);

    // Mid-enable: .mcp.json should not have ouroboros
    const midMcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers?: Record<string, unknown>;
    };
    if (midMcp.mcpServers) {
      expect(midMcp.mcpServers).not.toHaveProperty('ouroboros');
    }

    const result = await disableCodeMode();
    expect(result.success).toBe(true);

    // Post-disable: ouroboros entry restored verbatim
    const mcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.ouroboros).toEqual(ouroborosCfg);
  });

  it('returns success:false when not enabled', async () => {
    const result = await disableCodeMode();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not currently enabled/);
  });
});

describe('getCodeModeStatus', () => {
  it('reports inactive state initially', () => {
    expect(getCodeModeStatus()).toEqual({
      enabled: false,
      proxiedServers: [],
      generatedTypes: '',
    });
  });

  it('reports enabled + proxied names after enable', async () => {
    await writeUserClaudeJson({ mcpServers: { github: { command: 'npx' } } });
    await enableCodeMode(['github'], 'global');
    const status = getCodeModeStatus();
    expect(status.enabled).toBe(true);
    expect(status.proxiedServers).toContain('github');
  });
});
