/**
 * nlResolverPrompt.test.ts — Unit tests for prompt assembly and response parsing.
 *
 * Wave 85 Phase 6. Covers:
 *   - buildNLResolverPrompt: query + candidates baked into the prompt
 *   - parseNLResolverResponse: happy-path top-5, low-confidence filtering,
 *     fence stripping, embedded-array extraction, malformed input degradation
 */

import { describe, expect, it } from 'vitest';

import type { CandidateInput } from './nlResolverPrompt';
import {
  buildNLResolverPrompt,
  NL_RESOLVER_SYSTEM_PROMPT,
  parseNLResolverResponse,
} from './nlResolverPrompt';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CANDIDATES: CandidateInput[] = [
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
  { symbol: 'agentChat:send', file: 'src/main/agentChat/ipcHandlers.ts', line: 77, layer: 'main' },
  {
    symbol: 'onKeyDown',
    file: 'src/renderer/components/AgentChat/Composer.tsx',
    line: 55,
    layer: 'renderer',
  },
];

const VALID_RESPONSE = JSON.stringify([
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
    confidence: 0.81,
    reason: 'Alternative send handler triggered by button click',
  },
  {
    symbol: 'agentChat:send',
    file: 'src/main/agentChat/ipcHandlers.ts',
    line: 77,
    confidence: 0.72,
    reason: 'Main-process IPC handler that processes submitted messages',
  },
]);

// ---------------------------------------------------------------------------
// buildNLResolverPrompt
// ---------------------------------------------------------------------------

describe('buildNLResolverPrompt', () => {
  it('includes the system prompt', () => {
    const prompt = buildNLResolverPrompt('when I send a chat message', CANDIDATES);
    expect(prompt).toContain(NL_RESOLVER_SYSTEM_PROMPT);
  });

  it('includes the query text', () => {
    const prompt = buildNLResolverPrompt('when I send a chat message', CANDIDATES);
    expect(prompt).toContain('when I send a chat message');
  });

  it('includes each candidate symbol', () => {
    const prompt = buildNLResolverPrompt('when I click send', CANDIDATES);
    for (const c of CANDIDATES) {
      expect(prompt).toContain(c.symbol);
      expect(prompt).toContain(c.file);
      expect(prompt).toContain(String(c.line));
      expect(prompt).toContain(c.layer);
    }
  });

  it('produces a non-empty string', () => {
    const prompt = buildNLResolverPrompt('test query', []);
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('works with an empty candidate list', () => {
    const prompt = buildNLResolverPrompt('empty query', []);
    expect(prompt).toContain('empty query');
    expect(prompt).toContain('Candidates:');
  });
});

// ---------------------------------------------------------------------------
// parseNLResolverResponse — happy path
// ---------------------------------------------------------------------------

describe('parseNLResolverResponse — happy path', () => {
  it('parses a valid JSON array', () => {
    const result = parseNLResolverResponse(VALID_RESPONSE);
    expect(result).toHaveLength(3);
  });

  it('returns candidates sorted descending by confidence', () => {
    const result = parseNLResolverResponse(VALID_RESPONSE);
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i]; // eslint-disable-line security/detect-object-injection
      expect(prev.confidence).toBeGreaterThanOrEqual(curr.confidence);
    }
  });

  it('preserves required EntryPointCandidate fields', () => {
    const result = parseNLResolverResponse(VALID_RESPONSE);
    const top = result[0];
    expect(typeof top.symbol).toBe('string');
    expect(typeof top.file).toBe('string');
    expect(typeof top.line).toBe('number');
    expect(typeof top.confidence).toBe('number');
    expect(typeof top.reason).toBe('string');
    expect(top.symbol.length).toBeGreaterThan(0);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + VALID_RESPONSE + '\n```';
    const result = parseNLResolverResponse(fenced);
    expect(result.length).toBeGreaterThan(0);
  });

  it('extracts embedded array from surrounding prose', () => {
    const withProse = 'Here are the matches:\n' + VALID_RESPONSE + '\nEnd.';
    const result = parseNLResolverResponse(withProse);
    expect(result.length).toBeGreaterThan(0);
  });

  it('caps output at 5 candidates', () => {
    const manyCandidates = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({
        symbol: `handler${i}`,
        file: `src/main/file${i}.ts`,
        line: i + 1,
        confidence: 0.9 - i * 0.04,
        reason: `Reason ${i}`,
      }),
    ).join(',');
    const result = parseNLResolverResponse('[' + manyCandidates + ']');
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns correct top-1 symbol and confidence', () => {
    const result = parseNLResolverResponse(VALID_RESPONSE);
    expect(result[0].symbol).toBe('handleSubmit');
    expect(result[0].confidence).toBe(0.93);
    expect(result[0].reason).toBe('Primary submit handler for chat messages');
  });
});

