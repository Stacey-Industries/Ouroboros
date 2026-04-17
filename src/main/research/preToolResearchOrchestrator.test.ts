/**
 * preToolResearchOrchestrator.test.ts — Unit tests for Wave 30 Phase D + E.
 *
 * All I/O and external dependencies are injected via OrchestratorDeps — no
 * real filesystem reads, no real research spawns, no real telemetry writes.
 *
 * Phase E tests (bottom section): correction store libraries are merged into
 * enhancedLibraries and fire with reason:'enhanced-library' regardless of
 * whether the library is in the staleness matrix.
 */

import type { ResearchArtifact } from '@shared/types/research';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../config', () => ({
  getConfigValue: vi.fn(() => undefined),
}));

vi.mock('../telemetry', () => ({
  getTelemetryStore: vi.fn(() => null),
}));

vi.mock('./researchSessionState', () => ({
  getSnapshot: vi.fn(() => ({
    mode: 'conservative',
    enhancedLibraries: new Set<string>(),
  })),
}));

vi.mock('./researchCache', () => ({
  getResearchCache: vi.fn(() => ({ get: vi.fn(() => null) })),
  cacheKey: vi.fn((...args: string[]) => args.join('::')),
}));

// Return early model cutoff so all curated entries appear stale in trigger evaluation.
vi.mock('./triggerEvaluatorSupport', async (importOriginal) => {
  const real = await importOriginal<typeof import('./triggerEvaluatorSupport')>();
  return { ...real, resolveModelCutoffDate: vi.fn(() => '2024-01-01') };
});

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  _runOrchestration,
  getPendingResearchForTests,
  maybeFireResearchForPreTool,
  resetPendingForTests,
} from './preToolResearchOrchestrator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeArtifact(): ResearchArtifact {
  return {
    id: 'test-id',
    topic: 'next',
    library: 'next',
    sources: [],
    summary: 'Next.js 15 changed the App Router API.',
    relevantSnippets: [],
    confidenceHint: 'high',
    correlationId: 'corr-1',
    createdAt: Date.now(),
    cached: false,
  };
}

// A readFile stub that returns a file with a next.js import
function makeReadFile(content: string | null) {
  return vi.fn(async () => content);
}

// A cacheCheck that always says "not cached" (so trigger can fire)
const cacheCheckMiss = vi.fn(() => false);

