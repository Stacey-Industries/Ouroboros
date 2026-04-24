/**
 * gitParsersChangedFiles.test.ts — Unit tests for getChangedFilesBetween.
 */

import { describe, expect, it, vi } from 'vitest';

import { getChangedFilesBetween } from './gitParsersChangedFiles';

const MB = 1024 * 1024;

function makeGitStdout(responses: Record<string, string>) {
  return vi.fn((_root: string, args: string[]) => {
    const key = args.join(' ');
    const match = Object.keys(responses).find((k) => key.includes(k));
    // eslint-disable-next-line security/detect-object-injection -- match is selected from Object.keys(responses)
    return Promise.resolve(match ? responses[match] : '');
  });
}

describe('getChangedFilesBetween', () => {
  it('returns empty array when numstat output is empty', async () => {
    const gitStdout = makeGitStdout({ '--numstat': '', '--name-status': '' });
    const result = await getChangedFilesBetween({
      root: '/repo',
      fromHash: 'abc',
      toHash: 'def',
      gitStdout,
      MB,
    });
    expect(result).toEqual([]);
  });

  it('parses numstat output into ChangedFile entries', async () => {
    const numstat = '10\t2\tsrc/foo.ts\n5\t0\tsrc/bar.ts\n';
    const gitStdout = makeGitStdout({ '--numstat': numstat, '--name-status': '' });
    const result = await getChangedFilesBetween({
      root: '/repo',
      fromHash: 'abc',
      toHash: 'def',
      gitStdout,
      MB,
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ path: 'src/foo.ts', additions: 10, deletions: 2 });
    expect(result[1]).toMatchObject({ path: 'src/bar.ts', additions: 5, deletions: 0 });
  });

  it('merges name-status into file entries', async () => {
    const numstat = '3\t1\tsrc/added.ts\n0\t5\tsrc/deleted.ts\n';
    const nameStatus = 'A\tsrc/added.ts\nD\tsrc/deleted.ts\n';
    const gitStdout = makeGitStdout({ '--numstat': numstat, '--name-status': nameStatus });
    const result = await getChangedFilesBetween({
      root: '/repo',
      fromHash: 'abc',
      toHash: 'def',
      gitStdout,
      MB,
    });
    expect(result.find((f) => f.path === 'src/added.ts')?.status).toBe('added');
    expect(result.find((f) => f.path === 'src/deleted.ts')?.status).toBe('deleted');
  });

  it('handles binary files (dash counts) without throwing', async () => {
    const numstat = '-\t-\tassets/image.png\n';
    const gitStdout = makeGitStdout({ '--numstat': numstat, '--name-status': '' });
    const result = await getChangedFilesBetween({
      root: '/repo',
      fromHash: 'abc',
      toHash: 'def',
      gitStdout,
      MB,
    });
    expect(result[0]).toMatchObject({ path: 'assets/image.png', additions: 0, deletions: 0 });
  });

  it('falls back to numstat-only when name-status throws', async () => {
    const numstat = '1\t0\tsrc/x.ts\n';
    const gitStdout = vi.fn((_root: string, args: string[]) => {
      if (args.includes('--name-status')) return Promise.reject(new Error('git error'));
      return Promise.resolve(numstat);
    });
    const result = await getChangedFilesBetween({
      root: '/repo',
      fromHash: 'abc',
      toHash: 'def',
      gitStdout,
      MB,
    });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/x.ts');
  });
});
