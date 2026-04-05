import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

// Mock electron before any imports that transitively reach app.getPath()
vi.mock('electron', () => ({
  app: { getPath: (name: string) => `/tmp/test-${name}` },
}));

import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type { ContextPacket } from '../orchestration/types';
import type { InjectionResult } from './contextInjector';
import type { GCResult } from './contextLayerGC';
import type { ContextLayerConfig, ContextLayerManifest, RepoMap } from './contextLayerTypes';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./contextLayerStore');
vi.mock('./contextLayerWatcher');
vi.mock('./repoMapGenerator');
vi.mock('./moduleDetector');
vi.mock('./summarizationQueue');
vi.mock('./contextInjector');
vi.mock('./contextLayerGC');

// Import mocked modules
import { injectContextLayer } from './contextInjector';
// Import the module under test AFTER mocks are set up
import * as controllerModule from './contextLayerController';

const { getContextLayerController, initContextLayer } = controllerModule;
import { runContextLayerGC } from './contextLayerGC';
import {
  ensureGitignore,
  initContextLayerStore,
  readManifest,
  readRepoMap,
  writeManifest,
  writeModuleEntry,
  writeRepoMap,
} from './contextLayerStore';
import { createContextLayerWatcher } from './contextLayerWatcher';
import {
  buildCrossModuleDependencies,
  buildModuleStructuralSummaries,
  detectModules,
} from './moduleDetector';
import { generateRepoMap } from './repoMapGenerator';
import { createSummarizationQueue } from './summarizationQueue';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function createMockConfig(overrides?: Partial<ContextLayerConfig>): ContextLayerConfig {
  return {
    enabled: true,
    maxModules: 50,
    maxSizeBytes: 200 * 1024,
    debounceMs: 5000,
    autoSummarize: false,
    ...overrides,
  };
}

function createMockRepoMap(overrides?: Partial<RepoMap>): RepoMap {
  return {
    version: 1,
    generatedAt: Date.now(),
    workspaceRoot: '/workspace',
    projectName: 'test-project',
    languages: ['typescript'],
    frameworks: ['React'],
    moduleCount: 2,
    totalFileCount: 10,
    modules: [
      {
        structural: {
          module: {
            id: 'module-a',
            label: 'Module A',
            rootPath: 'src/a',
            pattern: 'feature-folder',
          },
          fileCount: 5,
          totalLines: 200,
          languages: ['typescript'],
          exports: ['foo', 'bar'],
          imports: ['react'],
          entryPoints: ['src/a/index.ts'],
          recentlyChanged: false,
          lastModified: Date.now(),
          contentHash: 'hash-a',
        },
      },
      {
        structural: {
          module: {
            id: 'module-b',
            label: 'Module B',
            rootPath: 'src/b',
            pattern: 'feature-folder',
          },
          fileCount: 5,
          totalLines: 300,
          languages: ['typescript'],
          exports: ['baz'],
          imports: ['react'],
          entryPoints: ['src/b/index.ts'],
          recentlyChanged: true,
          lastModified: Date.now(),
          contentHash: 'hash-b',
        },
      },
    ],
    crossModuleDependencies: [{ from: 'module-a', to: 'module-b', weight: 3 }],
    ...overrides,
  };
}

function createMockManifest(overrides?: Partial<ContextLayerManifest>): ContextLayerManifest {
  return {
    version: 1,
    lastFullRebuild: Date.now(),
    lastIncrementalUpdate: Date.now(),
    repoMapHash: 'abc123',
    moduleHashes: { 'module-a': 'hash-a', 'module-b': 'hash-b' },
    totalSizeBytes: 4096,
    ...overrides,
  };
}

