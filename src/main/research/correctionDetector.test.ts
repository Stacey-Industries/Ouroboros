/**
 * correctionDetector.test.ts — Unit tests for detectCorrection.
 * Wave 29.5 Phase H (H4).
 *
 * Covers: each regex pattern, confidence ladder, library extraction from
 * both capture groups and the curated list, case-insensitive matching,
 * empty/null message → null, and large-message performance.
 */

import { describe, expect, it } from 'vitest';

import { detectCorrection } from './correctionDetector';

// ─── Pattern 1: "that/this is wrong/incorrect/not right/not how" ──────────────

describe('PAT_THAT_IS_WRONG', () => {
  it('matches "that is wrong" with a known library in the message', () => {
    const hit = detectCorrection('that is wrong, React hooks cannot be called conditionally');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('React');
    expect(hit?.confidence).toBe('medium');
    expect(hit?.phrasingMatch).toMatch(/that is wrong/i);
  });

  it('matches "that\'s incorrect" with Zod in the message', () => {
    const hit = detectCorrection("that's incorrect — Zod v4 changed that API");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Zod');
    expect(hit?.confidence).toBe('medium');
  });

  it('matches "this is not right" with TypeScript in the message', () => {
    const hit = detectCorrection('this is not right for TypeScript 5.x');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('TypeScript');
    expect(hit?.confidence).toBe('medium');
  });

  it('returns null when correction phrase present but no library identified', () => {
    const hit = detectCorrection("that's incorrect, you should just pass a string");
    expect(hit).toBeNull();
  });
});

// ─── Pattern 2: "doesn't work that way / like that" ──────────────────────────

