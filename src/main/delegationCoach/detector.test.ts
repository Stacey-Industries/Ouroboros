/**
 * detector.test.ts — Pattern matcher tests.
 *
 * Covers the trigger DSL primitives (current matcher, history requirements
 * with min/max counts, glob path matching) and the cooldown gate. Uses
 * synthetic tool-use streams; no IPC, no filesystem.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HISTORY_MAX_EVENTS,
  DEFAULT_HISTORY_WINDOW_MS,
  detectPatterns,
  globMatches,
  pruneHistory,
} from './detector';
import type { PatternDefinition, ToolCallEvent } from './types';

const NOW = 1_700_000_000_000;

function ev(tool: string, offsetMs: number, file?: string): ToolCallEvent {
  return {
    tool,
    input: file ? { file_path: file } : {},
    timestamp: NOW + offsetMs,
    sessionId: 'sess-test',
  };
}

const MULTI_FILE_SCAN: PatternDefinition = {
  id: 'multi-file-scan-no-edit',
  name: 'Multi-file scan',
  description: 'd',
  trigger: {
    current: { tool: 'Read' },
    history: [
      { match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60_000 },
      { match: { tool: 'Edit' }, count: { max: 0 }, withinMs: 60_000 },
    ],
  },
  suggestion: 'Use haiku-explorer.',
  escalation: 'soft',
};

describe('detectPatterns — current-call matcher', () => {
  it('fires when the current tool matches and history requirements hold', () => {
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    const current = ev('Read', 0);
    const matches = detectPatterns(history, current, [MULTI_FILE_SCAN]);
    expect(matches).toHaveLength(1);
    expect(matches[0].patternId).toBe('multi-file-scan-no-edit');
  });

  it('does not fire when the current tool does not match', () => {
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    const current = ev('Bash', 0);
    expect(detectPatterns(history, current, [MULTI_FILE_SCAN])).toHaveLength(0);
  });

  it('accepts an array tool matcher (any-of)', () => {
    const pattern: PatternDefinition = {
      id: 'p',
      name: 'p',
      description: 'd',
      trigger: { current: { tool: ['Read', 'Grep'] } },
      suggestion: 's',
      escalation: 'soft',
    };
    expect(detectPatterns([], ev('Grep', 0), [pattern])).toHaveLength(1);
    expect(detectPatterns([], ev('Read', 0), [pattern])).toHaveLength(1);
    expect(detectPatterns([], ev('Bash', 0), [pattern])).toHaveLength(0);
  });
});

describe('detectPatterns — history requirements', () => {
  it('respects withinMs window — older events are excluded', () => {
    const history = [
      ev('Read', -120_000), // outside 60s window
      ev('Read', -50_000),
      ev('Read', -40_000),
    ];
    expect(detectPatterns(history, ev('Read', 0), [MULTI_FILE_SCAN])).toHaveLength(0);
  });

  it('does not count events with future timestamps (defensive)', () => {
    const history = [
      ev('Read', 5_000), // future
      ev('Read', -10_000),
      ev('Read', -20_000),
      ev('Read', -30_000),
    ];
    // Only 3 of the 4 are in [-60_000, 0]; pattern needs min:3 → satisfied.
    expect(detectPatterns(history, ev('Read', 0), [MULTI_FILE_SCAN])).toHaveLength(1);
  });

  it('honors a max:0 negative requirement (no Edit allowed)', () => {
    const history = [
      ev('Read', -50_000),
      ev('Read', -40_000),
      ev('Read', -30_000),
      ev('Edit', -20_000), // breaks the no-edit constraint
    ];
    expect(detectPatterns(history, ev('Read', 0), [MULTI_FILE_SCAN])).toHaveLength(0);
  });

  it('does not fire when min count not met', () => {
    const history = [ev('Read', -50_000), ev('Read', -40_000)];
    expect(detectPatterns(history, ev('Read', 0), [MULTI_FILE_SCAN])).toHaveLength(0);
  });
});

describe('detectPatterns — path matching', () => {
  const TEST_FIRST: PatternDefinition = {
    id: 'tf',
    name: 'Test-first',
    description: 'd',
    trigger: {
      current: { tool: 'Edit', argPathDoesNotMatch: '*.test.*' },
      history: [
        {
          match: { tool: 'Read', argPathMatches: '*.test.*' },
          count: { min: 1 },
          withinMs: 60_000,
        },
      ],
    },
    suggestion: 'TDD.',
    escalation: 'soft',
  };

  it('fires on Edit-impl after Read-test', () => {
    const history = [ev('Read', -10_000, '/repo/foo.test.ts')];
    const current = ev('Edit', 0, '/repo/foo.ts');
    expect(detectPatterns(history, current, [TEST_FIRST])).toHaveLength(1);
  });

  it('does not fire when Edit targets the test file itself', () => {
    const history = [ev('Read', -10_000, '/repo/foo.test.ts')];
    const current = ev('Edit', 0, '/repo/foo.test.ts');
    expect(detectPatterns(history, current, [TEST_FIRST])).toHaveLength(0);
  });

  it('does not fire when no test file was read', () => {
    const history = [ev('Read', -10_000, '/repo/bar.ts')];
    const current = ev('Edit', 0, '/repo/foo.ts');
    expect(detectPatterns(history, current, [TEST_FIRST])).toHaveLength(0);
  });

  it('argPathMatches requires a path on the event (no path → no match)', () => {
    const pattern: PatternDefinition = {
      id: 'p',
      name: 'p',
      description: 'd',
      trigger: { current: { tool: 'Edit', argPathMatches: '*.ts' } },
      suggestion: 's',
      escalation: 'soft',
    };
    const noPath: ToolCallEvent = { tool: 'Edit', input: {}, timestamp: NOW, sessionId: 's' };
    expect(detectPatterns([], noPath, [pattern])).toHaveLength(0);
  });
});

describe('detectPatterns — cooldown', () => {
  it('suppresses a match when within cooldown window', () => {
    const pattern: PatternDefinition = {
      ...MULTI_FILE_SCAN,
      cooldownMs: 60_000,
    };
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    const matches = detectPatterns(history, ev('Read', 0), [pattern], {
      lastFiredAt: { [pattern.id]: NOW - 30_000 },
    });
    expect(matches).toHaveLength(0);
  });

  it('allows the match again after cooldown elapses', () => {
    const pattern: PatternDefinition = {
      ...MULTI_FILE_SCAN,
      cooldownMs: 60_000,
    };
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    const matches = detectPatterns(history, ev('Read', 0), [pattern], {
      lastFiredAt: { [pattern.id]: NOW - 90_000 },
    });
    expect(matches).toHaveLength(1);
  });
});

describe('detectPatterns — disabled patterns', () => {
  it('skips patterns where enabled is false', () => {
    const pattern: PatternDefinition = { ...MULTI_FILE_SCAN, enabled: false };
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    expect(detectPatterns(history, ev('Read', 0), [pattern])).toHaveLength(0);
  });
});

describe('globMatches', () => {
  it('matches *.test.* against path with a test segment', () => {
    expect(globMatches('*.test.*', 'foo.test.ts')).toBe(true);
    expect(globMatches('*.test.*', 'foo.ts')).toBe(false);
  });

  it('basename-only match when pattern has no slash (bash convention)', () => {
    // Pattern without `/` matches basename, so it ignores leading directories.
    expect(globMatches('*.ts', 'src/foo.ts')).toBe(true);
    expect(globMatches('*.ts', 'src/foo.tsx')).toBe(false);
  });

  it('full-path match when pattern contains a slash; * still does not cross slashes', () => {
    expect(globMatches('src/*.ts', 'src/foo.ts')).toBe(true);
    expect(globMatches('src/*.ts', 'src/sub/foo.ts')).toBe(false); // * stops at /
    expect(globMatches('src/**.ts', 'src/sub/foo.ts')).toBe(true); // ** crosses /
  });

  it('case-insensitive (paths are lowercased before matching)', () => {
    expect(globMatches('*.TS', 'foo.ts')).toBe(true);
  });

  it('escapes regex meta characters in the literal portion', () => {
    expect(globMatches('a.b', 'a.b')).toBe(true);
    expect(globMatches('a.b', 'aXb')).toBe(false); // dot must be literal
  });
});

describe('pruneHistory', () => {
  it('drops events older than the window', () => {
    const history = [ev('Read', -200_000), ev('Read', -50_000), ev('Read', -10_000)];
    const pruned = pruneHistory(history, NOW, 60_000);
    expect(pruned).toHaveLength(2);
  });

  it('caps at maxEvents, preserving the newest', () => {
    const history = Array.from({ length: 30 }, (_, i) => ev('Read', -i * 1000));
    const pruned = pruneHistory(history, NOW, 60_000, 10);
    expect(pruned).toHaveLength(10);
  });

  it('uses default window + cap when not overridden', () => {
    const history = [ev('Read', -DEFAULT_HISTORY_WINDOW_MS - 1)];
    expect(pruneHistory(history, NOW)).toHaveLength(0);
    expect(DEFAULT_HISTORY_MAX_EVENTS).toBeGreaterThan(0);
  });
});

describe('detectPatterns — multiple patterns', () => {
  it('returns matches in pattern-list order', () => {
    const p1: PatternDefinition = {
      ...MULTI_FILE_SCAN,
      id: 'first',
    };
    const p2: PatternDefinition = {
      ...MULTI_FILE_SCAN,
      id: 'second',
    };
    const history = [ev('Read', -50_000), ev('Read', -40_000), ev('Read', -30_000)];
    const matches = detectPatterns(history, ev('Read', 0), [p1, p2]);
    expect(matches.map((m) => m.patternId)).toEqual(['first', 'second']);
  });
});
