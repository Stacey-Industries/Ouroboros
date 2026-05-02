/**
 * contextPacketBuilderModelThreading.test.ts — Wave 70 Phase A1 regression.
 *
 * Verifies that `request.model` is threaded through `enrichPacket` into the
 * contextLayer controller's `enrichPacket(packet, keywords, model)` call so
 * the model-aware budget table in `repoMapBudgets.ts` can apply the right
 * tier (Opus 16 KB / Sonnet 12 KB / default 8 KB).
 *
 * Pre-Wave-70: every model tier received the default Haiku-sized budget
 * because `request.model` was dropped at `contextPacketBuilder.ts:155`.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  store: { get: vi.fn(), set: vi.fn(), onDidChange: vi.fn(() => ({ dispose: vi.fn() })) },
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('./contextPacketBuilderDecisions', () => ({
  emitDecisionsForPacket: vi.fn(),
}));

const enrichPacketSpy = vi.fn(async (packet: unknown) => ({
  packet,
  injectedModules: [],
  injectedTokens: 0,
}));

vi.mock('../contextLayer/contextLayerController', () => ({
  getContextLayerController: () => ({
    enrichPacket: enrichPacketSpy,
  }),
}));

import { buildContextPacket, clearContextPacketCache } from './contextPacketBuilder';
import type { LiveIdeState, RepoFacts, TaskRequest } from './types';

const createdRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ouroboros-cpb-model-'));
  createdRoots.push(root);
  return root;
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

function makeRequest(model: string | undefined, root: string): TaskRequest {
  return {
    goal: 'audit the chat orchestration layer',
    workspaceRoots: [root],
    mode: 'plan',
    provider: 'claude-code',
    model,
  } as TaskRequest;
}

afterEach(async () => {
  enrichPacketSpy.mockClear();
  clearContextPacketCache();
  await Promise.all(
    createdRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('contextPacketBuilder — request.model threading', () => {
  it('forwards request.model to layerController.enrichPacket', async () => {
    const root = await createTempRoot();
    const facts = createRepoFacts(root);
    const live = createLiveIdeState();

    await buildContextPacket({
      request: makeRequest('claude-opus-4-7', root),
      repoFacts: facts,
      liveIdeState: live,
    });

    expect(enrichPacketSpy).toHaveBeenCalled();
    const call = enrichPacketSpy.mock.calls[enrichPacketSpy.mock.calls.length - 1];
    // signature: (packet, goalKeywords, model?)
    expect(call[2]).toBe('claude-opus-4-7');
  });

  it('passes undefined when request.model is absent (default budget falls back)', async () => {
    const root = await createTempRoot();
    const facts = createRepoFacts(root);
    const live = createLiveIdeState();

    await buildContextPacket({
      request: makeRequest(undefined, root),
      repoFacts: facts,
      liveIdeState: live,
    });

    expect(enrichPacketSpy).toHaveBeenCalled();
    const call = enrichPacketSpy.mock.calls[enrichPacketSpy.mock.calls.length - 1];
    expect(call[2]).toBeUndefined();
  });

  it('passes the Sonnet identifier through unchanged', async () => {
    const root = await createTempRoot();
    const facts = createRepoFacts(root);
    const live = createLiveIdeState();

    await buildContextPacket({
      request: makeRequest('claude-sonnet-4-6', root),
      repoFacts: facts,
      liveIdeState: live,
    });

    const call = enrichPacketSpy.mock.calls[enrichPacketSpy.mock.calls.length - 1];
    expect(call[2]).toBe('claude-sonnet-4-6');
  });
});
