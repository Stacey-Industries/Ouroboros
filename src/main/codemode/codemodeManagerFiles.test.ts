/* eslint-disable security/detect-non-literal-fs-filename -- test-only paths under fresh temp directories */
/**
 * codemodeManagerFiles.test.ts — Wave 53k smoke tests.
 *
 * Covers the file-targeting helpers: tolerant JSON read, atomic write,
 * server-map extraction, project-entry resolution, and the project-server
 * enabled/disabled flag logic.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  atomicWriteJson,
  augmentProxyServers,
  buildProxyServerEntry,
  buildContext7ProxyEntry,
  ensureProjectEntry,
  getProjectEntry,
  getProjectsMap,
  getServerMap,
  isProjectServerEnabled,
  projectMcpJsonPath,
  readJsonTolerant,
  restorationFilePath,
  userClaudeJsonPath,
} from './codemodeManagerFiles';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codemode-files-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('path helpers', () => {
  it('userClaudeJsonPath ends with .claude.json', () => {
    expect(userClaudeJsonPath().endsWith('.claude.json')).toBe(true);
  });

  it('projectMcpJsonPath joins root + .mcp.json', () => {
    const p = projectMcpJsonPath('/some/project');
    expect(path.basename(p)).toBe('.mcp.json');
    expect(p.includes(path.normalize('/some/project'))).toBe(true);
  });

  it('restorationFilePath lives under ~/.claude/', () => {
    expect(restorationFilePath().endsWith(path.join('.claude', 'codemode-managed.json'))).toBe(
      true,
    );
  });
});

describe('readJsonTolerant', () => {
  it('returns {} for missing file', async () => {
    const result = await readJsonTolerant(path.join(tmpDir, 'nope.json'), 'nope');
    expect(result).toEqual({});
  });

  it('returns parsed JSON for valid file', async () => {
    const p = path.join(tmpDir, 'valid.json');
    await fs.writeFile(p, JSON.stringify({ a: 1 }), 'utf-8');
    expect(await readJsonTolerant(p, 'valid')).toEqual({ a: 1 });
  });

  it('returns null for malformed JSON (does not throw)', async () => {
    const p = path.join(tmpDir, 'broken.json');
    await fs.writeFile(p, '{not json', 'utf-8');
    expect(await readJsonTolerant(p, 'broken')).toBeNull();
  });
});

describe('atomicWriteJson', () => {
  it('writes JSON to disk via tmp + rename', async () => {
    const p = path.join(tmpDir, 'out.json');
    await atomicWriteJson(p, { hello: 'world' });
    const raw = await fs.readFile(p, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ hello: 'world' });
  });

  it('creates parent directory if missing', async () => {
    const p = path.join(tmpDir, 'nested', 'deeper', 'out.json');
    await atomicWriteJson(p, { ok: true });
    expect(JSON.parse(await fs.readFile(p, 'utf-8'))).toEqual({ ok: true });
  });

  it('leaves no .tmp file on success', async () => {
    const p = path.join(tmpDir, 'clean.json');
    await atomicWriteJson(p, { x: 1 });
    const entries = await fs.readdir(tmpDir);
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
  });
});

describe('getServerMap', () => {
  it('returns {} when json is null', () => {
    expect(getServerMap(null)).toEqual({});
  });

  it('returns {} when mcpServers is missing', () => {
    expect(getServerMap({ projects: {} })).toEqual({});
  });

  it('returns the mcpServers object', () => {
    const map = getServerMap({ mcpServers: { ouroboros: { url: 'x' } } });
    expect(map).toEqual({ ouroboros: { url: 'x' } });
  });
});

describe('project entry helpers', () => {
  it('getProjectsMap returns empty when missing', () => {
    expect(getProjectsMap({})).toEqual({});
  });

  it('getProjectEntry normalizes the path key', () => {
    const projects = { [path.normalize('/foo/bar')]: { hello: true } };
    expect(getProjectEntry(projects, '/foo/bar')).toEqual({ hello: true });
  });

  it('ensureProjectEntry creates a fresh object when key missing', () => {
    const projects: Record<string, Record<string, unknown>> = {};
    const entry = ensureProjectEntry(projects, '/proj') as Record<string, unknown>;
    expect(entry).toEqual({});
    expect(projects[path.normalize('/proj')]).toBe(entry);
  });

  it('ensureProjectEntry returns existing entry without overwrite', () => {
    const original = { enabledMcpjsonServers: ['ouroboros'] };
    const projects = { [path.normalize('/proj')]: original };
    const entry = ensureProjectEntry(projects, '/proj');
    expect(entry).toBe(original);
  });
});

describe('isProjectServerEnabled', () => {
  it('returns true when entry undefined (default trust)', () => {
    expect(isProjectServerEnabled('ouroboros', undefined)).toBe(true);
  });

  it('returns false when name in disabledMcpjsonServers', () => {
    expect(isProjectServerEnabled('ouroboros', { disabledMcpjsonServers: ['ouroboros'] })).toBe(
      false,
    );
  });

  it('returns true when name in enabledMcpjsonServers', () => {
    expect(isProjectServerEnabled('ouroboros', { enabledMcpjsonServers: ['ouroboros'] })).toBe(
      true,
    );
  });

  it('returns false when an enabled list exists and name absent', () => {
    expect(isProjectServerEnabled('ouroboros', { enabledMcpjsonServers: ['github'] })).toBe(false);
  });

  it('disabled wins over enabled', () => {
    expect(
      isProjectServerEnabled('ouroboros', {
        enabledMcpjsonServers: ['ouroboros'],
        disabledMcpjsonServers: ['ouroboros'],
      }),
    ).toBe(false);
  });
});

describe('buildProxyServerEntry', () => {
  it('produces a stdio entry pointing at proxyServer.js', () => {
    const entry = buildProxyServerEntry();
    expect(entry.type).toBe('stdio');
    expect(entry.command).toBe('node');
    expect(entry.args?.[0]).toMatch(/proxyServer\.js$/);
    expect(entry.args?.[1]).toMatch(/codemode-proxy-config\.json$/);
  });
});

describe('context7 proxy helpers', () => {
  const originalApiKey = process.env.CONTEXT7_API_KEY;

  afterEach(() => {
    process.env.CONTEXT7_API_KEY = originalApiKey;
  });

  it('buildContext7ProxyEntry points at context7Proxy.js', () => {
    const entry = buildContext7ProxyEntry();
    expect(entry.type).toBe('stdio');
    expect(entry.command).toBe('node');
    expect(entry.args?.[0]).toMatch(/context7Proxy\.js$/);
  });

  it('augmentProxyServers injects context7 when the API key is present', () => {
    process.env.CONTEXT7_API_KEY = 'test-key';
    const servers = augmentProxyServers({ github: { command: 'npx' } });
    expect(servers.github).toBeDefined();
    expect(servers.context7).toBeDefined();
    expect(servers.context7?.args?.[0]).toMatch(/context7Proxy\.js$/);
  });
});
