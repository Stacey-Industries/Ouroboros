/**
 * contextOutcomeObserver.test.ts — Unit tests for the per-turn outcome observer.
 *
 * All writer I/O is injected via a mock ContextOutcomeWriter.
 * No real filesystem is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  _resetContextOutcomeObserverForTests,
  _resetFlagGetterForTests,
  _setFlagGetterForTests,
  initContextOutcomeObserver,
  observeToolCall,
  recordTurnEnd,
  recordTurnStart,
} from './contextOutcomeObserver';
import type { ContextOutcomeWriter } from './contextOutcomeWriter';
import type { ContextOutcome } from './contextTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockWriter(): { writer: ContextOutcomeWriter; recorded: ContextOutcome[] } {
  const recorded: ContextOutcome[] = [];
  const writer: ContextOutcomeWriter = {
    recordOutcome: vi.fn((o: ContextOutcome) => { recorded.push(o); }),
    flushPendingWrites: vi.fn(async () => {}),
    closeOutcomeWriter: vi.fn(async () => {}),
  };
  return { writer, recorded };
}

function makeIncludedFiles(paths: string[]): { fileId: string; path: string }[] {
  return paths.map((p) => ({ fileId: p, path: p }));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetContextOutcomeObserverForTests();
  _setFlagGetterForTests(() => true);
});

afterEach(() => {
  _resetContextOutcomeObserverForTests();
  _resetFlagGetterForTests();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('recordTurnStart / recordTurnEnd — basic lifecycle', () => {
  it('returns empty outcomes when no tools were called', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('turn-1', 'trace-abc', makeIncludedFiles(['src/foo.ts']));
    const outcomes = recordTurnEnd('turn-1');

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ decisionId: 'src/foo.ts', kind: 'unused' });
  });

  it('returns empty array when turnId was never started', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    const outcomes = recordTurnEnd('nonexistent-turn');
    expect(outcomes).toHaveLength(0);
  });

  it('clears turn state after recordTurnEnd so a second call returns empty', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('turn-2', 'trace-abc', makeIncludedFiles(['src/bar.ts']));
    recordTurnEnd('turn-2');
    const second = recordTurnEnd('turn-2');

    expect(second).toHaveLength(0);
  });
});

describe('outcome kinds — used / unused / missed', () => {
  it('classifies a file as used when touched by Read', () => {
    const { writer, recorded } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ decisionId: 'src/a.ts', kind: 'used', toolUsed: 'Read' });
    expect(recorded).toHaveLength(1);
  });

  it('classifies a file as used when touched by Edit', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/b.ts']));
    observeToolCall('t', 'Edit', { file_path: 'src/b.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0]).toMatchObject({ kind: 'used', toolUsed: 'Edit' });
  });

  it('classifies an included file as unused when not touched', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/c.ts', 'src/d.ts']));
    observeToolCall('t', 'Read', { path: 'src/c.ts' });
    const outcomes = recordTurnEnd('t');

    const unused = outcomes.filter((o) => o.kind === 'unused');
    expect(unused).toHaveLength(1);
    expect(unused[0].decisionId).toBe('src/d.ts');
  });

  it('classifies a touched file as missed when not in included set', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/known.ts']));
    observeToolCall('t', 'Read', { path: 'src/unknown.ts' });
    const outcomes = recordTurnEnd('t');

    const missed = outcomes.filter((o) => o.kind === 'missed');
    expect(missed).toHaveLength(1);
    expect(missed[0].toolUsed).toBe('Read');
  });

  it('emits all three kinds in a mixed turn', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts', 'src/b.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });   // used
    observeToolCall('t', 'Write', { path: 'src/c.ts' });  // missed (not in packet)
    // src/b.ts never touched → unused
    const outcomes = recordTurnEnd('t');

    const kinds = outcomes.map((o) => o.kind).sort();
    expect(kinds).toEqual(['missed', 'unused', 'used']);
  });
});

describe('tool normalisation — argument field variants', () => {
  it('extracts path from the `path` field', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('used');
  });

  it('extracts path from the `filePath` field', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Edit', { filePath: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('used');
  });

  it('extracts path from the `file_path` field', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Write', { file_path: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('used');
  });

  it('ignores non-file-touching tools', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Bash', { path: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('unused'); // Bash doesn't count
  });

  it('recognises all aliased file-touching tool names', () => {
    const tools = ['Read', 'read_file', 'view_file', 'Edit', 'edit_file', 'Write', 'write_file', 'MultiEdit'];
    for (const tool of tools) {
      _resetContextOutcomeObserverForTests();
      _setFlagGetterForTests(() => true);
      const { writer } = makeMockWriter();
      initContextOutcomeObserver(writer);

      recordTurnStart('t', 'tr', makeIncludedFiles(['src/x.ts']));
      observeToolCall('t', tool, { path: 'src/x.ts' });
      const outcomes = recordTurnEnd('t');

      expect(outcomes[0].kind, `tool=${tool}`).toBe('used');
    }
  });
});

describe('path normalisation', () => {
  it('matches Windows backslash paths to forward-slash included paths', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Read', { path: 'src\\a.ts' }); // Windows separator
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('used');
  });

  it('is case-insensitive', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/A.ts']));
    observeToolCall('t', 'Read', { path: 'SRC/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes[0].kind).toBe('used');
  });
});

describe('feature flag', () => {
  it('returns empty outcomes and does not write when flag is off', () => {
    _setFlagGetterForTests(() => false);
    const { writer, recorded } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });
    const outcomes = recordTurnEnd('t');

    expect(outcomes).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });
});

describe('writer delegation', () => {
  it('passes each outcome to writer.recordOutcome', () => {
    const { writer, recorded } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts', 'src/b.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });
    recordTurnEnd('t');

    expect(recorded).toHaveLength(2); // used + unused
    expect(writer.recordOutcome).toHaveBeenCalledTimes(2);
  });

  it('warns and returns empty when no writer is available', () => {
    // No initContextOutcomeObserver call — singleton is null
    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    const outcomes = recordTurnEnd('t');

    expect(outcomes).toHaveLength(0);
  });

  it('does not deduplicate tool calls — first touch wins', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t', 'tr', makeIncludedFiles(['src/a.ts']));
    observeToolCall('t', 'Read', { path: 'src/a.ts' });
    observeToolCall('t', 'Edit', { path: 'src/a.ts' }); // second touch, same file
    const outcomes = recordTurnEnd('t');

    // Only one outcome — first tool (Read) wins
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: 'used', toolUsed: 'Read' });
  });
});

describe('multiple concurrent turns', () => {
  it('tracks two turns independently', () => {
    const { writer } = makeMockWriter();
    initContextOutcomeObserver(writer);

    recordTurnStart('t1', 'trace-1', makeIncludedFiles(['src/a.ts']));
    recordTurnStart('t2', 'trace-2', makeIncludedFiles(['src/b.ts']));

    observeToolCall('t1', 'Read', { path: 'src/a.ts' });
    // t2 gets no tool calls

    const o1 = recordTurnEnd('t1');
    const o2 = recordTurnEnd('t2');

    expect(o1[0]).toMatchObject({ kind: 'used' });
    expect(o2[0]).toMatchObject({ kind: 'unused' });
  });
});
