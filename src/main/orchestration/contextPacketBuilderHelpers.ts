import path from 'path';

import {
  buildBudgetSummary,
  dedupeSnippetCandidates,
  DEFAULT_FULL_FILE_LINE_LIMIT,
  DEFAULT_TARGETED_SNIPPET_LINE_LIMIT,
  deriveSnippetCandidates,
  keepSnippetWithinBudget,
} from './contextPacketBuilderSupport';
import { type ContextFileSnapshot, loadContextFileSnapshot } from './contextSelectionSupport';
import type { ContextSelectionResult } from './contextSelector';
import type {
  ContextSnippet,
  ContextSnippetRange,
  ContextTruncationNote,
  GitDiffHunk,
  LiveIdeState,
  RankedContextFile,
} from './types';

export type SnippetRangeEntry = {
  range: ContextSnippetRange;
  source: ContextSnippet['source'];
  label: string;
};

export interface SnippetContext {
  file: RankedContextFile;
  snapshot: ContextFileSnapshot;
  totalLines: number;
  liveIdeState: LiveIdeState;
  hunks?: GitDiffHunk[];
}

function toPathKey(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countLines(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

export function clampRange(range: ContextSnippetRange, totalLines: number): ContextSnippetRange {
  const startLine = Math.max(1, Math.min(range.startLine, totalLines));
  const endLine = Math.max(startLine, Math.min(range.endLine, totalLines));
  return { startLine, endLine };
}

export function sliceLines(content: string, range: ContextSnippetRange): string {
  return content
    .split(/\r?\n/)
    .slice(range.startLine - 1, range.endLine)
    .join('\n');
}

export function mergeSnippetRanges(ranges: ContextSnippetRange[]): ContextSnippetRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort(
    (left, right) => left.startLine - right.startLine || left.endLine - right.endLine,
  );
  const merged: ContextSnippetRange[] = [{ ...sorted[0] }];
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, range.endLine);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

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
  const ranges = content
    .split(/\r?\n/)
    .flatMap((line, index) =>
      /\b(import|export)\b|require\(/.test(line)
        ? [{ startLine: index + 1, endLine: index + 2 }]
        : [],
    );
  return mergeSnippetRanges(ranges);
}

function findLineWindow(
  totalLines: number,
  centerLine: number,
  lineLimit: number,
): ContextSnippetRange {
  const half = Math.max(1, Math.floor(lineLimit / 2));
  return clampRange(
    { startLine: centerLine - half, endLine: centerLine - half + lineLimit - 1 },
    totalLines,
  );
}

export function groupRanges(ranges: SnippetRangeEntry[]): SnippetRangeEntry[] {
  const grouped = new Map<
    string,
    { source: ContextSnippet['source']; label: string; ranges: ContextSnippetRange[] }
  >();
  for (const item of ranges) {
    const key = `${item.source}:${item.label}`;
    const group = grouped.get(key);
    if (group) {
      group.ranges.push(item.range);
      continue;
    }
    grouped.set(key, { source: item.source, label: item.label, ranges: [item.range] });
  }
  return Array.from(grouped.values()).flatMap((group) =>
    mergeSnippetRanges(group.ranges).map((range) => ({
      range,
      source: group.source,
      label: group.label,
    })),
  );
}

export function getSelectionRange(
  file: RankedContextFile,
  liveIdeState: LiveIdeState,
): ContextSnippetRange | undefined {
  const dirtyBuffer = liveIdeState.dirtyBuffers.find(
    (buffer) => toPathKey(buffer.filePath) === toPathKey(file.filePath),
  );
  if (dirtyBuffer?.selection) return dirtyBuffer.selection;
  if (
    liveIdeState.activeFile &&
    toPathKey(liveIdeState.activeFile) === toPathKey(file.filePath) &&
    liveIdeState.selection
  ) {
    return liveIdeState.selection;
  }
  return undefined;
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
    (buffer) => toPathKey(buffer.filePath) === toPathKey(context.file.filePath),
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
    target.push({
      range: clampRange(range, totalLines),
      source: 'diff_hunk',
      label: `Diff hunk at line ${hunk.startLine}`,
    });
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

interface SnippetBudgetOptions {
  budget: ReturnType<typeof buildBudgetSummary>;
  snapshot: ContextFileSnapshot;
  filePath: string;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
}

function tryAcceptSnippet(
  snippet: ContextSnippet,
  notes: ContextTruncationNote[],
  opts: SnippetBudgetOptions,
): ContextSnippet | null {
  const kept = keepSnippetWithinBudget({
    budget: opts.budget, snapshot: opts.snapshot, snippet,
    fullFileLineLimit: opts.fullFileLineLimit, targetedSnippetLineLimit: opts.targetedSnippetLineLimit,
  });
  if (!kept) {
    notes.push({ reason: 'budget', detail: `Dropped snippet ${snippet.label} because packet size budget would be exceeded` });
    opts.budget.droppedContentNotes.push(`Dropped ${opts.filePath}:${snippet.range.startLine}-${snippet.range.endLine} due to size budget`);
    return null;
  }
  if (kept.range.endLine - kept.range.startLine < snippet.range.endLine - snippet.range.startLine) {
    notes.push({ reason: 'max_lines', detail: `Truncated ${snippet.label} to fit line limits` });
  }
  return kept;
}

function buildSnippetList(options: {
  rankedFile: RankedContextFile; liveIdeState: ContextSelectionResult['liveIdeState'];
  maxSnippetsPerFile: number; budget: ReturnType<typeof buildBudgetSummary>;
  snapshot: ContextFileSnapshot; fullFileLineLimit?: number; targetedSnippetLineLimit?: number;
}): { acceptedSnippets: ContextSnippet[]; fileTruncationNotes: ContextTruncationNote[] } {
  const { rankedFile, liveIdeState, maxSnippetsPerFile, budget, snapshot } = options;
  const candidates = deriveSnippetCandidates(rankedFile, snapshot, liveIdeState);
  const { snippets, truncationNotes } = dedupeSnippetCandidates(snapshot, candidates);
  const acceptedSnippets: ContextSnippet[] = [];
  const fileTruncationNotes: ContextTruncationNote[] = [...truncationNotes];
  const budgetOpts: SnippetBudgetOptions = { budget, snapshot, filePath: rankedFile.filePath, fullFileLineLimit: options.fullFileLineLimit, targetedSnippetLineLimit: options.targetedSnippetLineLimit };
  for (const snippet of snippets) {
    if (acceptedSnippets.length >= maxSnippetsPerFile) {
      fileTruncationNotes.push({ reason: 'budget', detail: `Dropped snippet ${snippet.label} because maxSnippetsPerFile=${maxSnippetsPerFile}` });
      continue;
    }
    const kept = tryAcceptSnippet(snippet, fileTruncationNotes, budgetOpts);
    if (kept) acceptedSnippets.push(kept);
  }
  return { acceptedSnippets, fileTruncationNotes };
}

export interface BuildFilePayloadOptions {
  rankedFile: RankedContextFile;
  liveIdeState: ContextSelectionResult['liveIdeState'];
  maxSnippetsPerFile: number;
  budget: ReturnType<typeof buildBudgetSummary>;
  cache?: Map<string, ContextFileSnapshot>;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
}

export async function buildFilePayload(options: BuildFilePayloadOptions): Promise<RankedContextFile | null> {
  const { rankedFile, liveIdeState, maxSnippetsPerFile, budget, cache } = options;
  const snapshot = await loadContextFileSnapshot(rankedFile.filePath, cache);
  const { acceptedSnippets, fileTruncationNotes } = buildSnippetList({
    rankedFile, liveIdeState, maxSnippetsPerFile, budget, snapshot,
    fullFileLineLimit: options.fullFileLineLimit, targetedSnippetLineLimit: options.targetedSnippetLineLimit,
  });
  if (acceptedSnippets.length === 0) return null;
  return { ...rankedFile, snippets: acceptedSnippets, truncationNotes: fileTruncationNotes };
}
