/**
 * memoryReader.test.ts — tests for listMemoryEntries and readMemoryEntry.
 *
 * Strategy: monkey-patch os.homedir() to point at a temp dir so we can
 * exercise the real filesystem path without touching the user's actual
 * ~/.claude directory.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger before importing the module under test.
vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { listMemoryEntries, readMemoryEntry, sanitizeCwd } from './memoryReader';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_HOME = path.join(os.tmpdir(), `mem-reader-test-${Date.now()}`);
const FAKE_CWD = process.platform === 'win32' ? 'C:\\Web App\\Agent IDE' : '/home/user/project';
const SANITIZED = sanitizeCwd(FAKE_CWD);
const MEM_DIR = path.join(FAKE_HOME, '.claude', 'projects', SANITIZED, 'memory');

function writeFile(filePath: string, content: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture under os.tmpdir()
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture under os.tmpdir()
  fs.writeFileSync(filePath, content, 'utf8');
}

const BASIC_MEMORY_MD = `# Agent IDE Project Memory

## Constraints
- [Max subscription](user_auth_subscription.md) — OAuth only, no API key

## Product Philosophy
- [Amplifier not replacement](feedback_product_philosophy.md) — focus on visibility
`;

const MEMORY_MD_EM_DASH = `## References
- [Chat patterns](reference_chat.md) — rendering patterns from Cursor
`;

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(os, 'homedir').mockReturnValue(FAKE_HOME);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Remove mem dir between tests so each test starts clean.
  try {
    fs.rmSync(MEM_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

afterAll(() => {
  // Full cleanup of the fake home.
  try {
    fs.rmSync(FAKE_HOME, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─── listMemoryEntries ────────────────────────────────────────────────────────

describe('listMemoryEntries()', () => {
  it('returns [] when the memory directory does not exist', async () => {
    const result = await listMemoryEntries(FAKE_CWD);
    expect(result).toEqual([]);
  });

  it('returns [] when the dir exists but MEMORY.md is absent', async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture under os.tmpdir()
    fs.mkdirSync(MEM_DIR, { recursive: true });
    const result = await listMemoryEntries(FAKE_CWD);
    expect(result).toEqual([]);
  });

  it('parses a well-formed MEMORY.md into MemoryEntry records', async () => {
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), BASIC_MEMORY_MD);
    // Create one linked file so we can verify exists flag.
    writeFile(path.join(MEM_DIR, 'user_auth_subscription.md'), 'content');

    const entries = await listMemoryEntries(FAKE_CWD);

    expect(entries).toHaveLength(2);

    const first = entries[0];
    expect(first.id).toBe('user_auth_subscription');
    expect(first.title).toBe('Max subscription');
    expect(first.description).toBe('OAuth only, no API key');
    expect(first.section).toBe('Constraints');
    expect(first.exists).toBe(true);

    const second = entries[1];
    expect(second.id).toBe('feedback_product_philosophy');
    expect(second.title).toBe('Amplifier not replacement');
    expect(second.description).toBe('focus on visibility');
    expect(second.section).toBe('Product Philosophy');
    expect(second.exists).toBe(false); // file not created
  });

  it('marks exists=false when the linked file is absent', async () => {
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), BASIC_MEMORY_MD);
    // Neither linked file is created.
    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries.every((e) => !e.exists)).toBe(true);
  });

  it('marks exists=true when the linked file is present', async () => {
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), BASIC_MEMORY_MD);
    writeFile(path.join(MEM_DIR, 'user_auth_subscription.md'), 'data');
    writeFile(path.join(MEM_DIR, 'feedback_product_philosophy.md'), 'data');

    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries.every((e) => e.exists)).toBe(true);
  });

  it('supports em-dash (—) as the link-description separator', async () => {
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), MEMORY_MD_EM_DASH);
    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('rendering patterns from Cursor');
  });

  it('supports ASCII dash (-) as the link-description separator', async () => {
    const md = `## Section\n- [Title](file.md) - some description\n`;
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), md);
    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries[0].description).toBe('some description');
  });

  it('skips a bullet line that has no link (missing []() pattern)', async () => {
    const md = `## Section\n- plain text bullet, no link\n- [OK](ok.md) — kept\n`;
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), md);
    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('ok');
  });

  it('skips a bullet whose filename contains a path separator (traversal)', async () => {
    const md = `## Section\n- [Bad](../../etc/passwd) — traversal\n- [Good](safe.md) — kept\n`;
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), md);
    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('safe');
  });

  it('matches the real MEMORY.md shape (multiple sections, em-dash bullets)', async () => {
    const realistic = [
      '# Project Memory',
      '',
      '## Constraints',
      '- [Auth](auth.md) — OAuth only',
      '',
      '## Active Initiatives',
      '- [Graph adoption](graph.md) — 0% in 369 sessions',
      '- [Telemetry](telemetry.md) — signals restored',
      '',
      '## References',
      '- [Chat rendering](reference_chat.md) — industry consensus',
    ].join('\n');
    writeFile(path.join(MEM_DIR, 'MEMORY.md'), realistic);

    const entries = await listMemoryEntries(FAKE_CWD);
    expect(entries).toHaveLength(4);
    expect(entries[0].section).toBe('Constraints');
    expect(entries[1].section).toBe('Active Initiatives');
    expect(entries[2].section).toBe('Active Initiatives');
    expect(entries[3].section).toBe('References');
  });
});

// ─── readMemoryEntry ──────────────────────────────────────────────────────────

describe('readMemoryEntry()', () => {
  it('returns content for a valid id when the file exists', async () => {
    writeFile(path.join(MEM_DIR, 'user_auth_subscription.md'), 'OAuth only content');
    const result = await readMemoryEntry(FAKE_CWD, 'user_auth_subscription');
    expect(result).toEqual({ content: 'OAuth only content' });
  });

  it('returns null when the file does not exist', async () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture under os.tmpdir()
    fs.mkdirSync(MEM_DIR, { recursive: true });
    const result = await readMemoryEntry(FAKE_CWD, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when id contains ".." (traversal)', async () => {
    const result = await readMemoryEntry(FAKE_CWD, '../../../etc/passwd');
    expect(result).toBeNull();
  });

  it('returns null when id contains a forward slash (traversal)', async () => {
    const result = await readMemoryEntry(FAKE_CWD, 'subdir/file');
    expect(result).toBeNull();
  });

  it('returns null when id contains a backslash (traversal)', async () => {
    const result = await readMemoryEntry(FAKE_CWD, 'sub\\file');
    expect(result).toBeNull();
  });
});
