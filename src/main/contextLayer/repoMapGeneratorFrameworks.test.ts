/**
 * repoMapGeneratorFrameworks.test.ts — Smoke tests for framework detection.
 * Extracted from repoMapGenerator in Wave 69 B1; behavior is unchanged.
 */

import { describe, expect, it } from 'vitest';

import type { IndexedRepoFile, RepoIndexSnapshot } from '../orchestration/repoIndexer';
import { detectFrameworks } from './repoMapGeneratorFrameworks';

function makeFile(relativePath: string): IndexedRepoFile {
  const ext = relativePath.includes('.') ? '.' + relativePath.split('.').pop() : '';
  return {
    rootPath: '/repo',
    path: `/repo/${relativePath}`,
    relativePath,
    extension: ext,
    language: ext === '.tsx' ? 'typescript' : 'unknown',
    size: 100,
    isDirectory: false,
    isSymlink: false,
    modifiedAt: 0,
    imports: [],
  } as IndexedRepoFile;
}

function makeSnapshot(files: IndexedRepoFile[]): RepoIndexSnapshot {
  return {
    roots: [
      {
        rootPath: '/repo',
        files,
        workspaceFact: { languages: [] },
      },
    ],
  } as unknown as RepoIndexSnapshot;
}

describe('detectFrameworks', () => {
  it('detects Next.js from next.config.js', () => {
    const snap = makeSnapshot([makeFile('next.config.js'), makeFile('app/page.tsx')]);
    expect(detectFrameworks(snap)).toContain('Next.js');
  });

  it('detects Vue from a .vue file', () => {
    const snap = makeSnapshot([makeFile('src/App.vue'), makeFile('package.json')]);
    expect(detectFrameworks(snap)).toContain('Vue');
  });

  it('detects Angular from angular.json', () => {
    const snap = makeSnapshot([makeFile('angular.json'), makeFile('src/main.ts')]);
    expect(detectFrameworks(snap)).toContain('Angular');
  });

  it('detects Electron from src/main + src/renderer + src/preload structure', () => {
    const snap = makeSnapshot([
      makeFile('src/main/main.ts'),
      makeFile('src/renderer/App.tsx'),
      makeFile('src/preload/preload.ts'),
    ]);
    expect(detectFrameworks(snap)).toContain('Electron');
  });

  it('does not double-flag Vite when Electron is present', () => {
    const snap = makeSnapshot([
      makeFile('src/main/main.ts'),
      makeFile('src/renderer/App.tsx'),
      makeFile('src/preload/preload.ts'),
      makeFile('vite.config.ts'),
    ]);
    const result = detectFrameworks(snap);
    expect(result).toContain('Electron');
    expect(result).not.toContain('Vite');
  });

  it('detects React from 3+ tsx files when no other meta-framework is present', () => {
    const snap = makeSnapshot([makeFile('a.tsx'), makeFile('b.tsx'), makeFile('c.tsx')]);
    expect(detectFrameworks(snap)).toContain('React');
  });

  it('does not detect React if Next.js is already detected', () => {
    const snap = makeSnapshot([
      makeFile('next.config.js'),
      makeFile('a.tsx'),
      makeFile('b.tsx'),
      makeFile('c.tsx'),
    ]);
    expect(detectFrameworks(snap)).not.toContain('React');
  });

  it('detects Tailwind CSS from tailwind.config files', () => {
    const snap = makeSnapshot([makeFile('tailwind.config.js')]);
    expect(detectFrameworks(snap)).toContain('Tailwind CSS');
  });

  it('returns alphabetically sorted output', () => {
    const snap = makeSnapshot([
      makeFile('next.config.js'),
      makeFile('tailwind.config.js'),
      makeFile('app/page.tsx'),
    ]);
    const result = detectFrameworks(snap);
    expect(result).toEqual([...result].sort((a, b) => a.localeCompare(b)));
  });

  it('returns an empty array when nothing matches', () => {
    const snap = makeSnapshot([makeFile('README.md')]);
    expect(detectFrameworks(snap)).toEqual([]);
  });
});