function createMockRepoIndex(): RepoIndexSnapshot {
  return {
    indexedAt: Date.now(),
    repoFacts: {
      workspaceRoots: ['/workspace'],
      roots: [
        {
          rootPath: '/workspace',
          fileCount: 10,
          directoryCount: 3,
          languages: ['typescript'],
          entryPoints: ['src/index.ts'],
          recentlyEditedFiles: ['src/a/foo.ts'],
          indexedAt: Date.now(),
        },
      ],
      gitDiff: {
        changedFiles: [
          { filePath: 'src/a/foo.ts', additions: 5, deletions: 2, status: 'modified' },
        ],
        totalAdditions: 5,
        totalDeletions: 2,
        changedFileCount: 1,
        generatedAt: Date.now(),
      },
      diagnostics: {
        files: [],
        totalErrors: 0,
        totalWarnings: 0,
        totalInfos: 0,
        totalHints: 0,
        generatedAt: Date.now(),
      },
      recentEdits: {
        files: ['src/a/foo.ts'],
        generatedAt: Date.now(),
      },
    },
    roots: [
      {
        rootPath: '/workspace',
        stateKey: 'state-key-1',
        indexedAt: Date.now(),
        workspaceFact: {
          rootPath: '/workspace',
          fileCount: 10,
          directoryCount: 3,
          languages: ['typescript'],
          entryPoints: ['src/index.ts'],
          recentlyEditedFiles: ['src/a/foo.ts'],
          indexedAt: Date.now(),
        },
        gitDiff: {
          changedFiles: [],
          totalAdditions: 0,
          totalDeletions: 0,
          changedFileCount: 0,
          generatedAt: Date.now(),
        },
        diagnostics: {
          files: [],
          totalErrors: 0,
          totalWarnings: 0,
          totalInfos: 0,
          totalHints: 0,
          generatedAt: Date.now(),
        },
        recentCommits: [],
        files: [
          {
            rootPath: '/workspace',
            path: '/workspace/src/a/foo.ts',
            relativePath: 'src/a/foo.ts',
            extension: '.ts',
            language: 'typescript',
            size: 500,
            modifiedAt: Date.now(),
            imports: ['react'],
          },
        ],
        directories: [],
      },
    ],
    cache: { key: 'cache-key', hit: false, roots: [] },
  };
}