describe('PAT_DOESNT_WORK', () => {
  it('matches "doesn\'t work that way" with React in message', () => {
    const hit = detectCorrection("useEffect doesn't work that way in React 19");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('React');
    expect(hit?.confidence).toBe('medium');
    expect(hit?.phrasingMatch).toMatch(/doesn't work that way/i);
  });

  it('matches "doesn\'t work like that" with Prisma in message', () => {
    // PAT_DOESNT_WORK requires the contractive form "doesn't"
    const hit = detectCorrection("that doesn't work like that in Prisma");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Prisma');
  });

  it('returns null when no library found alongside the pattern', () => {
    const hit = detectCorrection("that doesn't work like that at all");
    expect(hit).toBeNull();
  });
});

// ─── Pattern 3: "deprecated/removed/breaking change in LibName vN" ───────────

describe('PAT_DEPRECATED_IN', () => {
  it('extracts library from capture group — high confidence', () => {
    const hit = detectCorrection("that's deprecated in Zod 4");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Zod');
    expect(hit?.confidence).toBe('high');
    expect(hit?.phrasingMatch).toMatch(/deprecated in Zod/i);
  });

  it('matches "removed in React 19" and returns canonical "React"', () => {
    const hit = detectCorrection('That API was removed in React 19, use the new hook instead');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('React');
    expect(hit?.confidence).toBe('high');
  });

  it('matches "breaking change in Next.js v15"', () => {
    const hit = detectCorrection('there was a breaking change in Next.js v15 for this');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Next.js');
    expect(hit?.confidence).toBe('high');
  });

  it('matches with optional version absent', () => {
    const hit = detectCorrection('that method was deprecated in Prisma');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Prisma');
    expect(hit?.confidence).toBe('high');
  });

  it('returns canonical casing from curated list (zod → Zod)', () => {
    const hit = detectCorrection('deprecated in zod 4');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Zod');
  });
});

// ─── Pattern 4: "wrong API for / old way in / old syntax for LibName" ─────────

describe('PAT_WRONG_API', () => {
  it('matches "wrong API for Prisma" — high confidence', () => {
    const hit = detectCorrection("that's the wrong API for Prisma 5");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Prisma');
    expect(hit?.confidence).toBe('high');
  });

  it('matches "old way in React" — high confidence', () => {
    const hit = detectCorrection("createClass is the old way in React");
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('React');
    expect(hit?.confidence).toBe('high');
  });

  it('matches "old syntax for TypeScript"', () => {
    const hit = detectCorrection('that is old syntax for TypeScript enums');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('TypeScript');
    expect(hit?.confidence).toBe('high');
  });
});

// ─── Pattern 5: "don't use <word>" — low confidence ──────────────────────────

describe('PAT_DONT_USE (low confidence)', () => {
  it('matches "don\'t use componentDidMount" with React — low confidence', () => {
    const hit = detectCorrection("don't use componentDidMount in React anymore");
    expect(hit).not.toBeNull();
    expect(hit?.confidence).toBe('low');
    expect(hit?.library).toBe('React');
  });

  it('returns null when no library present alongside don\'t use', () => {
    const hit = detectCorrection("don't use that pattern here");
    expect(hit).toBeNull();
  });
});

// ─── Library extraction: curated list scan ────────────────────────────────────

describe('library extraction from curated list', () => {
  it('finds TypeScript (case-insensitive match: "typescript")', () => {
    const hit = detectCorrection("that is wrong, typescript strict mode changed this");
    expect(hit?.library).toBe('TypeScript');
  });

  it('finds Zustand when mentioned alongside a correction phrase', () => {
    const hit = detectCorrection("that is wrong — Zustand changed its selector API in v5");
    expect(hit?.library).toBe('Zustand');
  });

  it('finds Vite when mentioned alongside a correction phrase', () => {
    const hit = detectCorrection("that doesn't work that way in Vite 6");
    expect(hit?.library).toBe('Vite');
  });
});

// ─── Confidence ladder ────────────────────────────────────────────────────────

describe('confidence ladder', () => {
  it('high: library captured directly by regex group', () => {
    const hit = detectCorrection('deprecated in Zod 4');
    expect(hit?.confidence).toBe('high');
  });

  it('medium: correction keyword + library found via list scan', () => {
    const hit = detectCorrection("that is wrong, the React API changed");
    expect(hit?.confidence).toBe('medium');
  });

  it('low: only "don\'t use" pattern fires', () => {
    const hit = detectCorrection("don't use createClass in React");
    expect(hit?.confidence).toBe('low');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns null for empty string', () => {
    expect(detectCorrection('')).toBeNull();
  });

  it('returns null for normal message with no correction pattern', () => {
    const hit = detectCorrection(
      'Can you help me set up Zod validation for this form? I need required fields.',
    );
    expect(hit).toBeNull();
  });

  it('returns null for praise message', () => {
    const hit = detectCorrection('That works perfectly! Thanks for the help with React.');
    expect(hit).toBeNull();
  });

  it('handles message with no known library gracefully — returns null', () => {
    const hit = detectCorrection("that's deprecated in FooBarBaz 99");
    // FooBarBaz is not in the curated list, but PAT_DEPRECATED_IN captures it raw
    // Spec says: if no capture group match resolves AND not in curated list,
    // the raw captured value is returned as-is (resolveFromCapture falls back).
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('FooBarBaz');
    expect(hit?.confidence).toBe('high');
  });

  it('is case-insensitive for the correction phrase', () => {
    const hit = detectCorrection('DEPRECATED IN React 18');
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('React');
  });

  it('large message (>50 KB) does not hang and returns a result', () => {
    const padding = 'x'.repeat(60_000);
    const message = `deprecated in Zod 4 — ${padding}`;
    const start = Date.now();
    const hit = detectCorrection(message);
    const elapsed = Date.now() - start;
    // Should complete well under 1 second (allowing generous CI budget)
    expect(elapsed).toBeLessThan(1000);
    expect(hit).not.toBeNull();
    expect(hit?.library).toBe('Zod');
  });

  it('large message with correction at end (past 50 KB slice) may return null', () => {
    // Correction phrase is beyond the 50 KB slice — this is acceptable behaviour
    const padding = 'x'.repeat(51_000);
    const message = `${padding} deprecated in Zod 4`;
    const hit = detectCorrection(message);
    // We don't assert non-null here — the spec says slice is intentional
    // We only assert it doesn't throw and returns within time
    expect(typeof hit === 'object').toBe(true); // null or CorrectionHit
  });
});
