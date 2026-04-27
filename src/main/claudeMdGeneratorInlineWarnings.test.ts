/**
 * claudeMdGeneratorInlineWarnings.test.ts
 *
 * Covers each comment kind, edge cases (empty dir, unrecognized lines,
 * eslint-disable with reason, mixed files).
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectInlineWarnings } from './claudeMdGeneratorInlineWarnings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'inline-warnings-test-'));
}

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from test tmpdir
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('collectInlineWarnings', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for an empty directory', async () => {
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toEqual([]);
  });

  it('returns empty array for a non-existent directory', async () => {
    const result = await collectInlineWarnings(path.join(tmpDir, 'does-not-exist'));
    expect(result).toEqual([]);
  });

  it('extracts NOTE comments', async () => {
    await writeFile(tmpDir, 'foo.ts', '// NOTE: this is load-bearing\nconst x = 1;\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      file: 'foo.ts',
      line: 1,
      kind: 'NOTE',
      text: 'this is load-bearing',
    });
  });

  it('extracts WARNING comments', async () => {
    await writeFile(tmpDir, 'bar.ts', 'const x = 1;\n// WARNING: do not remove this\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'WARNING', text: 'do not remove this', line: 2 });
  });

  it('extracts DO NOT comments', async () => {
    await writeFile(tmpDir, 'baz.ts', '// DO NOT: refactor this without updating the hook\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'DO_NOT',
      text: 'refactor this without updating the hook',
    });
  });

  it('extracts HACK comments', async () => {
    await writeFile(tmpDir, 'qux.ts', '// HACK: workaround for electron bug #1234\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'HACK', text: 'workaround for electron bug #1234' });
  });

  it('extracts eslint-disable lines with em-dash reason', async () => {
    await writeFile(
      tmpDir,
      'eslint-test.ts',
      '// eslint-disable-next-line security/detect-non-literal-fs-filename — reason: path from dir listing\n',
    );
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'ESLINT_REASON', text: 'path from dir listing' });
  });

  it('extracts eslint-disable lines with double-dash reason', async () => {
    await writeFile(
      tmpDir,
      'eslint-test2.ts',
      '// eslint-disable-next-line no-console -- reason: intentional debug output\n',
    );
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'ESLINT_REASON', text: 'intentional debug output' });
  });

  it('skips eslint-disable lines without a reason', async () => {
    await writeFile(tmpDir, 'no-reason.ts', '// eslint-disable-next-line no-console\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('ignores non-.ts/.tsx files', async () => {
    await writeFile(tmpDir, 'readme.md', '// NOTE: this should not be scanned\n');
    await writeFile(tmpDir, 'script.js', '// NOTE: js files also excluded\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('scans .tsx files', async () => {
    await writeFile(tmpDir, 'Component.tsx', 'const x = 1;\n// WARNING: order matters here\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ file: 'Component.tsx', kind: 'WARNING' });
  });

  it('is non-recursive — ignores subdirectories', async () => {
    const subDir = path.join(tmpDir, 'sub');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from test tmpdir
    await fs.mkdir(subDir);
    await writeFile(subDir, 'nested.ts', '// NOTE: nested file should not appear\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('collects warnings from multiple files in order', async () => {
    await writeFile(tmpDir, 'alpha.ts', '// NOTE: alpha note\n');
    await writeFile(tmpDir, 'beta.ts', '// WARNING: beta warning\n// HACK: beta hack\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(3);
    const kinds = result.map((w) => w.kind);
    expect(kinds).toContain('NOTE');
    expect(kinds).toContain('WARNING');
    expect(kinds).toContain('HACK');
  });

  it('captures correct line numbers for multiple warnings in one file', async () => {
    await writeFile(
      tmpDir,
      'multi.ts',
      'const a = 1;\n// NOTE: line 2\nconst b = 2;\n// WARNING: line 4\n',
    );
    const result = await collectInlineWarnings(tmpDir);
    const note = result.find((w) => w.kind === 'NOTE');
    const warning = result.find((w) => w.kind === 'WARNING');
    expect(note?.line).toBe(2);
    expect(warning?.line).toBe(4);
  });

  it('handles files with no matching comments gracefully', async () => {
    await writeFile(tmpDir, 'clean.ts', 'export const x = 1;\nexport const y = 2;\n');
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(0);
  });

  it('ESLINT_REASON takes priority over NOTE if both patterns would match', async () => {
    // A contrived line that contains both eslint-disable and NOTE keyword
    await writeFile(
      tmpDir,
      'priority.ts',
      '// eslint-disable-next-line foo -- reason: NOTE this is special\n',
    );
    const result = await collectInlineWarnings(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('ESLINT_REASON');
  });
});
