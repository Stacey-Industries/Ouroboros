/**
 * claudeMdGeneratorSupport.test.ts
 *
 * Smoke tests for claudeMdGeneratorSupport helpers.
 * Covers: toForwardSlash, sanitizeGeneratedContent, discoverDirectories,
 * buildFileListing, buildPrompt strategy routing (lean vs legacy).
 *
 * Avoids spawning the real `claude` CLI — all I/O is against tmp directories.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildFileListing,
  buildPrompt,
  discoverDirectories,
  sanitizeGeneratedContent,
  toForwardSlash,
} from './claudeMdGeneratorSupport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'support-test-'));
}

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from test tmpdir
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// toForwardSlash
// ---------------------------------------------------------------------------

describe('toForwardSlash', () => {
  it('converts backslashes to forward slashes', () => {
    expect(toForwardSlash('src\\main\\foo.ts')).toBe('src/main/foo.ts');
  });

  it('leaves forward slashes unchanged', () => {
    expect(toForwardSlash('src/main/foo.ts')).toBe('src/main/foo.ts');
  });

  it('handles empty string', () => {
    expect(toForwardSlash('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// sanitizeGeneratedContent
// ---------------------------------------------------------------------------

describe('sanitizeGeneratedContent', () => {
  it('returns content starting at the first heading', () => {
    const input = 'Here is the content:\n# My Heading\nsome text';
    expect(sanitizeGeneratedContent(input)).toBe('# My Heading\nsome text');
  });

  it('returns content starting at an HTML comment', () => {
    const input = 'Preamble prose\n<!-- auto:start -->\ncontent';
    expect(sanitizeGeneratedContent(input)).toBe('<!-- auto:start -->\ncontent');
  });

  it('returns empty string when no heading or comment is found', () => {
    expect(sanitizeGeneratedContent('just some prose with no heading')).toBe('');
  });

  it('trims leading whitespace before scanning', () => {
    const input = '\n\n# Heading\ntext';
    expect(sanitizeGeneratedContent(input)).toBe('# Heading\ntext');
  });

  it('drops ★ Insight blocks before the first heading', () => {
    const input = '`★ some insight`\n# Real Heading\ncontent';
    expect(sanitizeGeneratedContent(input)).toBe('# Real Heading\ncontent');
  });

  it('passes through content that already starts with a heading', () => {
    const input = '# Heading\ntext';
    expect(sanitizeGeneratedContent(input)).toBe('# Heading\ntext');
  });
});

// ---------------------------------------------------------------------------
// discoverDirectories
// ---------------------------------------------------------------------------

describe('discoverDirectories', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for a directory with no code files', async () => {
    const result = await discoverDirectories(tmpDir);
    expect(result).toEqual([]);
  });

  it('includes a directory with 3+ .ts files', async () => {
    await writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    await writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    await writeFile(tmpDir, 'c.ts', 'export const c = 3;');
    const result = await discoverDirectories(tmpDir);
    expect(result).toContain(tmpDir);
  });

  it('does not include a directory with fewer than 3 code files', async () => {
    await writeFile(tmpDir, 'a.ts', 'export const a = 1;');
    await writeFile(tmpDir, 'b.ts', 'export const b = 2;');
    const result = await discoverDirectories(tmpDir);
    expect(result).not.toContain(tmpDir);
  });

  it('skips node_modules directories', async () => {
    const nmDir = path.join(tmpDir, 'node_modules');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from test tmpdir
    await fs.mkdir(nmDir);
    await writeFile(nmDir, 'a.ts', 'x');
    await writeFile(nmDir, 'b.ts', 'x');
    await writeFile(nmDir, 'c.ts', 'x');
    const result = await discoverDirectories(tmpDir);
    expect(result.some((d) => d.includes('node_modules'))).toBe(false);
  });

  it('returns empty array for non-existent directory', async () => {
    const result = await discoverDirectories(path.join(tmpDir, 'nope'));
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildFileListing
// ---------------------------------------------------------------------------

describe('buildFileListing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for a directory with no code files', async () => {
    await writeFile(tmpDir, 'readme.md', '# readme');
    const result = await buildFileListing(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns entries for .ts files with name, size, and lines', async () => {
    await writeFile(tmpDir, 'foo.ts', 'export const a = 1;\nexport const b = 2;\n');
    const result = await buildFileListing(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('foo.ts');
    expect(result[0].lines).toBeGreaterThan(0);
    expect(result[0].size).toBeGreaterThan(0);
  });

  it('returns entries for .tsx files', async () => {
    await writeFile(tmpDir, 'Comp.tsx', 'export const C = () => null;\n');
    const result = await buildFileListing(tmpDir);
    expect(result.some((f) => f.name === 'Comp.tsx')).toBe(true);
  });

  it('sorts by line count descending', async () => {
    await writeFile(tmpDir, 'small.ts', 'const x = 1;\n');
    await writeFile(tmpDir, 'large.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
    const result = await buildFileListing(tmpDir);
    expect(result[0].name).toBe('large.ts');
  });

  it('ignores non-code files', async () => {
    await writeFile(tmpDir, 'config.json', '{}');
    await writeFile(tmpDir, 'style.css', 'body {}');
    const result = await buildFileListing(tmpDir);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildPrompt — strategy routing
// ---------------------------------------------------------------------------

describe('buildPrompt — strategy routing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    // Add enough files to be a meaningful dir
    await writeFile(tmpDir, 'foo.ts', 'export const x = 1;\n');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lean strategy produces a prompt containing "OMIT rather than speculate"', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir, { strategy: 'lean' });
    expect(prompt).toContain('OMIT rather than speculate');
  });

  it('lean strategy is the default when strategy is omitted', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir);
    expect(prompt).toContain('OMIT rather than speculate');
  });

  it('legacy strategy produces a prompt containing the legacy instructions header', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir, { strategy: 'legacy' });
    expect(prompt).toContain('Generate concise, useful CLAUDE.md content');
  });

  it('legacy strategy does NOT contain "OMIT rather than speculate"', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir, { strategy: 'legacy' });
    expect(prompt).not.toContain('OMIT rather than speculate');
  });

  it('lean strategy includes inline warnings when provided', async () => {
    const warnings = [
      { file: 'foo.ts', line: 1, kind: 'NOTE' as const, text: 'do not remove this' },
    ];
    const prompt = await buildPrompt(tmpDir, tmpDir, {
      strategy: 'lean',
      inlineWarnings: warnings,
    });
    expect(prompt).toContain('do not remove this');
  });

  it('lean strategy with no warnings contains empty-gotchas directive', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir, { strategy: 'lean', inlineWarnings: [] });
    expect(prompt).toContain('Leave "## Gotchas" empty');
  });

  it('lean strategy respects targetMaxLines', async () => {
    const prompt = await buildPrompt(tmpDir, tmpDir, { strategy: 'lean', targetMaxLines: 75 });
    expect(prompt).toContain('under 75 lines');
  });

  it('prompt contains the directory relPath', async () => {
    const prompt = await buildPrompt(tmpDir, path.dirname(tmpDir), { strategy: 'lean' });
    const baseName = path.basename(tmpDir);
    expect(prompt).toContain(baseName);
  });
});
