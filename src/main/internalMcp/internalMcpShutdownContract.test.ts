/**
 * Wave 53d regression (assertions repointed by Wave 53g): shutdown must NOT
 * remove the ouroboros MCP server entry.
 *
 * Pre-53d, stopInternalMcp() unconditionally called removeFromProjectSettings()
 * on every IDE shutdown. Pre-53g, this wiped `.claude/settings.json mcpServers
 * .ouroboros`. Wave 53g moved the auto-inject target to `.mcp.json` (the file
 * Claude Code actually reads), so the assertions below now check `.mcp.json`
 * instead — but the contract is unchanged: once injectIntoProjectSettings()
 * writes the entry, it MUST persist until the next IDE startup overwrites
 * with the current port. removeFromProjectSettings() must NOT be called in
 * the shutdown path.
 *
 * Tests mock `os.homedir()` so the suite never touches the real
 * `~/.claude.json`.
 */

/* eslint-disable security/detect-non-literal-fs-filename --
   test file uses validated tmpdir paths throughout. */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { injectIntoProjectSettings, removeFromProjectSettings } from './internalMcpAutoInject';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpRoot: string;
let projectRoot: string;
let fakeHome: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wave-53d-shutdown-'));
  projectRoot = path.join(tmpRoot, 'project');
  fakeHome = path.join(tmpRoot, 'home');
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(fakeHome, { recursive: true });
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readMcpJson(): Promise<Record<string, unknown>> {
  const filePath = path.join(projectRoot, '.mcp.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('internalMcp shutdown contract (Wave 53d regression, Wave 53g repointed)', () => {
  it('entry survives without remove call — simulates correct shutdown path', async () => {
    await injectIntoProjectSettings(projectRoot, 54321, { transport: 'sse' });

    // Simulated correct shutdown: no removeFromProjectSettings call.

    const mcpJson = await readMcpJson();
    const mcpServers = mcpJson.mcpServers as Record<string, unknown> | undefined;
    expect(mcpServers).toBeDefined();
    expect(mcpServers?.['ouroboros']).toEqual({ url: 'http://127.0.0.1:54321/sse' });
  });

  it('removeFromProjectSettings erases the entry — confirms remove IS destructive', async () => {
    await injectIntoProjectSettings(projectRoot, 54321, { transport: 'sse' });
    await removeFromProjectSettings(projectRoot);

    const mcpJson = await readMcpJson();
    const mcpServers = mcpJson.mcpServers as Record<string, unknown> | undefined;
    expect(mcpServers?.['ouroboros']).toBeUndefined();
  });

  it('next startup inject overwrites stale port — confirms stale entry is harmless', async () => {
    await injectIntoProjectSettings(projectRoot, 54321, { transport: 'sse' });
    await injectIntoProjectSettings(projectRoot, 55555, { transport: 'sse' });

    const mcpJson = await readMcpJson();
    const mcpServers = mcpJson.mcpServers as Record<string, unknown> | undefined;
    expect(mcpServers?.['ouroboros']).toEqual({ url: 'http://127.0.0.1:55555/sse' });
  });
});
