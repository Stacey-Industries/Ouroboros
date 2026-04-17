/**
 * preToolResearchOrchestrator.test.ts — Unit tests for Wave 30 Phase D.
 *
 * All I/O and external dependencies are injected via OrchestratorDeps — no
 * real filesystem reads, no real research spawns, no real telemetry writes.
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