function createMockContextPacket(): ContextPacket {
  return {
    version: 1,
    id: 'packet-1',
    createdAt: Date.now(),
    task: {
      taskId: 'task-1',
      goal: 'fix the file tree',
      mode: 'edit',
      provider: 'claude-code',
      verificationProfile: 'default',
    },
    repoFacts: {
      workspaceRoots: ['/workspace'],
      roots: [],
      gitDiff: {
        changedFiles: [],
        totalAdditions: 0,
        totalDeletions: 0,
        changedFileCount: 0,
        generatedAt: Date.now(),
      },
      diagnostics: {
        files: [],
        totalErrors: 0,
        totalWarnings: 0,
        totalInfos: 0,
        totalHints: 0,
        generatedAt: Date.now(),
      },
      recentEdits: { files: [], generatedAt: Date.now() },
    },
    liveIdeState: {
      selectedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      collectedAt: Date.now(),
    },
    files: [],
    omittedCandidates: [],
    budget: {
      estimatedBytes: 0,
      estimatedTokens: 0,
      droppedContentNotes: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Mock watcher instance
// ---------------------------------------------------------------------------

function createMockWatcher() {
  return {
    onFileChange: vi.fn(),
    onGitCommit: vi.fn(),
    onSessionStart: vi.fn(),
    forceRebuild: vi.fn(),
    setModuleMap: vi.fn(),
    dispose: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Mock queue instance
// ---------------------------------------------------------------------------

function createMockQueue() {
  return {
    enqueue: vi.fn(),
    status: vi.fn().mockReturnValue({
      queueLength: 0,
      processing: null,
      lastCompleted: null,
      lastError: null,
      totalProcessed: 0,
      totalFailed: 0,
      isRateLimited: false,
      nextJobAt: null,
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockedInitContextLayerStore = vi.mocked(initContextLayerStore);
const mockedEnsureGitignore = vi.mocked(ensureGitignore);
const mockedReadManifest = vi.mocked(readManifest);
const mockedReadRepoMap = vi.mocked(readRepoMap);
const mockedWriteRepoMap = vi.mocked(writeRepoMap);
const mockedWriteModuleEntry = vi.mocked(writeModuleEntry);
const mockedWriteManifest = vi.mocked(writeManifest);
const mockedCreateContextLayerWatcher = vi.mocked(createContextLayerWatcher);
const mockedGenerateRepoMap = vi.mocked(generateRepoMap);
const mockedDetectModules = vi.mocked(detectModules);
const mockedBuildModuleStructuralSummaries = vi.mocked(buildModuleStructuralSummaries);
const mockedBuildCrossModuleDependencies = vi.mocked(buildCrossModuleDependencies);
const mockedCreateSummarizationQueue = vi.mocked(createSummarizationQueue);
const mockedInjectContextLayer = vi.mocked(injectContextLayer);
const mockedRunContextLayerGC = vi.mocked(runContextLayerGC);

let mockWatcher: ReturnType<typeof createMockWatcher>;
let mockQueue: ReturnType<typeof createMockQueue>;
let mockBuildRepoIndex: MockedFunction<(roots: string[]) => Promise<RepoIndexSnapshot>>;

function setupDefaultMocks(): void {
  mockWatcher = createMockWatcher();
  mockQueue = createMockQueue();
  mockBuildRepoIndex = vi
    .fn<(roots: string[]) => Promise<RepoIndexSnapshot>>()
    .mockResolvedValue(createMockRepoIndex());

  mockedInitContextLayerStore.mockResolvedValue(createMockManifest());
  mockedEnsureGitignore.mockResolvedValue(undefined);
  mockedReadManifest.mockResolvedValue(null);
  mockedReadRepoMap.mockResolvedValue(null);
  mockedWriteRepoMap.mockResolvedValue(undefined);
  mockedWriteModuleEntry.mockResolvedValue(undefined);
  mockedWriteManifest.mockResolvedValue(undefined);

  mockedCreateContextLayerWatcher.mockReturnValue(mockWatcher);
  mockedGenerateRepoMap.mockReturnValue(createMockRepoMap());
  mockedDetectModules.mockReturnValue([
    { id: 'module-a', label: 'Module A', rootPath: 'src/a', pattern: 'feature-folder' },
    { id: 'module-b', label: 'Module B', rootPath: 'src/b', pattern: 'feature-folder' },
  ]);
  mockedBuildModuleStructuralSummaries.mockReturnValue([]);
  mockedBuildCrossModuleDependencies.mockReturnValue([]);
  mockedCreateSummarizationQueue.mockReturnValue(mockQueue);

  const defaultGCResult: GCResult = {
    deletedOrphans: [],
    deletedStale: [],
    deletedOverflow: [],
    reclaimedBytes: 0,
  };
  mockedRunContextLayerGC.mockResolvedValue(defaultGCResult);

  const defaultInjectionResult: InjectionResult = {
    packet: createMockContextPacket(),
    injectedModules: ['module-a'],
    injectedTokens: 500,
  };
  mockedInjectContextLayer.mockResolvedValue(defaultInjectionResult);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('contextLayerController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  afterEach(async () => {
    // Clean up singleton between tests
    const ctrl = getContextLayerController();
    if (ctrl) {
      await ctrl.dispose();
    }
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. getContextLayerController returns null before init
  // -----------------------------------------------------------------------

  it('getContextLayerController returns null before init', () => {
    expect(getContextLayerController()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. initContextLayer creates controller
  // -----------------------------------------------------------------------

  it('initContextLayer creates controller', async () => {
    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    expect(getContextLayerController()).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // 3. Disabled config skips initialization
  // -----------------------------------------------------------------------

  it('disabled config skips initialization', async () => {
    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig({ enabled: false }),
    });

    const ctrl = getContextLayerController();
    expect(ctrl).not.toBeNull();
    expect(ctrl!.getStatus().health).toBe('disabled');

    // Store should NOT be initialized
    expect(mockedInitContextLayerStore).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Initialize with fresh workspace (no manifest)
  // -----------------------------------------------------------------------

  it('initialize with fresh workspace triggers full rebuild', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // Full rebuild path: buildRepoIndex → generateRepoMap (which calls detectModules internally) → write
    expect(mockBuildRepoIndex).toHaveBeenCalledWith(['/workspace']);
    expect(mockedGenerateRepoMap).toHaveBeenCalled();
    expect(mockedWriteRepoMap).toHaveBeenCalled();
    expect(mockedWriteManifest).toHaveBeenCalled();

    const ctrl = getContextLayerController();
    expect(ctrl!.getStatus().health).toBe('healthy');
  });

  // -----------------------------------------------------------------------
  // 5. Initialize with recent manifest loads from disk
  // -----------------------------------------------------------------------

  it('initialize with recent manifest loads from disk without rebuild', async () => {
    const recentManifest = createMockManifest({ lastFullRebuild: Date.now() });
    mockedReadManifest.mockResolvedValue(recentManifest);
    mockedReadRepoMap.mockResolvedValue(createMockRepoMap());

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // Should load from disk, NOT call buildRepoIndex for a full rebuild
    expect(mockedReadRepoMap).toHaveBeenCalled();
    expect(mockBuildRepoIndex).not.toHaveBeenCalled();

    const ctrl = getContextLayerController();
    expect(ctrl!.getStatus().health).toBe('healthy');
    expect(ctrl!.getStatus().moduleCount).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 6. enrichPacket delegates to injector
  // -----------------------------------------------------------------------

  it('enrichPacket delegates to injector', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    const packet = createMockContextPacket();
    const goalKeywords = ['file', 'tree'];

    const result = await ctrl.enrichPacket(packet, goalKeywords);

    expect(mockedInjectContextLayer).toHaveBeenCalledWith({
      packet,
      workspaceRoot: '/workspace',
      goalKeywords,
    });
    expect(result.injectedModules).toEqual(['module-a']);
    expect(result.injectedTokens).toBe(500);
  });

  // -----------------------------------------------------------------------
  // 7. enrichPacket returns unenriched on error
  // -----------------------------------------------------------------------

  it('enrichPacket returns unenriched packet on error', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    mockedInjectContextLayer.mockRejectedValueOnce(new Error('injection failed'));

    const ctrl = getContextLayerController()!;
    const packet = createMockContextPacket();

    const result = await ctrl.enrichPacket(packet, ['keyword']);

    expect(result.packet).toBe(packet);
    expect(result.injectedModules).toEqual([]);
    expect(result.injectedTokens).toBe(0);
    expect(ctrl.getStatus().health).toBe('degraded');
  });

  // -----------------------------------------------------------------------
  // 8. enrichPacket returns unenriched when disabled
  // -----------------------------------------------------------------------

  it('enrichPacket returns unenriched when disabled', async () => {
    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig({ enabled: false }),
    });

    const ctrl = getContextLayerController()!;
    const packet = createMockContextPacket();

    const result = await ctrl.enrichPacket(packet, ['keyword']);

    expect(mockedInjectContextLayer).not.toHaveBeenCalled();
    expect(result.packet).toBe(packet);
    expect(result.injectedModules).toEqual([]);
    expect(result.injectedTokens).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 9. onFileChange delegates to watcher
  // -----------------------------------------------------------------------

  it('onFileChange delegates to watcher', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    ctrl.onFileChange('change', '/workspace/src/a/foo.ts');

    expect(mockWatcher.onFileChange).toHaveBeenCalledWith('change', '/workspace/src/a/foo.ts');
  });

  // -----------------------------------------------------------------------
  // 10. onGitCommit delegates to watcher
  // -----------------------------------------------------------------------

  it('onGitCommit delegates to watcher', async () => {
    mockedReadManifest.mockResolvedValue(null);
    // Mock getGitChangedFiles so it doesn't spawn a real git process
    vi.spyOn(controllerModule, 'getGitChangedFiles').mockResolvedValue([]);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    ctrl.onGitCommit();

    // onGitCommit now runs git-diff async; wait for the promise to settle
    await vi.waitFor(() => {
      expect(mockWatcher.onGitCommit).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 11. onSessionStart delegates to watcher
  // -----------------------------------------------------------------------

  it('onSessionStart delegates to watcher', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    ctrl.onSessionStart();

    expect(mockWatcher.onSessionStart).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 12. forceRebuild triggers full rebuild
  // -----------------------------------------------------------------------

  it('forceRebuild triggers full rebuild', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // Clear call counts from initial rebuild
    mockBuildRepoIndex.mockClear();
    mockedGenerateRepoMap.mockClear();
    mockedWriteRepoMap.mockClear();

    const ctrl = getContextLayerController()!;
    await ctrl.forceRebuild();

    expect(mockBuildRepoIndex).toHaveBeenCalledWith(['/workspace']);
    expect(mockedGenerateRepoMap).toHaveBeenCalled();
    expect(mockedWriteRepoMap).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 13. dispose cleans up everything
  // -----------------------------------------------------------------------

  it('dispose cleans up everything', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    expect(getContextLayerController()).not.toBeNull();

    const ctrl = getContextLayerController()!;
    await ctrl.dispose();

    expect(getContextLayerController()).toBeNull();
    expect(mockWatcher.dispose).toHaveBeenCalled();
    expect(ctrl.getStatus().health).toBe('disabled');
  });

  // -----------------------------------------------------------------------
  // 14. dispose is safe to call twice
  // -----------------------------------------------------------------------

  it('dispose is safe to call twice', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    await ctrl.dispose();
    // Second dispose should not throw
    await ctrl.dispose();

    expect(mockWatcher.dispose).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 15. GC timer fires periodically
  // -----------------------------------------------------------------------

  it('GC timer fires periodically', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // GC runs once during rebuild
    const initialGCCalls = mockedRunContextLayerGC.mock.calls.length;

    // Advance 1 hour
    vi.advanceTimersByTime(60 * 60 * 1000);

    // GC should have been called again by the timer
    expect(mockedRunContextLayerGC.mock.calls.length).toBeGreaterThan(initialGCCalls);
  });

  // -----------------------------------------------------------------------
  // 16. switchWorkspace disposes old and reinitializes
  // -----------------------------------------------------------------------

  it('switchWorkspace disposes old and reinitializes', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const firstWatcher = mockWatcher;

    // Create a new watcher for the second workspace
    const secondWatcher = createMockWatcher();
    mockedCreateContextLayerWatcher.mockReturnValue(secondWatcher);

    const ctrl = getContextLayerController()!;
    await ctrl.switchWorkspace('/new-workspace');

    // Old watcher should be disposed
    expect(firstWatcher.dispose).toHaveBeenCalled();

    // New workspace should be initialized
    expect(ctrl.getStatus().workspaceRoot).toBe('/new-workspace');

    // New watcher should be created
    expect(mockedCreateContextLayerWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRoot: '/new-workspace' }),
    );
  });

  // -----------------------------------------------------------------------
  // Additional edge case tests
  // -----------------------------------------------------------------------

  it('getStatus returns accurate counts', async () => {
    const repoMap = createMockRepoMap();
    // Add an AI summary to one module
    repoMap.modules[0].ai = {
      description: 'Test module',
      keyResponsibilities: ['testing'],
      gotchas: [],
      generatedAt: Date.now(),
      generatedFrom: 'hash-a',
      tokenCount: 100,
    };

    mockedReadManifest.mockResolvedValue(null);
    mockedGenerateRepoMap.mockReturnValue(repoMap);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    const status = ctrl.getStatus();

    expect(status.enabled).toBe(true);
    expect(status.workspaceRoot).toBe('/workspace');
    expect(status.moduleCount).toBe(2);
    expect(status.summaryCount).toBe(1);
    expect(status.health).toBe('healthy');
    expect(status.repoMapAge).not.toBeNull();
  });

  it('stale manifest triggers full rebuild', async () => {
    const staleManifest = createMockManifest({
      lastFullRebuild: Date.now() - 120_000, // 2 minutes ago
    });
    mockedReadManifest.mockResolvedValue(staleManifest);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // Should have triggered a full rebuild despite manifest existing
    expect(mockBuildRepoIndex).toHaveBeenCalled();
    expect(mockedGenerateRepoMap).toHaveBeenCalled();
  });

  it('recent manifest with missing repo map triggers rebuild', async () => {
    const recentManifest = createMockManifest({ lastFullRebuild: Date.now() });
    mockedReadManifest.mockResolvedValue(recentManifest);
    mockedReadRepoMap.mockResolvedValue(null); // repo map missing

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // Should have triggered a full rebuild because repo map was missing
    expect(mockBuildRepoIndex).toHaveBeenCalled();
    expect(mockedGenerateRepoMap).toHaveBeenCalled();
  });

  it('autoSummarize creates queue and enqueues modules on rebuild', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig({ autoSummarize: true }),
    });

    expect(mockedCreateSummarizationQueue).toHaveBeenCalled();
    expect(mockQueue.enqueue).toHaveBeenCalledWith(['module-a', 'module-b']);
  });

  it('event delegation methods are safe when watcher is null', async () => {
    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig({ enabled: false }),
    });

    const ctrl = getContextLayerController()!;

    // These should not throw even though watcher is null (disabled config)
    ctrl.onFileChange('change', '/workspace/src/a/foo.ts');
    ctrl.onGitCommit();
    ctrl.onSessionStart();
  });

  it('GC timer is cleared on dispose', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const ctrl = getContextLayerController()!;
    const gcCallsBeforeDispose = mockedRunContextLayerGC.mock.calls.length;

    await ctrl.dispose();

    // Advance time well past the GC interval
    vi.advanceTimersByTime(3 * 60 * 60 * 1000);

    // No additional GC calls should have happened after dispose
    expect(mockedRunContextLayerGC.mock.calls.length).toBe(gcCallsBeforeDispose);
  });

  it('reinitializing disposes previous controller', async () => {
    mockedReadManifest.mockResolvedValue(null);

    await initContextLayer({
      workspaceRoot: '/workspace',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    const firstWatcher = mockWatcher;

    // Setup new mocks for second init
    const secondWatcher = createMockWatcher();
    mockedCreateContextLayerWatcher.mockReturnValue(secondWatcher);

    await initContextLayer({
      workspaceRoot: '/workspace-2',
      buildRepoIndex: mockBuildRepoIndex,
      config: createMockConfig(),
    });

    // First controller's watcher should have been disposed
    expect(firstWatcher.dispose).toHaveBeenCalled();
    // New controller should exist
    expect(getContextLayerController()).not.toBeNull();
  });
});
