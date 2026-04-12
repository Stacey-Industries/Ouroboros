/**
 * contextPacketBuilderReasons.ts — Reason-to-snippet-range mapping.
 *
 * Extracted from contextPacketBuilderHelpers.ts to stay under the 300-line ESLint limit.
 * Each `ContextReasonKind` maps to one or more `SnippetRangeEntry` values here.
 */

import {
  clampRange,
  mergeSnippetRanges,
  type SnippetContext,
  type SnippetRangeEntry,
} from './contextPacketBuilderHelpers';
import { escapeRegExp } from './contextSelectionSupport';
import type { ContextSnippet, ContextSnippetRange, GitDiffHunk } from './types';

// Mirror of the constants in contextPacketBuilderSupport — kept here to avoid a
// circular import (reasons → support → helpers → reasons).
const DEFAULT_FULL_FILE_LINE_LIMIT = 80;
const DEFAULT_TARGETED_SNIPPET_LINE_LIMIT = 60;

function findKeywordRanges(content: string, detail: string): ContextSnippetRange[] {
  const match = detail.match(/Matches keywords: (.+)$/);
  if (!match) return [];
  const keywords = match[1]
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (keywords.length === 0) return [];
  const ranges = content.split(/\r?\n/).flatMap((line, index) =>
    // eslint-disable-next-line security/detect-non-literal-regexp -- keyword is escaped via escapeRegExp
    keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(line))
      ? [{ startLine: index + 1, endLine: index + 3 }]
      : [],
  );
  return mergeSnippetRanges(ranges);
}

function findImportRanges(content: string): ContextSnippetRange[] {
  const ranges = content.split(/\r?\n/).flatMap((line, index) =>
    /\b(import|export)\b|require\(/.test(line) ? [{ startLine: index + 1, endLine: index + 2 }] : [],
  );
  return mergeSnippetRanges(ranges);
}

function findLineWindow(totalLines: number, centerLine: number, lineLimit: number): ContextSnippetRange {
  const half = Math.max(1, Math.floor(lineLimit / 2));
  return clampRange(
    { startLine: centerLine - half, endLine: centerLine - half + lineLimit - 1 },
    totalLines,
  );
}

function appendRanges(
  target: SnippetRangeEntry[],
  ranges: ContextSnippetRange[],
  source: ContextSnippet['source'],
  label: string,
): void {
  for (const range of ranges) target.push({ range, source, label });
}

function appendDirtyReasonRanges(target: SnippetRangeEntry[], context: SnippetContext): void {
  const dirtyBuffer = context.liveIdeState.dirtyBuffers.find(
    (buffer) => buffer.filePath === context.file.filePath,
  );
  if (!dirtyBuffer) return;
  const dirtyRange =
    dirtyBuffer.selection ??
    findLineWindow(context.totalLines, 1, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT);
  target.push({
    range: clampRange(dirtyRange, context.totalLines),
    source: 'dirty_buffer',
    label: 'Unsaved buffer snapshot',
  });
}

function appendKeywordReasonRanges(
  target: SnippetRangeEntry[],
  detail: string,
  content: string | null,
): void {
  if (!content) return;
  appendRanges(target, findKeywordRanges(content, detail), 'keyword_match', 'Keyword match');
}

function appendImportReasonRanges(target: SnippetRangeEntry[], content: string | null): void {
  if (!content) return;
  appendRanges(target, findImportRanges(content), 'import_adjacency', 'Import adjacency');
}

function appendWindowReasonRange(
  target: SnippetRangeEntry[],
  totalLines: number,
  source: 'diff_hunk' | 'diagnostic',
  label: string,
): void {
  target.push({
    range: findLineWindow(totalLines, 1, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT),
    source,
    label,
  });
}

function appendDiffHunkRanges(
  target: SnippetRangeEntry[],
  hunks: GitDiffHunk[] | undefined,
  totalLines: number,
): void {
  if (!hunks || hunks.length === 0) {
    appendWindowReasonRange(target, totalLines, 'diff_hunk', 'Changed file (no hunk detail)');
    return;
  }
  const CONTEXT_PADDING = 5;
  for (const hunk of hunks.slice(0, 6)) {
    const range: ContextSnippetRange = {
      startLine: Math.max(1, hunk.startLine - CONTEXT_PADDING),
      endLine: Math.min(totalLines, hunk.startLine + hunk.lineCount + CONTEXT_PADDING),
    };
    target.push({ range: clampRange(range, totalLines), source: 'diff_hunk', label: `Diff hunk at line ${hunk.startLine}` });
  }
}

function appendExplicitReasonRange(target: SnippetRangeEntry[], totalLines: number): void {
  target.push({
    range: clampRange(
      { startLine: 1, endLine: Math.min(totalLines, DEFAULT_FULL_FILE_LINE_LIMIT) },
      totalLines,
    ),
    source: 'manual_pin',
    label: 'Explicit context inclusion',
  });
}

export function appendReasonRanges(target: SnippetRangeEntry[], context: SnippetContext): void {
  for (const reason of context.file.reasons) {
    if (reason.kind === 'dirty_buffer') appendDirtyReasonRanges(target, context);
    if (reason.kind === 'keyword_match')
      appendKeywordReasonRanges(target, reason.detail, context.snapshot.content);
    if (reason.kind === 'import_adjacency')
      appendImportReasonRanges(target, context.snapshot.content);
    if (reason.kind === 'git_diff') appendDiffHunkRanges(target, context.hunks, context.totalLines);
    if (reason.kind === 'diagnostic')
      appendWindowReasonRange(target, context.totalLines, 'diagnostic', 'Diagnostics file context');
    if (reason.kind === 'user_selected' || reason.kind === 'pinned' || reason.kind === 'included')
      appendExplicitReasonRange(target, context.totalLines);
  }
}
