/**
 * analyze-claude-corpus.test.ts — Wave 53c Phase B
 *
 * Fixture-driven tests for the corpus analyzer.
 * Covers: Edit failure detection, Grep-loop depth, intent integration,
 * tolerant parsing, multi-turn sequencing, and token accumulation.
 */

import { describe, expect, it } from 'vitest';

import { finalizeSession, makeAcc, processLine } from './analyze-claude-corpus-metrics';
import { EDIT_MISMATCH_RE } from './analyze-claude-corpus-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function feedLines(lines: object[]): ReturnType<typeof finalizeSession> {
  const acc = makeAcc('test-session');
  for (const obj of lines) {
    processLine(acc, JSON.stringify(obj));
  }
  return finalizeSession(acc);
}

function toolUse(id: string, name: string, input: Record<string, unknown> = {}) {
  return {
    type: 'assistant',
    timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input }],
    },
  };
}

function toolResult(toolUseId: string, text: string, isError = false) {
  return {
    type: 'user',
    timestamp: '2026-01-01T00:00:01.000Z',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: isError || undefined,
          content: text,
        },
      ],
    },
  };
}

function userPrompt(text: string, ts = '2026-01-01T00:00:00.000Z') {
  return {
    type: 'user',
    timestamp: ts,
    message: { role: 'user', content: text },
  };
}

// ─── EDIT_MISMATCH_RE constant ────────────────────────────────────────────────

