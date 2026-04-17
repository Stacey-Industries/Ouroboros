/**
 * fileIdNormalise.test.ts — Unit tests for the shared fileId normaliser.
 *
 * These tests verify that normaliseFileId produces identical output for the
 * same underlying path regardless of separator style or case, which is the
 * contract the Wave 31 (traceId, fileId) join depends on.
 */

import { describe, expect, it } from 'vitest';

import { normaliseFileId } from './fileIdNormalise';

describe('normaliseFileId — basic normalisation', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normaliseFileId('C:\\Users\\foo\\src\\a.ts')).toBe('c:/users/foo/src/a.ts');
  });

  it('lowercases the path', () => {
    expect(normaliseFileId('/Home/User/Src/A.ts')).toBe('/home/user/src/a.ts');
  });

  it('is idempotent — already normalised path is unchanged', () => {
    const id = 'src/main/foo.ts';
    expect(normaliseFileId(id)).toBe(id);
  });
});

describe('normaliseFileId — workspace-relative stripping', () => {
  it('strips the workspace root prefix to produce a relative path', () => {
    const root = '/workspace/myproject';
    const abs = '/workspace/myproject/src/a.ts';
    expect(normaliseFileId(abs, root)).toBe('src/a.ts');
  });

  it('strips root prefix with backslash workspace root (Windows)', () => {
    const root = 'C:\\Web App\\myproject';
    const abs = 'C:\\Web App\\myproject\\src\\b.ts';
    expect(normaliseFileId(abs, root)).toBe('src/b.ts');
  });

  it('keeps absolute normalised form when path is outside workspace root', () => {
    const root = '/workspace/myproject';
    const abs = '/other/path/a.ts';
    expect(normaliseFileId(abs, root)).toBe('/other/path/a.ts');
  });

  it('does not strip a prefix that is only a partial directory match', () => {
    // /workspace/myproject2 must not strip /workspace/myproject prefix
    const root = '/workspace/myproject';
    const abs = '/workspace/myproject2/src/a.ts';
    expect(normaliseFileId(abs, root)).toBe('/workspace/myproject2/src/a.ts');
  });

  it('handles trailing slash in workspace root gracefully', () => {
    const root = '/workspace/myproject/';
    const abs = '/workspace/myproject/src/c.ts';
    expect(normaliseFileId(abs, root)).toBe('src/c.ts');
  });

  it('returns absolute form when workspaceRoot is empty string', () => {
    expect(normaliseFileId('/home/user/src/a.ts', '')).toBe('/home/user/src/a.ts');
  });

  it('returns absolute form when workspaceRoot is omitted', () => {
    expect(normaliseFileId('/home/user/src/a.ts')).toBe('/home/user/src/a.ts');
  });
});

describe('normaliseFileId — join symmetry', () => {
  it('produces the same output from Windows and Unix path forms of the same file', () => {
    const root = 'C:/Web App/project';
    const winPath = 'C:\\Web App\\project\\src\\foo.ts';
    const unixPath = 'C:/Web App/project/src/foo.ts';
    expect(normaliseFileId(winPath, root)).toBe(normaliseFileId(unixPath, root));
  });

  it('produces the same output regardless of case in the input path', () => {
    const root = '/workspace/project';
    const lower = '/workspace/project/src/foo.ts';
    const upper = '/workspace/project/Src/Foo.ts';
    expect(normaliseFileId(lower, root)).toBe(normaliseFileId(upper, root));
  });
});
