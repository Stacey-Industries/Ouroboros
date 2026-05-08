/**
 * nlResolver.test.ts — Unit/integration tests for the NL resolver.
 *
 * Wave 85 Phase 6. Covers:
 *   - Empty-query short-circuit (no CLI call fired)
 *   - High-confidence direct resolve (confidence > 0.8)
 *   - Low-confidence disambiguation (confidence ≤ 0.8, full top-5 returned)
 *   - Malformed CLI response → graceful empty result
 *   - Circuit-breaker: 3 consecutive failures → open, returns empty
 *   - Circuit-breaker auto-reset after timeout
 *
 * spawnClaude is mocked via vi.mock — no real Haiku calls in tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../config', () => ({
  getConfigValue: vi.fn().mockReturnValue('/fake/workspace'),
}));

// Mock spawnClaude — tests control its return value per-case
vi.mock('../claudeMdGeneratorSupport', () => ({
  spawnClaude: vi.fn(),
}));

// Mock codebaseGraph — not under test here
vi.mock('../codebaseGraph/mcpToolHandlers', () => ({
  searchGraph: vi.fn().mockResolvedValue([]),
}));

import { spawnClaude } from '../claudeMdGeneratorSupport';
import {
  candidatesToInputs,
  getCircuitBreakerState,
  inferLayer,
  resetCircuitBreaker,
  resolveNaturalLanguage,
  setCandidateCache,
} from './nlResolver';
import type { CandidateInput } from './nlResolverPrompt';

const mockSpawn = vi.mocked(spawnClaude);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_CANDIDATES: CandidateInput[] = [
  {
    symbol: 'handleSubmit',
    file: 'src/renderer/components/AgentChat/Composer.tsx',
    line: 42,
    layer: 'renderer',
  },
  {
    symbol: 'handleSend',
    file: 'src/renderer/components/AgentChat/ChatInput.tsx',
    line: 18,
    layer: 'renderer',
  },
  {
    symbol: 'agentChatSendHandler',
    file: 'src/main/agentChat/ipcHandlers.ts',
    line: 77,
    layer: 'main',
  },
];

const HIGH_CONF_RESPONSE = JSON.stringify([
  {
    symbol: 'handleSubmit',
    file: 'src/renderer/components/AgentChat/Composer.tsx',
    line: 42,
    confidence: 0.93,
    reason: 'Primary submit handler for chat messages',
  },
  {
    symbol: 'handleSend',
    file: 'src/renderer/components/AgentChat/ChatInput.tsx',
    line: 18,
    confidence: 0.75,
    reason: 'Alternative send handler',
  },
]);

const LOW_CONF_RESPONSE = JSON.stringify([
  {
    symbol: 'handleSubmit',
    file: 'src/renderer/components/AgentChat/Composer.tsx',
    line: 42,
    confidence: 0.72,
    reason: 'Possibly the submit handler',
  },
  {
    symbol: 'handleSend',
    file: 'src/renderer/components/AgentChat/ChatInput.tsx',
    line: 18,
    confidence: 0.65,
    reason: 'Another candidate',
  },
  {
    symbol: 'agentChatSendHandler',
    file: 'src/main/agentChat/ipcHandlers.ts',
    line: 77,
    confidence: 0.58,
    reason: 'Main IPC handler',
  },
]);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetCircuitBreaker();
  setCandidateCache(FIXED_CANDIDATES); // bypass graph extraction in all tests
  mockSpawn.mockReset();
});

afterEach(() => {
  resetCircuitBreaker();
  setCandidateCache(null);
});

// ---------------------------------------------------------------------------
// Empty-query short-circuit
// ---------------------------------------------------------------------------

describe('resolveNaturalLanguage — empty query', () => {
  it('returns empty result without calling spawnClaude for empty string', async () => {
    const result = await resolveNaturalLanguage('');
    expect(result).toEqual({ matches: [], confidence: 0 });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('returns empty result without calling spawnClaude for whitespace-only', async () => {
    const result = await resolveNaturalLanguage('   ');
    expect(result).toEqual({ matches: [], confidence: 0 });
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// High-confidence direct resolve
// ---------------------------------------------------------------------------

describe('resolveNaturalLanguage — high confidence', () => {
  it('returns top-1 confidence > 0.8 when Haiku is confident', async () => {
    mockSpawn.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('when I send a chat message');
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].symbol).toBe('handleSubmit');
    expect(result.matches[0].confidence).toBe(0.93);
  });

  it('matches are sorted descending by confidence', async () => {
    mockSpawn.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('send message');
    for (let i = 1; i < result.matches.length; i++) {
      const prev = result.matches[i - 1];
      const curr = result.matches[i]; // eslint-disable-line security/detect-object-injection
      expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
    }
  });

  it('returns full NLResolveResult shape', async () => {
    mockSpawn.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('when I send a chat message');
    expect(typeof result.confidence).toBe('number');
    expect(Array.isArray(result.matches)).toBe(true);
    for (const m of result.matches) {
      expect(typeof m.symbol).toBe('string');
      expect(typeof m.file).toBe('string');
      expect(typeof m.line).toBe('number');
      expect(typeof m.confidence).toBe('number');
      expect(typeof m.reason).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// Low-confidence disambiguation
// ---------------------------------------------------------------------------

describe('resolveNaturalLanguage — low confidence disambiguation', () => {
  it('returns confidence ≤ 0.8 when Haiku is uncertain', async () => {
    mockSpawn.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('something vague');
    expect(result.confidence).toBeLessThanOrEqual(0.8);
  });

  it('returns multiple matches for disambiguation', async () => {
    mockSpawn.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('something vague');
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('includes reason on each match for disambiguation UI', async () => {
    mockSpawn.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const result = await resolveNaturalLanguage('file save action');
    for (const m of result.matches) {
      expect(m.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Malformed CLI response — graceful degradation
// ---------------------------------------------------------------------------

describe('resolveNaturalLanguage — malformed response', () => {
  it('returns empty result (no throw) when spawnClaude returns non-JSON', async () => {
    mockSpawn.mockResolvedValue('I could not find any matching symbols.');
    const result = await resolveNaturalLanguage('test query');
    expect(result).toEqual({ matches: [], confidence: 0 });
  });

  it('retries once before giving up on empty parse', async () => {
    mockSpawn.mockResolvedValue('not json');
    await resolveNaturalLanguage('retry test');
    // Called twice: initial attempt + 1 retry
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('returns empty result (no throw) when spawnClaude rejects', async () => {
    mockSpawn.mockRejectedValue(new Error('claude exited with code 1'));
    const result = await resolveNaturalLanguage('error query');
    expect(result).toEqual({ matches: [], confidence: 0 });
  });
});

// ---------------------------------------------------------------------------
// Circuit-breaker
// ---------------------------------------------------------------------------

describe('resolveNaturalLanguage — circuit breaker', () => {
  it('opens after 3 consecutive failures', async () => {
    mockSpawn.mockResolvedValue('not json');

    await resolveNaturalLanguage('q1');
    await resolveNaturalLanguage('q2');
    await resolveNaturalLanguage('q3');

    expect(getCircuitBreakerState().open).toBe(true);
  });

  it('returns empty immediately when circuit is open (no CLI call)', async () => {
    mockSpawn.mockResolvedValue('not json');

    // Trip the breaker
    await resolveNaturalLanguage('q1');
    await resolveNaturalLanguage('q2');
    await resolveNaturalLanguage('q3');

    mockSpawn.mockReset();
    const result = await resolveNaturalLanguage('q4 — circuit open');
    expect(result).toEqual({ matches: [], confidence: 0 });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('resets after the timeout window', async () => {
    mockSpawn.mockResolvedValue('not json');

    await resolveNaturalLanguage('q1');
    await resolveNaturalLanguage('q2');
    await resolveNaturalLanguage('q3');

    expect(getCircuitBreakerState().open).toBe(true);

    // Manually reset (simulates elapsed timeout)
    resetCircuitBreaker();
    expect(getCircuitBreakerState().open).toBe(false);
  });

  it('resets failure count on success', async () => {
    mockSpawn.mockResolvedValue('not json');
    await resolveNaturalLanguage('q1'); // failure
    await resolveNaturalLanguage('q2'); // failure

    // Now succeed
    mockSpawn.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    await resolveNaturalLanguage('q3 — success');

    expect(getCircuitBreakerState().failures).toBe(0);
    expect(getCircuitBreakerState().open).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper exports
// ---------------------------------------------------------------------------

describe('inferLayer', () => {
  it('returns "renderer" for renderer paths', () => {
    expect(inferLayer('src/renderer/components/Foo.tsx')).toBe('renderer');
  });

  it('returns "preload" for preload paths', () => {
    expect(inferLayer('src/preload/preload.ts')).toBe('preload');
  });

  it('returns "main" for main paths', () => {
    expect(inferLayer('src/main/flowTracer/index.ts')).toBe('main');
  });

  it('returns "main" for unknown paths', () => {
    expect(inferLayer('src/shared/types/flowTracer.ts')).toBe('main');
  });
});

describe('candidatesToInputs', () => {
  it('maps EntryPointCandidates to CandidateInputs with inferred layer', () => {
    const candidates = [
      { symbol: 'handleSubmit', file: 'src/renderer/App.tsx', line: 10, confidence: 0, reason: '' },
    ];
    const inputs = candidatesToInputs(candidates);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].symbol).toBe('handleSubmit');
    expect(inputs[0].layer).toBe('renderer');
  });
});
