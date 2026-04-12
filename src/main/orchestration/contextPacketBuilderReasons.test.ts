import { describe, expect, it } from 'vitest';

import type { SnippetContext, SnippetRangeEntry } from './contextPacketBuilderHelpers';
import { appendReasonRanges } from './contextPacketBuilderReasons';
import type { RankedContextFile } from './types';

function makeFile(reasons: RankedContextFile['reasons']): RankedContextFile {
  return {
    filePath: '/tmp/test.ts',
    score: 50,
    confidence: 'medium',
    reasons,
    snippets: [],
    truncationNotes: [],
  };
}

function makeContext(
  file: RankedContextFile,
  content: string,
  totalLines: number,
): SnippetContext {
  return {
    file,
    snapshot: { filePath: file.filePath, content, unsaved: false },
    totalLines,
    liveIdeState: {
      selectedFiles: [],
      openFiles: [],
      dirtyFiles: [],
      dirtyBuffers: [],
      collectedAt: 0,
    },
  };
}

describe('appendReasonRanges', () => {
  it('appends a manual_pin range for user_selected reason', () => {
    const file = makeFile([{ kind: 'user_selected', weight: 100, detail: '' }]);
    const ctx = makeContext(file, 'line1\nline2\nline3\n', 3);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target.length).toBeGreaterThan(0);
    expect(target[0]?.source).toBe('manual_pin');
  });

  it('appends a manual_pin range for pinned reason', () => {
    const file = makeFile([{ kind: 'pinned', weight: 95, detail: '' }]);
    const ctx = makeContext(file, 'line1\n', 1);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target.some((r) => r.source === 'manual_pin')).toBe(true);
  });

  it('appends keyword_match range when content has matching keyword', () => {
    const content = 'const foo = 1;\nconst bar = 2;\n';
    const file = makeFile([{ kind: 'keyword_match', weight: 26, detail: 'Matches keywords: foo' }]);
    const ctx = makeContext(file, content, 2);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target.some((r) => r.source === 'keyword_match')).toBe(true);
  });

  it('appends import_adjacency range when content has import statements', () => {
    const content = 'import fs from "fs";\nconst x = 1;\n';
    const file = makeFile([{ kind: 'import_adjacency', weight: 22, detail: '' }]);
    const ctx = makeContext(file, content, 2);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target.some((r) => r.source === 'import_adjacency')).toBe(true);
  });

  it('appends diff_hunk range for git_diff reason with no hunks', () => {
    const file = makeFile([{ kind: 'git_diff', weight: 56, detail: '' }]);
    const ctx = makeContext(file, 'a\nb\nc\n', 3);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target.some((r) => r.source === 'diff_hunk')).toBe(true);
  });

  it('produces no ranges for empty reasons list', () => {
    const file = makeFile([]);
    const ctx = makeContext(file, 'hello\n', 1);
    const target: SnippetRangeEntry[] = [];
    appendReasonRanges(target, ctx);
    expect(target).toHaveLength(0);
  });
});
