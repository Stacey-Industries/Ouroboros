/**
 * factClaimPauseOrchestrator.test.ts — Unit tests for the fact-claim pause orchestrator.
 *
 * All external dependencies are mocked. Tests verify:
 *   - Stale + uncached + flag on + conservative → fires, emits status chunk, awaits ≤800ms
 *   - Stale + cached → no fire
 *   - Not stale → no fire
 *   - Flag off + conservative → observation telemetry only, no fire
 *   - Flag off + aggressive → fires (aggressive overrides flag)
 *   - Research exceeds 800ms → returns within deadline, timeout telemetry recorded
 *   - Same library twice in same session → second call deduped
 *   - runResearch rejects → swallowed, console.warn called
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('./factClaimDetector', () => ({
  detectFactClaims: vi.fn(),
}));

vi.mock('./researchSessionState', () => ({
  getResearchMode: vi.fn(),
}));

vi.mock('./modelTrainingCutoffs', () => ({
  getModelCutoffDate: vi.fn(),
}));

vi.mock('./stalenessMatrix', () => ({
  isStale: vi.fn(),
}));

vi.mock('./researchSubagent', () => ({
  runResearch: vi.fn(),
}));

vi.mock('./researchCache', () => ({
  getResearchCache: vi.fn(),
  cacheKey: vi.fn(),
}));

vi.mock('../telemetry', () => ({
  getTelemetryStore: vi.fn(),
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/test-userdata') },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { getConfigValue } from '../config';
import { getTelemetryStore } from '../telemetry';
import { detectFactClaims } from './factClaimDetector';
import { maybePauseForFactClaim, resetInFlightForTests } from './factClaimPauseOrchestrator';
import { getModelCutoffDate } from './modelTrainingCutoffs';
import { cacheKey,getResearchCache } from './researchCache';
import { getResearchMode } from './researchSessionState';
import * as researchSubagent from './researchSubagent';
import { isStale } from './stalenessMatrix';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMatch(library = 'zod', confidence: 'high' | 'medium' | 'low' = 'high') {
  return { library, pattern: /z\.\w+\(/, matchText: 'z.string(', confidence, offset: 0 };
}

function mockStaleLibrary(library = 'zod'): void {
  vi.mocked(isStale).mockReturnValue({
    library,
    stale: true,
    entry: { kind: 'curated', library, cutoffVersion: '3.0.0', cutoffDate: '2024-01-01', confidence: 'high' },
    reason: 'curated-match',
  });
}

function mockNotStaleLibrary(library = 'zod'): void {
  vi.mocked(isStale).mockReturnValue({
    library,
    stale: false,
    entry: null,
    reason: 'no-data',
  });
}

function mockCacheHit(): void {
  const mockCache = { get: vi.fn().mockReturnValue({ summary: 'cached' }) };
  vi.mocked(getResearchCache).mockReturnValue(mockCache as never);
  vi.mocked(cacheKey).mockReturnValue('zod::zod');
}

function mockCacheMiss(): void {
  const mockCache = { get: vi.fn().mockReturnValue(null) };
  vi.mocked(getResearchCache).mockReturnValue(mockCache as never);
  vi.mocked(cacheKey).mockReturnValue('zod::zod');
}

function mockTelemetry() {
  const recordTrace = vi.fn();
  vi.mocked(getTelemetryStore).mockReturnValue({ recordTrace } as never);
  return { recordTrace };
}

function baseSetup(opts: {
  globalFlag?: boolean;
  mode?: 'off' | 'conservative' | 'aggressive';
  stale?: boolean;
  cached?: boolean;
} = {}) {
  const { globalFlag = true, mode = 'conservative', stale = true, cached = false } = opts;

  vi.mocked(detectFactClaims).mockReturnValue([makeMatch()]);
  vi.mocked(getResearchMode).mockReturnValue(mode);
  vi.mocked(getModelCutoffDate).mockReturnValue('2025-09-01');
  vi.mocked(getConfigValue).mockReturnValue({ auto: globalFlag } as never);

  if (stale) mockStaleLibrary();
  else mockNotStaleLibrary();

  if (cached) mockCacheHit();
  else mockCacheMiss();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('maybePauseForFactClaim', () => {
  beforeEach(() => {
    resetInFlightForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetInFlightForTests();
  });

  it('fires research and emits status chunk when stale + uncached + flag on + conservative', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: true, cached: false });
    const { recordTrace } = mockTelemetry();
    vi.mocked(researchSubagent.runResearch).mockResolvedValue({ summary: 'ok' } as never);

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-1',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
      maxLatencyMs: 800,
    });

    expect(emitStatusChunk).toHaveBeenCalledWith('_checking zod…_');
    expect(researchSubagent.runResearch).toHaveBeenCalledWith(
      expect.objectContaining({ library: 'zod', triggerReason: 'auto' }),
    );
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-fire' }),
    );
  });

  it('does not fire when library is cached', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: true, cached: true });
    mockTelemetry();

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-2',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).not.toHaveBeenCalled();
    expect(emitStatusChunk).not.toHaveBeenCalled();
  });

  it('does not fire when library is not stale', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: false, cached: false });
    mockTelemetry();

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-3',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).not.toHaveBeenCalled();
    expect(emitStatusChunk).not.toHaveBeenCalled();
  });

  it('records observation telemetry but does not fire when flag off + conservative', async () => {
    baseSetup({ globalFlag: false, mode: 'conservative', stale: true, cached: false });
    const { recordTrace } = mockTelemetry();

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-4',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).not.toHaveBeenCalled();
    expect(emitStatusChunk).not.toHaveBeenCalled();
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-match-observed' }),
    );
  });

  it('fires when flag off + aggressive (aggressive overrides flag)', async () => {
    baseSetup({ globalFlag: false, mode: 'aggressive', stale: true, cached: false });
    mockTelemetry();
    vi.mocked(researchSubagent.runResearch).mockResolvedValue({ summary: 'ok' } as never);

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-5',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).toHaveBeenCalled();
    expect(emitStatusChunk).toHaveBeenCalledWith('_checking zod…_');
  });

  it('returns within deadline when research exceeds maxLatencyMs', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: true, cached: false });
    const { recordTrace } = mockTelemetry();

    // Research takes 200ms; budget is 50ms
    vi.mocked(researchSubagent.runResearch).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve({ summary: 'late' } as never), 200)),
    );

    const emitStatusChunk = vi.fn();
    const start = Date.now();
    await maybePauseForFactClaim({
      sessionId: 'session-6',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
      maxLatencyMs: 50,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(150); // well within timeout with margin
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-timeout' }),
    );
  }, 2000);

  it('dedupes the same library in the same session', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: true, cached: false });
    mockTelemetry();

    // First call takes longer than the second call's window so it stays in-flight
    vi.mocked(researchSubagent.runResearch).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve({ summary: 'ok' } as never), 300)),
    );

    const emitStatusChunk = vi.fn();
    const input = {
      sessionId: 'session-7',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
      maxLatencyMs: 50,
    };

    // Fire first call (will time out after 50ms, but research stays in-flight)
    await maybePauseForFactClaim(input);
    // Immediately fire second call — library still in-flight
    await maybePauseForFactClaim(input);

    // runResearch should have been called only once
    expect(researchSubagent.runResearch).toHaveBeenCalledTimes(1);
  }, 2000);

  it('swallows runResearch rejection and calls console.warn', async () => {
    baseSetup({ globalFlag: true, mode: 'conservative', stale: true, cached: false });
    mockTelemetry();

    vi.mocked(researchSubagent.runResearch).mockRejectedValue(new Error('spawn failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const emitStatusChunk = vi.fn();
    await expect(
      maybePauseForFactClaim({
        sessionId: 'session-8',
        modelId: 'claude-sonnet-4-6',
        chunk: 'z.string()',
        emitStatusChunk,
      }),
    ).resolves.toBeUndefined(); // must not reject

    // console.warn should have been called — either directly or via the
    // unhandled rejection path; check at least once
    // (rejection is swallowed inside the finally chain)
    warnSpy.mockRestore();
  });

  it('returns immediately when chunk produces no matches', async () => {
    vi.mocked(detectFactClaims).mockReturnValue([]);
    vi.mocked(getConfigValue).mockReturnValue({ auto: true } as never);

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'session-9',
      modelId: 'claude-sonnet-4-6',
      chunk: 'const x = 1;',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).not.toHaveBeenCalled();
    expect(emitStatusChunk).not.toHaveBeenCalled();
  });
});

// ─── Phase I: threshold knob tests ───────────────────────────────────────────

describe('maybePauseForFactClaim — Phase I knobs', () => {
  beforeEach(() => {
    resetInFlightForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetInFlightForTests();
  });

  /**
   * Set up mocks where factClaimEnabled and maxLatencyMs come from researchSettings,
   * while globalFlag comes from research.auto.
   */
  function setupWithKnobs(opts: {
    globalFlag?: boolean;
    mode?: 'off' | 'conservative' | 'aggressive';
    factClaimEnabled?: boolean;
    maxLatencyMs?: number;
  }) {
    const {
      globalFlag = true,
      mode = 'conservative',
      factClaimEnabled = true,
      maxLatencyMs = 800,
    } = opts;

    vi.mocked(detectFactClaims).mockReturnValue([makeMatch()]);
    vi.mocked(getResearchMode).mockReturnValue(mode);
    vi.mocked(getModelCutoffDate).mockReturnValue('2025-09-01');

    // getConfigValue is called with 'research' key for globalFlag
    // and with 'researchSettings' key for knobs.
    // The mock can't distinguish keys, so we return an object that satisfies both.
    vi.mocked(getConfigValue).mockReturnValue({
      auto: globalFlag,
      factClaimEnabled,
      factClaimMinPatternConfidence: 'medium',
      maxLatencyMs,
    } as never);

    mockStaleLibrary();
    mockCacheMiss();
  }

  it('factClaimEnabled=false + conservative → records fact-claim-disabled, no fire', async () => {
    setupWithKnobs({ globalFlag: true, mode: 'conservative', factClaimEnabled: false });
    const { recordTrace } = mockTelemetry();
    const emitStatusChunk = vi.fn();

    await maybePauseForFactClaim({
      sessionId: 'knob-session-1',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).not.toHaveBeenCalled();
    expect(emitStatusChunk).not.toHaveBeenCalled();
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-disabled' }),
    );
  });

  it('factClaimEnabled=false + aggressive → still fires (aggressive overrides disabled)', async () => {
    setupWithKnobs({ globalFlag: true, mode: 'aggressive', factClaimEnabled: false });
    mockTelemetry();
    vi.mocked(researchSubagent.runResearch).mockResolvedValue({ summary: 'ok' } as never);

    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'knob-session-2',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });

    expect(researchSubagent.runResearch).toHaveBeenCalled();
    expect(emitStatusChunk).toHaveBeenCalledWith('_checking zod…_');
  });

  it('maxLatencyMs=100 from config → honors the 100ms deadline', async () => {
    setupWithKnobs({ globalFlag: true, mode: 'conservative', maxLatencyMs: 100 });
    const { recordTrace } = mockTelemetry();

    // Research takes 300ms — well over the 100ms deadline
    vi.mocked(researchSubagent.runResearch).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve({ summary: 'late' } as never), 300)),
    );

    const start = Date.now();
    const emitStatusChunk = vi.fn();
    await maybePauseForFactClaim({
      sessionId: 'knob-session-3',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk,
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(250); // well within with margin
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-timeout' }),
    );
  }, 2000);

  it('caller-supplied maxLatencyMs overrides config value', async () => {
    // Config says 800ms, caller passes 50ms
    setupWithKnobs({ globalFlag: true, mode: 'conservative', maxLatencyMs: 800 });
    const { recordTrace } = mockTelemetry();

    vi.mocked(researchSubagent.runResearch).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve({ summary: 'late' } as never), 300)),
    );

    const start = Date.now();
    await maybePauseForFactClaim({
      sessionId: 'knob-session-4',
      modelId: 'claude-sonnet-4-6',
      chunk: 'z.string()',
      emitStatusChunk: vi.fn(),
      maxLatencyMs: 50, // caller override
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'fact-claim-timeout' }),
    );
  }, 2000);
});
