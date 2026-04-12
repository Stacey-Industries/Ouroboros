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

import { buildContextPacket } from './contextPacketBuilder';
import type { LiveIdeState, RepoFacts } from './types';

const createdRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-context-packet-'));
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

import { clearContextPacketCache } from './contextPacketBuilder';

afterEach(async () => {
  clearContextPacketCache();
  await Promise.all(
    createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('contextPacketBuilder', () => {
  it('omits lower-ranked files when the byte budget is exhausted', async () => {
    const root = await createTempRoot();
    const alphaFile = path.join(root, 'src', 'alpha.ts');
    const betaFile = path.join(root, 'src', 'beta.ts');

    await writeFile(alphaFile, 'export const alpha = 1\n'.repeat(4));
    await writeFile(betaFile, 'export const beta = 2\n'.repeat(4));

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test helper; path is constructed from known temp root
    const firstFileBytes = Buffer.byteLength(await fs.readFile(alphaFile, 'utf-8'), 'utf-8');

    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'include both files',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: {
          maxFiles: 2,
          maxBytes: firstFileBytes + 5,
          maxTokens: 10_000,
        },
        contextSelection: {
          includedFiles: ['src/alpha.ts', 'src/beta.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    expect(result.packet.files).toHaveLength(1);
    expect(result.packet.files[0]?.filePath).toBe(alphaFile);
    expect(result.packet.omittedCandidates).toContainEqual({
      filePath: betaFile,
      reason: 'All snippets were omitted by packet budgeting rules',
    });
    expect(result.packet.budget.estimatedBytes).toBeGreaterThan(0);
    expect(result.packet.budget.estimatedBytes).toBeLessThanOrEqual(firstFileBytes + 5);
    expect(result.packet.budget.droppedContentNotes.some((note) => note.includes('beta.ts'))).toBe(
      true,
    );
  });

  it('large file does not crowd out small files within budget', async () => {
    const root = await createTempRoot();
    // One large file + five small files, all included
    const largePath = path.join(root, 'src', 'large.ts');
    const smallPaths = [1, 2, 3, 4, 5].map((i) => path.join(root, 'src', `small${i}.ts`));
    await writeFile(largePath, 'const x = 1;\n'.repeat(200));
    for (const p of smallPaths) await writeFile(p, 'const y = 2;\n'.repeat(10));

    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'check all files',
        mode: 'review',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: { maxFiles: 10, maxBytes: 200_000, maxTokens: 50_000 },
        contextSelection: {
          includedFiles: ['src/large.ts', 'src/small1.ts', 'src/small2.ts', 'src/small3.ts', 'src/small4.ts', 'src/small5.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    const includedPaths = result.packet.files.map((f) => f.filePath);
    for (const p of smallPaths) {
      expect(includedPaths).toContain(p);
    }
    expect(includedPaths).toContain(largePath);
  });

  it('tier 1 user_selected files are always present regardless of size', async () => {
    const root = await createTempRoot();
    const selected1 = path.join(root, 'src', 'selected1.ts');
    const selected2 = path.join(root, 'src', 'selected2.ts');
    const other = path.join(root, 'src', 'other.ts');
    await writeFile(selected1, 'export const a = 1;\n'.repeat(5));
    await writeFile(selected2, 'export const b = 2;\n'.repeat(5));
    await writeFile(other, 'export const c = 3;\n'.repeat(5));

    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'test tier 1 guarantee',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: { maxFiles: 10, maxBytes: 200_000, maxTokens: 50_000 },
        contextSelection: {
          userSelectedFiles: ['src/selected1.ts', 'src/selected2.ts'],
          includedFiles: ['src/other.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    const includedPaths = result.packet.files.map((f) => f.filePath);
    expect(includedPaths).toContain(selected1);
    expect(includedPaths).toContain(selected2);
  });

  it('tier 1 is capped and does not exhaust the entire budget', async () => {
    const root = await createTempRoot();
    // A large user-selected file + small included files
    const selectedBig = path.join(root, 'src', 'big.ts');
    const small1 = path.join(root, 'src', 'small1.ts');
    const small2 = path.join(root, 'src', 'small2.ts');
    await writeFile(selectedBig, 'const x = 1;\n'.repeat(300));
    await writeFile(small1, 'const a = 1;\n'.repeat(5));
    await writeFile(small2, 'const b = 2;\n'.repeat(5));

    // Total budget 20_000 bytes; tier1 cap = 60% = 12_000
    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'tier cap test',
        mode: 'edit',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: { maxFiles: 10, maxBytes: 20_000, maxTokens: 50_000 },
        contextSelection: {
          userSelectedFiles: ['src/big.ts'],
          includedFiles: ['src/small1.ts', 'src/small2.ts'],
        },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    // Tier 1 was capped, so small files should also appear
    const includedPaths = result.packet.files.map((f) => f.filePath);
    expect(includedPaths).toContain(small1);
    expect(includedPaths).toContain(small2);
    // Budget summary has tier allocation
    expect(result.packet.budget.tierAllocation).toBeDefined();
    expect(result.packet.budget.tierAllocation?.['tier1']).toBeGreaterThanOrEqual(0);
  });

  it('truncateToSignatures keeps head and tail of large content', async () => {
    const { truncateToSignatures } = await import('./contextPacketBuilderSupport');
    const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`);
    const content = lines.join('\n');
    const result = truncateToSignatures(content, 20);
    // Head lines preserved
    expect(result).toContain('line1');
    expect(result).toContain('line14'); // ceil(20 * 0.7) = 14
    // Tail lines preserved
    expect(result).toContain('line100');
    // Omission marker present
    expect(result).toContain('lines omitted');
    // Short content is returned unchanged
    const short = 'a\nb\nc';
    expect(truncateToSignatures(short, 20)).toBe(short);
  });

  it('backward compatibility: small packets include all files unchanged', async () => {
    const root = await createTempRoot();
    const file1 = path.join(root, 'src', 'alpha.ts');
    const file2 = path.join(root, 'src', 'beta.ts');
    await writeFile(file1, 'export const alpha = 1;\n');
    await writeFile(file2, 'export const beta = 2;\n');

    const result = await buildContextPacket({
      request: {
        workspaceRoots: [root],
        goal: 'compat test',
        mode: 'review',
        provider: 'codex',
        verificationProfile: 'fast',
        budget: { maxFiles: 10, maxBytes: 200_000, maxTokens: 50_000 },
        contextSelection: { includedFiles: ['src/alpha.ts', 'src/beta.ts'] },
      },
      repoFacts: createRepoFacts(root),
      liveIdeState: createLiveIdeState(),
    });

    expect(result.packet.files.length).toBeGreaterThanOrEqual(2);
    const paths = result.packet.files.map((f) => f.filePath);
    expect(paths).toContain(file1);
    expect(paths).toContain(file2);
    expect(result.packet.omittedCandidates.filter((c) =>
      c.filePath === file1 || c.filePath === file2,
    )).toHaveLength(0);
  });
});
