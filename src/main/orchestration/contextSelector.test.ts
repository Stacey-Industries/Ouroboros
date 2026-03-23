import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./contextSelectionSupport', async () => {
  const actual = await vi.importActual<typeof import('./contextSelectionSupport')>(
    './contextSelectionSupport',
  );
  const fsModule = await import('fs/promises');

  return {
    ...actual,
    loadContextFileSnapshot: async (
      filePath: string,
      cache?: Map<string, { filePath: string; content: string | null; unsaved: boolean }>,
    ) => {
      const key = actual.toPathKey(filePath);
      const cached = cache?.get(key);
      if (cached) {
        return cached;
      }

      let content: string | null = null;
      try {
        content = await fsModule.readFile(filePath, 'utf-8');
      } catch {
        content = null;
      }

      const snapshot = { filePath, content, unsaved: false };
      cache?.set(key, snapshot);
      return snapshot;
    },
  };
});

import { selectContextFiles } from './contextSelector';
import type { LiveIdeState, RepoFacts } from './types';

const createdRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-context-selector-'));
  createdRoots.push(root);
  return root;
}

async function writeFile(filePath: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is constructed from known temp root
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is constructed from known temp root
  await fs.writeFile(filePath, content, 'utf-8');
}

function createRepoFacts(root: string): RepoFacts {
  return {
    workspaceRoots: [root],
    roots: [
      {
        rootPath: root,
        languages: ['typescript'],
        entryPoints: [],
        recentlyEditedFiles: [],
        indexedAt: 1,
      },
    ],
    gitDiff: {
      changedFiles: [],
      totalAdditions: 0,
      totalDeletions: 0,
      changedFileCount: 0,
      generatedAt: 1,
    },
    diagnostics: {
      files: [],
      totalErrors: 0,
      totalWarnings: 0,
      totalInfos: 0,
      totalHints: 0,
      generatedAt: 1,
    },
    recentEdits: { files: [], generatedAt: 1 },
  };
}

function createLiveIdeState(): LiveIdeState {
  return {
    selectedFiles: [],
    openFiles: [],
    dirtyFiles: [],
    dirtyBuffers: [],
    collectedAt: 1,
  };
}

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('contextSelector', () => {
  it('ranks equal-score files deterministically by normalized file path', async () => {
    const root = await createTempRoot();
    const alphaFile = path.join(root, 'src', 'alpha.ts');
    const betaFile = path.join(root, 'src', 'beta.ts');

    await writeFile(alphaFile, 'export const alpha = 1\n');
    await writeFile(betaFile, 'export const beta = 2\n');

    const result = await selectContextFiles({
      request: {
        workspaceRoots: [root],
        goal: 'fix the file',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'fast',
        contextSelection: {
          includedFiles: ['src/beta.ts', 'src/alpha.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    expect(result.rankedFiles).toHaveLength(2);
    expect(result.rankedFiles[0]?.filePath).toBe(alphaFile);
    expect(result.rankedFiles[1]?.filePath).toBe(betaFile);
    expect(result.rankedFiles[0]?.score).toBe(result.rankedFiles[1]?.score);
    expect(result.rankedFiles[0]?.confidence).toBe('high');
    expect(result.rankedFiles[1]?.confidence).toBe('high');
  });
});
