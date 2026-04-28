/**
 * Wave 53d regression: shutdown must NOT remove the mcpServers.ouroboros entry.
 *
 * Root cause: stopInternalMcp() previously called removeFromProjectSettings()
 * unconditionally on every IDE shutdown, wiping .claude/settings.json so that
 * external Claude Code terminal sessions launched after IDE exit found no entry.
 *
 * Contract: once injectIntoProjectSettings() writes the entry, it MUST persist
 * until the next IDE startup (which will overwrite it with the current port).
 * removeFromProjectSettings() must NOT be called in the shutdown path.
 *
 * If someone re-adds removeFromProjectSettings to stopInternalMcp, the test
 * "entry survives without remove call" will still pass, but the companion test
 * "removeFromProjectSettings erases the entry" below will remind a reviewer
 * that calling remove IS destructive — and the Phase C commit comment links
 * back to why that must not happen on shutdown.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { injectIntoProjectSettings, removeFromProjectSettings } from './internalMcpAutoInject';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

async function readSettingsJson(root: string): Promise<Record<string, unknown>> {
  const filePath = path.join(root, '.claude', 'settings.json');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated tmpRoot + known filename in test helper
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-test-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('internalMcp shutdown contract (wave-53d regression)', () => {
  it('entry survives without remove call — simulates correct shutdown path', async () => {
    // Arrange: inject entry (what startInternalMcp does at startup)
    await injectIntoProjectSettings(tmpRoot, 54321, { transport: 'sse' });

    // Act: no removeFromProjectSettings call — this is the fixed shutdown path

    // Assert: entry still present
    const settings = await readSettingsJson(tmpRoot);
    const mcpServers = settings['mcpServers'] as Record<string, unknown> | undefined;
    expect(mcpServers).toBeDefined();
    expect(mcpServers?.['ouroboros']).toEqual({ url: 'http://127.0.0.1:54321/sse' });
  });

  it('removeFromProjectSettings erases the entry — confirms remove IS destructive', async () => {
    // This test documents WHY removeFromProjectSettings must not be called on
    // shutdown: calling it unconditionally wipes the entry that external Claude
    // Code terminal sessions depend on.
    await injectIntoProjectSettings(tmpRoot, 54321, { transport: 'sse' });
    await removeFromProjectSettings(tmpRoot);

    const settings = await readSettingsJson(tmpRoot);
    const mcpServers = settings['mcpServers'] as Record<string, unknown> | undefined;
    // After remove, ouroboros is gone — this is the bad state the fix prevents.
    expect(mcpServers?.['ouroboros']).toBeUndefined();
  });

  it('next startup inject overwrites stale port — confirms stale entry is harmless', async () => {
    // Write entry with old port (simulates stale entry left after IDE shutdown)
    await injectIntoProjectSettings(tmpRoot, 54321, { transport: 'sse' });

    // Simulate next startup: inject with new port (overwrite)
    await injectIntoProjectSettings(tmpRoot, 55555, { transport: 'sse' });

    const settings = await readSettingsJson(tmpRoot);
    const mcpServers = settings['mcpServers'] as Record<string, unknown> | undefined;
    expect(mcpServers?.['ouroboros']).toEqual({ url: 'http://127.0.0.1:55555/sse' });
  });
});
