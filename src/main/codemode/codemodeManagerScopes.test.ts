/* eslint-disable security/detect-non-literal-fs-filename -- test-only paths under fresh temp directories */
/**
 * codemodeManagerScopes.test.ts — Wave 53k smoke tests.
 *
 * Covers the global / project enable + restore helpers. Mocks `os.homedir`
 * to a temp directory so writes don't touch the real `~/.claude.json`.
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
  applyGlobalEnable,
  applyProjectEnable,
  readGlobalServers,
  readProjectServerMap,
  restoreGlobal,
  restoreProject,
  rollbackEmptyEnable,
} from './codemodeManagerScopes';

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
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemode-scopes-home-'));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemode-scopes-proj-'));
});

afterEach(async () => {
  await fs.rm(homeDir, { recursive: true, force: true });
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('readGlobalServers', () => {
  it('returns {} when ~/.claude.json missing', async () => {
    expect(await readGlobalServers()).toEqual({});
  });

  it('reads mcpServers from ~/.claude.json', async () => {
    await writeUserClaudeJson({
      mcpServers: { github: { command: 'npx', args: ['gh'] } },
    });
    const result = await readGlobalServers();
    expect(result).toEqual({ github: { command: 'npx', args: ['gh'] } });
  });
});

describe('readProjectServerMap', () => {
  it('returns {} when .mcp.json missing', async () => {
    expect(await readProjectServerMap(projectDir)).toEqual({});
  });

  it('reads mcpServers from <root>/.mcp.json', async () => {
    await writeProjectMcpJson(projectDir, {
      mcpServers: { ouroboros: { type: 'stdio', command: 'node', args: ['x.js'] } },
    });
    const result = await readProjectServerMap(projectDir);
    expect(result.ouroboros).toEqual({ type: 'stdio', command: 'node', args: ['x.js'] });
  });
});

describe('applyGlobalEnable', () => {
  it('removes proxied servers from ~/.claude.json mcpServers and adds __codemode_proxy', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        github: { command: 'npx', args: ['gh'] },
        sentry: { url: 'http://x' },
      },
    });
    const result = await applyGlobalEnable(['github']);
    expect(result.proxiedConfigs.github).toEqual({ command: 'npx', args: ['gh'] });
    expect(result.backup.github).toEqual({ command: 'npx', args: ['gh'] });

    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).not.toHaveProperty('github');
    expect(after).toHaveProperty('sentry');
    expect(after).toHaveProperty('__codemode_proxy');
  });

  it('skips names not present in mcpServers', async () => {
    await writeUserClaudeJson({ mcpServers: { sentry: { url: 'http://x' } } });
    const result = await applyGlobalEnable(['nonexistent']);
    expect(result.proxiedConfigs).toEqual({});
    expect(result.backup).toEqual({});
    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).toHaveProperty('__codemode_proxy');
    expect(after).toHaveProperty('sentry');
  });
});

describe('applyProjectEnable', () => {
  it('removes proxied entry from .mcp.json and backs it up verbatim', async () => {
    const ouroborosCfg = { type: 'stdio' as const, command: 'node', args: ['x.js'] };
    await writeProjectMcpJson(projectDir, { mcpServers: { ouroboros: ouroborosCfg } });

    const result = await applyProjectEnable(projectDir, ['ouroboros']);
    expect(result.proxiedConfigs.ouroboros).toEqual(ouroborosCfg);
    expect(result.backup.ouroboros).toEqual(ouroborosCfg);

    // .mcp.json no longer has ouroboros (this is the load-bearing change for v2.1.122)
    const mcpRaw = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    const mcp = JSON.parse(mcpRaw) as { mcpServers?: Record<string, unknown> };
    if (mcp.mcpServers) {
      expect(mcp.mcpServers).not.toHaveProperty('ouroboros');
    }
  });

  it('preserves unrelated entries in .mcp.json', async () => {
    await writeProjectMcpJson(projectDir, {
      mcpServers: {
        ouroboros: { type: 'stdio', command: 'node', args: ['x.js'] },
        otherServer: { type: 'sse', url: 'http://example' },
      },
    });

    await applyProjectEnable(projectDir, ['ouroboros']);

    const mcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers).not.toHaveProperty('ouroboros');
    expect(mcp.mcpServers).toHaveProperty('otherServer');
  });

  it('returns empty backup when server not in .mcp.json', async () => {
    await writeProjectMcpJson(projectDir, { mcpServers: {} });
    const result = await applyProjectEnable(projectDir, ['ouroboros']);
    expect(result.backup).toEqual({});
    expect(result.proxiedConfigs).toEqual({});
  });

  it('does not write .mcp.json when no servers match (no-op)', async () => {
    await writeProjectMcpJson(projectDir, { mcpServers: { other: { url: 'http://x' } } });
    const before = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    await applyProjectEnable(projectDir, ['ouroboros']);
    const after = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    expect(after).toBe(before);
  });
});

describe('rollbackEmptyEnable', () => {
  it('removes __codemode_proxy without touching other servers', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        sentry: { url: 'http://x' },
        __codemode_proxy: { type: 'stdio', command: 'node', args: ['p'] },
      },
    });
    await rollbackEmptyEnable();
    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).not.toHaveProperty('__codemode_proxy');
    expect(after).toHaveProperty('sentry');
  });
});

describe('restoreGlobal', () => {
  it('restores the backed-up servers and removes __codemode_proxy', async () => {
    await writeUserClaudeJson({
      mcpServers: {
        sentry: { url: 'http://x' },
        __codemode_proxy: { type: 'stdio', command: 'node', args: ['p'] },
      },
    });
    await restoreGlobal({ github: { command: 'npx', args: ['gh'] } });
    const after = (await readUserClaudeJson()).mcpServers as Record<string, unknown>;
    expect(after).toHaveProperty('github');
    expect(after).toHaveProperty('sentry');
    expect(after).not.toHaveProperty('__codemode_proxy');
  });
});

describe('restoreProject', () => {
  it('writes backed-up entries back into .mcp.json mcpServers verbatim', async () => {
    const ouroborosCfg = { type: 'stdio' as const, command: 'node', args: ['x.js'] };
    // Simulate post-enable state: .mcp.json has ouroboros removed.
    await writeProjectMcpJson(projectDir, { mcpServers: {} });

    await restoreProject({ [projectDir]: { ouroboros: ouroborosCfg } });

    const mcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.ouroboros).toEqual(ouroborosCfg);
  });

  it('preserves unrelated entries in .mcp.json during restore', async () => {
    const ouroborosCfg = { type: 'stdio' as const, command: 'node', args: ['x.js'] };
    await writeProjectMcpJson(projectDir, {
      mcpServers: { otherServer: { type: 'sse', url: 'http://example' } },
    });
    await restoreProject({ [projectDir]: { ouroboros: ouroborosCfg } });

    const mcp = JSON.parse(await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers).toHaveProperty('ouroboros');
    expect(mcp.mcpServers).toHaveProperty('otherServer');
  });

  it('is a no-op when project backup is empty', async () => {
    await writeProjectMcpJson(projectDir, { mcpServers: { otherServer: { url: 'http://x' } } });
    const before = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    await restoreProject({});
    const after = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    expect(after).toBe(before);
  });

  it('is a no-op when the project backup is an empty config map for that root', async () => {
    await writeProjectMcpJson(projectDir, { mcpServers: { otherServer: { url: 'http://x' } } });
    const before = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    await restoreProject({ [projectDir]: {} });
    const after = await fs.readFile(path.join(projectDir, '.mcp.json'), 'utf-8');
    expect(after).toBe(before);
  });
});