describe('EDIT_MISMATCH_RE', () => {
  it('matches the canonical mismatch phrase', () => {
    expect(EDIT_MISMATCH_RE.test('String to replace not found in file.')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(EDIT_MISMATCH_RE.test('string to replace not found in file')).toBe(true);
  });

  it('does not match permission errors', () => {
    expect(EDIT_MISMATCH_RE.test('File has not been read yet. Read it first.')).toBe(false);
  });

  it('does not match missing-file errors', () => {
    expect(EDIT_MISMATCH_RE.test('ENOENT: no such file or directory')).toBe(false);
  });

  it('does not match validation errors', () => {
    expect(EDIT_MISMATCH_RE.test('InputValidationError: old_string is missing')).toBe(false);
  });
});

// ─── Edit failure detection ───────────────────────────────────────────────────

describe('editFirstTryFailures', () => {
  it('counts canonical mismatch as failure', () => {
    const result = feedLines([
      toolUse('tu-1', 'Edit', { file_path: '/foo.ts', old_string: 'x', new_string: 'y' }),
      toolResult(
        'tu-1',
        '<tool_use_error>String to replace not found in file.\nString: x</tool_use_error>',
        true,
      ),
    ]);
    expect(result.editAttempts).toBe(1);
    expect(result.editFirstTryFailures).toBe(1);
    expect(result.editFirstTryFailureRate).toBe(1);
  });

  it('does not count permission error as mismatch failure', () => {
    const result = feedLines([
      toolUse('tu-2', 'Edit', { file_path: '/foo.ts' }),
      toolResult(
        'tu-2',
        '<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>',
        true,
      ),
    ]);
    expect(result.editAttempts).toBe(1);
    expect(result.editFirstTryFailures).toBe(0);
    expect(result.editFirstTryFailureRate).toBe(0);
  });

  it('does not count non-Edit is_error as edit failure', () => {
    const result = feedLines([
      toolUse('tu-3', 'Bash', { command: 'ls' }),
      toolResult('tu-3', 'permission denied', true),
    ]);
    expect(result.editFirstTryFailures).toBe(0);
    expect(result.editAttempts).toBe(0);
  });

  it('does not count successful Edit as failure', () => {
    const result = feedLines([
      toolUse('tu-4', 'Edit', { file_path: '/bar.ts', old_string: 'a', new_string: 'b' }),
      toolResult('tu-4', 'Edit applied successfully.'),
    ]);
    expect(result.editAttempts).toBe(1);
    expect(result.editFirstTryFailures).toBe(0);
  });

  it('counts failure rate correctly with mixed results', () => {
    const lines = [
      toolUse('e1', 'Edit', { file_path: '/a.ts' }),
      toolResult('e1', 'String to replace not found in file.', true),
      toolUse('e2', 'Edit', { file_path: '/b.ts' }),
      toolResult('e2', 'Edit applied.'),
      toolUse('e3', 'Edit', { file_path: '/c.ts' }),
      toolResult('e3', 'String to replace not found in file.', true),
    ];
    const result = feedLines(lines);
    expect(result.editAttempts).toBe(3);
    expect(result.editFirstTryFailures).toBe(2);
    expect(result.editFirstTryFailureRate).toBeCloseTo(2 / 3, 5);
  });

  it('returns 0 failure rate when no Edit attempts', () => {
    const result = feedLines([toolUse('r1', 'Read', { file_path: '/x.ts' })]);
    expect(result.editAttempts).toBe(0);
    expect(result.editFirstTryFailureRate).toBe(0);
  });
});

// ─── Grep-loop depth ──────────────────────────────────────────────────────────

describe('maxGrepLoopDepth', () => {
  it('depth 0 when no search tools used', () => {
    const result = feedLines([
      toolUse('r1', 'Read', { file_path: '/foo.ts' }),
      toolResult('r1', 'content'),
    ]);
    expect(result.maxGrepLoopDepth).toBe(0);
  });

  it('depth 1 for single Grep followed by Read', () => {
    const result = feedLines([
      toolUse('g1', 'Grep', { pattern: 'foo' }),
      toolResult('g1', 'result'),
      toolUse('r1', 'Read', { file_path: '/a.ts' }),
      toolResult('r1', 'content'),
    ]);
    expect(result.maxGrepLoopDepth).toBe(1);
  });

  it('depth 5 for five consecutive Greps', () => {
    const lines = [];
    for (let i = 1; i <= 5; i++) {
      lines.push(toolUse(`g${i}`, 'Grep', { pattern: `pat${i}` }));
      lines.push(toolResult(`g${i}`, 'no result'));
    }
    const result = feedLines(lines);
    expect(result.maxGrepLoopDepth).toBe(5);
  });

  it('resets on Read — search-search-Read-search-search → depth 2 not 4', () => {
    const result = feedLines([
      toolUse('g1', 'Grep', { pattern: 'a' }),
      toolResult('g1', ''),
      toolUse('g2', 'Grep', { pattern: 'b' }),
      toolResult('g2', ''),
      toolUse('r1', 'Read', { file_path: '/f.ts' }),
      toolResult('r1', 'content'),
      toolUse('g3', 'Grep', { pattern: 'c' }),
      toolResult('g3', ''),
      toolUse('g4', 'Glob', { pattern: '*.ts' }),
      toolResult('g4', ''),
    ]);
    expect(result.maxGrepLoopDepth).toBe(2);
  });

  it('Glob counts as search tool', () => {
    const result = feedLines([
      toolUse('gl1', 'Glob', { pattern: '**/*.ts' }),
      toolResult('gl1', 'files'),
      toolUse('gl2', 'Glob', { pattern: '**/*.tsx' }),
      toolResult('gl2', 'files'),
    ]);
    expect(result.maxGrepLoopDepth).toBe(2);
  });

  it('Edit resets grep run', () => {
    const result = feedLines([
      toolUse('g1', 'Grep', { pattern: 'x' }),
      toolResult('g1', ''),
      toolUse('g2', 'Grep', { pattern: 'y' }),
      toolResult('g2', ''),
      toolUse('g3', 'Grep', { pattern: 'z' }),
      toolResult('g3', ''),
      toolUse('e1', 'Edit', { file_path: '/a.ts' }),
      toolResult('e1', 'applied'),
      toolUse('g4', 'Grep', { pattern: 'w' }),
      toolResult('g4', ''),
    ]);
    expect(result.maxGrepLoopDepth).toBe(3);
  });
});

// ─── Intent classification integration ───────────────────────────────────────

describe('intentBucket', () => {
  it('all-continuation prompts → continuation bucket', () => {
    const result = feedLines([userPrompt('yes'), userPrompt('ok'), userPrompt('go ahead')]);
    expect(result.intentBucket).toBe('continuation');
    expect(result.userPromptCount).toBe(3);
  });

  it('first non-continuation refactor prompt wins', () => {
    const result = feedLines([
      userPrompt('yes'),
      userPrompt('Refactor the auth module to extract helpers'),
      userPrompt('ok'),
    ]);
    expect(result.intentBucket).toBe('refactor');
  });

  it('no user prompts → other bucket', () => {
    const result = feedLines([
      toolUse('r1', 'Read', { file_path: '/x.ts' }),
      toolResult('r1', 'content'),
    ]);
    expect(result.intentBucket).toBe('other');
    expect(result.userPromptCount).toBe(0);
  });

  it('bug-fix intent recognized from prompt', () => {
    const result = feedLines([userPrompt('Fix the crash in the PTY session handler')]);
    expect(result.intentBucket).toBe('bug-fix');
  });

  it('feature intent recognized from prompt', () => {
    const result = feedLines([userPrompt('Implement a new theme switcher component')]);
    expect(result.intentBucket).toBe('feature');
  });
});

// ─── Tolerant parsing ─────────────────────────────────────────────────────────

describe('tolerant parsing', () => {
  it('malformed line in middle does not crash, skips it', () => {
    const acc = makeAcc('tol-1');
    processLine(acc, JSON.stringify(userPrompt('fix the bug')));
    processLine(acc, '{not valid json{{{{');
    processLine(acc, JSON.stringify(userPrompt('continue')));
    expect(acc.parseErrors).toBe(1);
    const result = finalizeSession(acc);
    expect(result.userPromptCount).toBe(2);
  });

  it('empty line does not crash and is not counted as error', () => {
    const acc = makeAcc('tol-2');
    processLine(acc, '');
    processLine(acc, '   ');
    expect(acc.parseErrors).toBe(0);
  });

  it('truncated last line (partial JSON) does not crash', () => {
    const acc = makeAcc('tol-3');
    processLine(
      acc,
      '{"type":"user","timestamp":"2026-01-01T00:00:00.000Z","message":{"role":"user","content":"fix bug"',
    );
    expect(acc.parseErrors).toBe(1);
    // Still produces a valid (empty) session
    const result = finalizeSession(acc);
    expect(result.sessionId).toBe('tol-3');
  });

  it('unknown top-level type is silently ignored', () => {
    const acc = makeAcc('tol-4');
    processLine(acc, JSON.stringify({ type: 'queue-operation', operation: 'enqueue' }));
    processLine(acc, JSON.stringify({ type: 'permission-mode', permissionMode: 'default' }));
    expect(acc.parseErrors).toBe(0);
    expect(finalizeSession(acc).userPromptCount).toBe(0);
  });
});

// ─── Multi-turn sequencing ────────────────────────────────────────────────────

describe('multi-turn sequencing', () => {
  it('tool_use id from assistant matched to tool_result in user', () => {
    // Edit in turn 1, result in turn 2, then another Edit in turn 3
    const result = feedLines([
      toolUse('id-A', 'Edit', { file_path: '/a.ts' }),
      toolResult('id-A', 'String to replace not found in file.', true),
      userPrompt('try again'),
      toolUse('id-B', 'Edit', { file_path: '/a.ts' }),
      toolResult('id-B', 'applied successfully'),
    ]);
    expect(result.editAttempts).toBe(2);
    expect(result.editFirstTryFailures).toBe(1);
  });

  it('filesTouched collects paths from Read, Edit, and Write', () => {
    const result = feedLines([
      toolUse('r1', 'Read', { file_path: '/src/foo.ts' }),
      toolResult('r1', 'content'),
      toolUse('e1', 'Edit', { file_path: '/src/bar.ts' }),
      toolResult('e1', 'applied'),
      toolUse('w1', 'Write', { file_path: '/src/baz.ts' }),
      toolResult('w1', 'written'),
    ]);
    expect(result.filesTouched).toContain('/src/foo.ts');
    expect(result.filesTouched).toContain('/src/bar.ts');
    expect(result.filesTouched).toContain('/src/baz.ts');
  });

  it('timestamps drive durationMs', () => {
    const result = feedLines([
      {
        type: 'user',
        timestamp: '2026-01-01T00:00:00.000Z',
        message: { role: 'user', content: 'start' },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T00:05:00.000Z',
        message: { role: 'user', content: 'end' },
      },
    ]);
    expect(result.durationMs).toBe(5 * 60 * 1000);
  });

  it('tool counts accumulated across turns', () => {
    const result = feedLines([
      toolUse('g1', 'Grep', { pattern: 'a' }),
      toolResult('g1', ''),
      toolUse('g2', 'Grep', { pattern: 'b' }),
      toolResult('g2', ''),
      toolUse('r1', 'Read', { file_path: '/x.ts' }),
      toolResult('r1', 'content'),
    ]);
    expect(result.toolCounts['Grep']).toBe(2);
    expect(result.toolCounts['Read']).toBe(1);
  });

  it('meta user messages are not counted as user prompts', () => {
    const result = feedLines([
      {
        type: 'user',
        isMeta: true,
        timestamp: '2026-01-01T00:00:00.000Z',
        message: {
          role: 'user',
          content: '<local-command-caveat>ignore me</local-command-caveat>',
        },
      },
      userPrompt('fix the issue'),
    ]);
    expect(result.userPromptCount).toBe(1);
  });
});
