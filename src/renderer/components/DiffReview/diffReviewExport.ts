/**
 * diffReviewExport.ts — Pure markdown builder for PR description drafts.
 *
 * Converts DiffReviewState (or its constituent files) into a Markdown string
 * formatted as a PR description draft. No DOM, no IPC — pure function.
 */

import type { ReviewFile } from './types';

export interface ExportableState {
  files: ReviewFile[];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeBacktick(s: string): string {
  return s.replace(/`/g, '\\`');
}

function buildSummaryLine(files: ReviewFile[]): string {
  const accepted = files.flatMap((f) => f.hunks).filter((h) => h.decision === 'accepted').length;
  const rejected = files.flatMap((f) => f.hunks).filter((h) => h.decision === 'rejected').length;
  const pending = files.flatMap((f) => f.hunks).filter((h) => h.decision === 'pending').length;
  return `${files.length} file${files.length !== 1 ? 's' : ''} changed: ${accepted} accepted, ${rejected} rejected, ${pending} pending`;
}

function buildFilesTable(files: ReviewFile[]): string {
  const rows = files.map((f) => {
    const accepted = f.hunks.filter((h) => h.decision === 'accepted').length;
    const rejected = f.hunks.filter((h) => h.decision === 'rejected').length;
    const pending = f.hunks.filter((h) => h.decision === 'pending').length;
    const status = capitalize(f.status);
    return `| \`${escapeBacktick(f.relativePath)}\` | ${status} | ${accepted} | ${rejected} | ${pending} |`;
  });
  return [
    '| File | Status | Accepted | Rejected | Pending |',
    '|------|--------|----------|----------|---------|',
    ...rows,
  ].join('\n');
}

function hunkSummary(hunk: ReviewFile['hunks'][number]): string {
  const firstChange = hunk.lines.find((l) => l.startsWith('+') || l.startsWith('-'));
  return firstChange ? firstChange.slice(1).trim() : hunk.header;
}

function buildHunksList(files: ReviewFile[], decision: 'accepted' | 'rejected'): string {
  const sections: string[] = [];
  for (const file of files) {
    const hunks = file.hunks.filter((h) => h.decision === decision);
    if (hunks.length === 0) continue;
    const hunkLines = hunks.map((h) => `- Hunk \`${h.header.trim()}\` — ${hunkSummary(h)}`);
    sections.push(`### \`${escapeBacktick(file.relativePath)}\`\n${hunkLines.join('\n')}`);
  }
  return sections.length > 0 ? sections.join('\n\n') : '_None_';
}

export function buildPrDescriptionMarkdown(state: ExportableState): string {
  const { files } = state;

  const summary = files.length === 0 ? 'No changes reviewed.' : buildSummaryLine(files);
  const filesTable = files.length === 0 ? '_No files_' : buildFilesTable(files);
  const acceptedSection = buildHunksList(files, 'accepted');
  const rejectedSection = buildHunksList(files, 'rejected');

  return [
    '## Summary',
    '',
    summary,
    '',
    '## Files',
    '',
    filesTable,
    '',
    '## Accepted changes',
    '',
    acceptedSection,
    '',
    '## Rejected changes',
    '',
    rejectedSection,
  ].join('\n');
}