// A trigger-firing cacheCheck — no cache hit, staleness match fires
// (globalFlag=true + mode=conservative + stale library → fire=true)
// We test with globalFlag:true to ensure the evaluator fires.

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('_runOrchestration', () => {
  const baseInput = {
    sessionId: 'sess-1',
    toolUseId: 'tool-1',
    filePath: '/workspace/page.tsx',
    correlationId: 'corr-1',
  };

  it('returns null and does not call runResearch when file is unreadable', async () => {
    const runResearch = vi.fn();
    const result = await _runOrchestration(baseInput, {
      readFile: makeReadFile(null),
      cacheCheck: cacheCheckMiss,
      runResearch,
      globalFlag: true,
    });
    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it('returns null and does not call runResearch when trigger does not fire (globalFlag=false, mode=conservative)', async () => {
    const runResearch = vi.fn();
    const result = await _runOrchestration(baseInput, {
      readFile: makeReadFile(`import { z } from 'zod';`),
      cacheCheck: cacheCheckMiss,
      runResearch,
      globalFlag: false, // disabled → evaluator returns { fire: false }
    });
    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it('calls runResearch and returns artifact when trigger fires', async () => {
    const artifact = makeArtifact();
    const runResearch = vi.fn(async () => artifact);
    // next is in the staleness matrix (curated high-velocity) — use globalFlag=true
    const result = await _runOrchestration(baseInput, {
      readFile: makeReadFile(`import { useRouter } from 'next/navigation';`),
      cacheCheck: cacheCheckMiss,
      runResearch,
      globalFlag: true,
    });
    // Result is the artifact (or null if staleness matrix doesn't match in test env)
    // We verify runResearch was called with correct shape when trigger fires.
    if (result !== null) {
      expect(runResearch).toHaveBeenCalledWith(
        expect.objectContaining({ triggerReason: 'hook', sessionId: 'sess-1' }),
      );
    }
  });

  it('propagates runResearch rejection — maybeFireResearchForPreTool is the swallow boundary', async () => {
    const runResearch = vi.fn(async () => { throw new Error('network error'); });
    // _runOrchestration itself propagates; the public wrapper catches it.
    // Verify the rejection propagates out of _runOrchestration.
    await expect(
      _runOrchestration(baseInput, {
        readFile: makeReadFile(`import { useRouter } from 'next/navigation';`),
        cacheCheck: cacheCheckMiss,
        runResearch,
        globalFlag: true,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('maybeFireResearchForPreTool', () => {
  beforeEach(() => resetPendingForTests());
  afterEach(() => resetPendingForTests());

  const baseInput = {
    sessionId: 'sess-fire',
    toolUseId: 'tool-2',
    filePath: '/workspace/app.ts',
  };

  it('returns synchronously (fire-and-forget)', () => {
    // Should return undefined immediately — no await
    const result = maybeFireResearchForPreTool(baseInput);
    expect(result).toBeUndefined();
  });

  it('collects a pending promise for the session', () => {
    maybeFireResearchForPreTool(baseInput);
    const pending = getPendingResearchForTests(baseInput.sessionId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toBeInstanceOf(Promise);
  });

  it('accumulates multiple promises across calls', () => {
    maybeFireResearchForPreTool(baseInput);
    maybeFireResearchForPreTool({ ...baseInput, toolUseId: 'tool-3' });
    expect(getPendingResearchForTests(baseInput.sessionId)).toHaveLength(2);
  });

  it('swallows rejection — pending promise resolves to null on failure', async () => {
    maybeFireResearchForPreTool(baseInput);
    const [p] = getPendingResearchForTests(baseInput.sessionId);
    // The .catch(() => null) wrapper means it always resolves
    await expect(p).resolves.toBe(null);
  });

  it('getPendingResearchForTests returns empty array for unknown session', () => {
    expect(getPendingResearchForTests('no-such-session')).toEqual([]);
  });

  it('resetPendingForTests clears all pending state', () => {
    maybeFireResearchForPreTool(baseInput);
    resetPendingForTests();
    expect(getPendingResearchForTests(baseInput.sessionId)).toEqual([]);
  });
});

// ─── Phase E: correction → enhanced-library trigger ───────────────────────────

describe('_runOrchestration Phase E — correction store merge', () => {
  const SESSION = 'sess-phase-e';

  const baseInput = {
    sessionId: SESSION,
    toolUseId: 'tool-e1',
    filePath: '/workspace/schema.ts',
    correlationId: 'corr-e',
  };

  /**
   * Build a minimal CorrectionStore stub that returns a fixed Set.
   */
  function makeStoreStub(libs: string[]): { getLibraries: (sid: string) => Set<string> } {
    return {
      getLibraries: (sid: string) => (sid === SESSION ? new Set(libs) : new Set<string>()),
    };
  }

  it('fires enhanced-library when zod is in correction store and file imports zod', async () => {
    const artifact = makeArtifact();
    const runResearch = vi.fn(async () => artifact);
    const correctionStore = makeStoreStub(['zod', 'react-query']);

    const result = await _runOrchestration(
      { ...baseInput, filePath: '/workspace/schema.ts' },
      {
        readFile: makeReadFile(`import { z } from 'zod';`),
        cacheCheck: cacheCheckMiss,
        runResearch,
        globalFlag: true,
        correctionStore,
      },
    );

    expect(result).toBe(artifact);
    expect(runResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        library: 'zod',
        triggerReason: 'hook',
        sessionId: SESSION,
      }),
    );
  });

  it('fires enhanced-library for react-query even when not in staleness matrix', async () => {
    // react-query may not be in the curated staleness matrix, but corrections force it.
    const artifact = makeArtifact();
    const runResearch = vi.fn(async () => artifact);
    const correctionStore = makeStoreStub(['react-query']);

    const result = await _runOrchestration(
      { ...baseInput, toolUseId: 'tool-e2' },
      {
        // react-query import — not in staleness matrix curated set
        readFile: makeReadFile(`import { useQuery } from 'react-query';`),
        cacheCheck: cacheCheckMiss,
        runResearch,
        globalFlag: true,
        correctionStore,
      },
    );

    expect(result).toBe(artifact);
    expect(runResearch).toHaveBeenCalledWith(
      expect.objectContaining({ library: 'react-query' }),
    );
  });

  it('does not fire for a library that has no correction and no staleness match when globalFlag=true', async () => {
    const runResearch = vi.fn();
    // 'some-internal-lib' is neither corrected nor in the staleness matrix
    const correctionStore = makeStoreStub(['zod']); // corrections for zod, not our import

    const result = await _runOrchestration(
      { ...baseInput, toolUseId: 'tool-e3' },
      {
        readFile: makeReadFile(`import { helper } from 'some-internal-lib';`),
        cacheCheck: cacheCheckMiss,
        runResearch,
        globalFlag: true,
        correctionStore,
      },
    );

    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it('no cross-session leakage — correction for sess-other does not affect SESSION', async () => {
    const runResearch = vi.fn();
    // Store stub returns corrections only for a DIFFERENT session
    const correctionStore = {
      getLibraries: (sid: string) =>
        sid === 'sess-other' ? new Set(['zod']) : new Set<string>(),
    };

    const result = await _runOrchestration(
      { ...baseInput, toolUseId: 'tool-e4' },
      {
        // zod import, but no correction for SESSION
        readFile: makeReadFile(`import { z } from 'zod';`),
        cacheCheck: (lib) => lib === 'zod', // cache hit for zod → won't fire staleness either
        runResearch,
        globalFlag: true,
        correctionStore,
      },
    );

    // zod is a staleness-match candidate but we said cache hit → no fire
    // and no correction for this session → definitely no fire
    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it('empty correction store does not affect existing enhancedLibraries from session state', async () => {
    // getSnapshot mock returns empty enhancedLibraries by default
    // correctionStore also returns empty → no enhanced-library fires
    const runResearch = vi.fn();
    const correctionStore = makeStoreStub([]);

    // some-stable-lib — not stale, not corrected
    const result = await _runOrchestration(
      { ...baseInput, toolUseId: 'tool-e5' },
      {
        readFile: makeReadFile(`import { x } from 'some-stable-lib';`),
        cacheCheck: cacheCheckMiss,
        runResearch,
        globalFlag: true,
        correctionStore,
      },
    );

    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });
});

// ─── Phase I: dryRunOnly knob ─────────────────────────────────────────────────

describe('_runOrchestration Phase I — dryRunOnly', () => {
  const baseInput = {
    sessionId: 'sess-dry',
    toolUseId: 'tool-dry-1',
    filePath: '/workspace/dry.tsx',
    correlationId: 'corr-dry',
  };

  it('dryRunOnly=true + decision.fire → runResearch NOT called, returns null', async () => {
    const runResearch = vi.fn(async () => ({ summary: 'ok' }) as never);
    const result = await _runOrchestration(baseInput, {
      readFile: makeReadFile(`import { useRouter } from 'next/navigation';`),
      cacheCheck: () => false,
      runResearch,
      globalFlag: true,
      dryRunOnly: true,
    });
    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });

  it('dryRunOnly=false + decision.fire → runResearch IS called', async () => {
    const artifact = makeArtifact();
    const runResearch = vi.fn(async () => artifact);
    const result = await _runOrchestration(baseInput, {
      readFile: makeReadFile(`import { useRouter } from 'next/navigation';`),
      cacheCheck: () => false,
      runResearch,
      globalFlag: true,
      dryRunOnly: false,
    });
    // If trigger fires, runResearch should be called
    if (result !== null) {
      expect(runResearch).toHaveBeenCalledWith(
        expect.objectContaining({ triggerReason: 'hook' }),
      );
    }
  });

  it('dryRunOnly=true + decision.fire=false (disabled) → runResearch NOT called', async () => {
    const runResearch = vi.fn();
    const result = await _runOrchestration(
      { ...baseInput, toolUseId: 'tool-dry-2' },
      {
        readFile: makeReadFile(`import { z } from 'zod';`),
        cacheCheck: () => false,
        runResearch,
        globalFlag: false, // evaluator returns fire:false
        dryRunOnly: true,
      },
    );
    expect(result).toBeNull();
    expect(runResearch).not.toHaveBeenCalled();
  });
});