// ---------------------------------------------------------------------------
// parseNLResolverResponse — confidence filtering
// ---------------------------------------------------------------------------

describe('parseNLResolverResponse — confidence filtering', () => {
  it('excludes candidates with confidence below 0.5', () => {
    const withLowConf = JSON.stringify([
      { symbol: 'handleSubmit', file: 'src/a.ts', line: 1, confidence: 0.95, reason: 'Best match' },
      { symbol: 'irrelevant', file: 'src/b.ts', line: 2, confidence: 0.3, reason: 'Too weak' },
    ]);
    const result = parseNLResolverResponse(withLowConf);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('handleSubmit');
  });

  it('clamps confidence to [0, 1]', () => {
    const withOob = JSON.stringify([
      { symbol: 'handler', file: 'src/a.ts', line: 1, confidence: 1.5, reason: 'OOB high' },
      { symbol: 'other', file: 'src/b.ts', line: 2, confidence: -0.2, reason: 'OOB low' },
    ]);
    const result = parseNLResolverResponse(withOob);
    expect(result).toHaveLength(1);
    for (const c of result) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty array when all candidates are below threshold', () => {
    const allLow = JSON.stringify([
      { symbol: 'weak1', file: 'src/a.ts', line: 1, confidence: 0.1, reason: 'Very weak' },
      { symbol: 'weak2', file: 'src/b.ts', line: 2, confidence: 0.2, reason: 'Weak' },
    ]);
    const result = parseNLResolverResponse(allLow);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseNLResolverResponse — degradation
// ---------------------------------------------------------------------------

describe('parseNLResolverResponse — degradation', () => {
  it('returns empty array for empty string', () => {
    expect(parseNLResolverResponse('')).toHaveLength(0);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseNLResolverResponse('   \n  ')).toHaveLength(0);
  });

  it('returns empty array for plain text (no JSON)', () => {
    expect(parseNLResolverResponse('I could not find any matching symbols.')).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseNLResolverResponse('{not: valid json}')).toHaveLength(0);
  });

  it('returns empty array for JSON object (not array)', () => {
    expect(parseNLResolverResponse('{"symbol": "x", "confidence": 0.9}')).toHaveLength(0);
  });

  it('skips array items missing required fields (symbol or file)', () => {
    const partial = JSON.stringify([
      { file: 'src/a.ts', line: 1, confidence: 0.9, reason: 'Missing symbol' },
      { symbol: 'handler', line: 1, confidence: 0.9, reason: 'Missing file' },
      { symbol: 'valid', file: 'src/b.ts', line: 5, confidence: 0.9, reason: 'Complete entry' },
    ]);
    const result = parseNLResolverResponse(partial);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('valid');
  });

  it('provides a fallback reason for items missing the reason field', () => {
    const noReason = JSON.stringify([
      { symbol: 'handler', file: 'src/a.ts', line: 1, confidence: 0.85 },
    ]);
    const result = parseNLResolverResponse(noReason);
    expect(result).toHaveLength(1);
    expect(typeof result[0].reason).toBe('string');
    expect(result[0].reason.length).toBeGreaterThan(0);
  });
});
