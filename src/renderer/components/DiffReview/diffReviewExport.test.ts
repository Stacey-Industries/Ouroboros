/**
 * diffReviewExport.test.ts — Unit tests for buildPrDescriptionMarkdown.
 */

import { describe, expect, it } from 'vitest';

import { buildPrDescriptionMarkdown } from './diffReviewExport';
import type { ExportableState } from './diffReviewExport';
import type { ReviewFile } from './types';

function makeHunk(
  id: string,
  decision: 'pending' | 'accepted' | 'rejected',
  header = '@@ -1,3 +1,5 @@',
  lines = ['+added line', '-removed line'],
): ReviewFile['hunks'][number] {
  return {
    id,
    header,
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 5,
    lines,
    rawPatch: '',
    decision,
  };
}

function makeFile(
  relativePath: string,
  status: ReviewFile['status'],
  hunks: ReviewFile['hunks'],
): ReviewFile {
  return {
    filePath: `/project/${relativePath}`,
    relativePath,
    status,
    hunks,
  };
}

describe('buildPrDescriptionMarkdown', () => {
  it('empty state produces minimal markdown with zero counts', () => {
    const state: ExportableState = { files: [] };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('## Summary');
    expect(md).toContain('No changes reviewed.');
    expect(md).toContain('_No files_');
    expect(md).toContain('_None_');
  });

  it('accepted-only state produces accepted section with content, rejected shows None', () => {
    const state: ExportableState = {
      files: [makeFile('src/foo.ts', 'modified', [makeHunk('h1', 'accepted')])],
    };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('## Accepted changes');
    expect(md).toContain('src/foo.ts');
    // Accepted section has real content
    const acceptedIdx = md.indexOf('## Accepted changes');
    const rejectedIdx = md.indexOf('## Rejected changes');
    const acceptedSection = md.slice(acceptedIdx, rejectedIdx);
    expect(acceptedSection).not.toContain('_None_');
    // Rejected section is None
    const rejectedSection = md.slice(rejectedIdx);
    expect(rejectedSection).toContain('_None_');
  });

  it('rejected-only state produces rejected section, accepted shows None', () => {
    const state: ExportableState = {
      files: [makeFile('src/bar.ts', 'modified', [makeHunk('h2', 'rejected')])],
    };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('## Rejected changes');
    expect(md).toContain('src/bar.ts');
    // Accepted section should show None
    const acceptedIdx = md.indexOf('## Accepted changes');
    const rejectedIdx = md.indexOf('## Rejected changes');
    const acceptedSection = md.slice(acceptedIdx, rejectedIdx);
    expect(acceptedSection).toContain('_None_');
  });

  it('mixed accept/reject produces both sections with correct files', () => {
    const state: ExportableState = {
      files: [
        makeFile('src/a.ts', 'modified', [makeHunk('h1', 'accepted'), makeHunk('h2', 'rejected')]),
        makeFile('src/b.ts', 'added', [makeHunk('h3', 'accepted')]),
      ],
    };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('## Accepted changes');
    expect(md).toContain('## Rejected changes');
    // Both files appear somewhere
    expect(md).toContain('src/a.ts');
    expect(md).toContain('src/b.ts');
  });

  it('file count and per-file accept/reject counts match state', () => {
    const state: ExportableState = {
      files: [
        makeFile('src/x.ts', 'modified', [
          makeHunk('h1', 'accepted'),
          makeHunk('h2', 'accepted'),
          makeHunk('h3', 'rejected'),
          makeHunk('h4', 'pending'),
        ]),
      ],
    };
    const md = buildPrDescriptionMarkdown(state);
    // Summary line: 1 file
    expect(md).toContain('1 file changed');
    // Files table row: 2 accepted, 1 rejected, 1 pending
    expect(md).toMatch(/src\/x\.ts.*Modified.*2.*1.*1/);
  });

  it('is deterministic — same input produces same output', () => {
    const state: ExportableState = {
      files: [makeFile('src/det.ts', 'modified', [makeHunk('h1', 'accepted')])],
    };
    expect(buildPrDescriptionMarkdown(state)).toBe(buildPrDescriptionMarkdown(state));
  });

  it('special characters in filenames are escaped in the table', () => {
    const state: ExportableState = {
      files: [makeFile('src/my `file`.ts', 'modified', [makeHunk('h1', 'accepted')])],
    };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('\\`');
    expect(md).not.toMatch(/[^\\]`my `file`/);
  });

  it('file status is capitalized in the table', () => {
    const state: ExportableState = {
      files: [
        makeFile('a.ts', 'added', [makeHunk('h1', 'accepted')]),
        makeFile('b.ts', 'deleted', [makeHunk('h2', 'rejected')]),
        makeFile('c.ts', 'renamed', [makeHunk('h3', 'pending')]),
      ],
    };
    const md = buildPrDescriptionMarkdown(state);
    expect(md).toContain('Added');
    expect(md).toContain('Deleted');
    expect(md).toContain('Renamed');
  });
});
