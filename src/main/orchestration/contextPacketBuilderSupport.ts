import {
  appendReasonRanges,
  clampRange,
  countLines,
  getSelectionRange,
  groupRanges,
  sliceLines,
  type SnippetContext,
  type SnippetRangeEntry,
} from './contextPacketBuilderHelpers';
import type { ContextFileSnapshot } from './contextSelectionSupport';
import type {
  ContextBudgetSummary,
  ContextSnippet,
  ContextSnippetRange,
  ContextTruncationNote,
  LiveIdeState,
  RankedContextFile,
} from './types';

export const DEFAULT_MAX_FILES = 10;
export const DEFAULT_MAX_BYTES = 48_000;
export const DEFAULT_MAX_TOKENS = 12_000;
export const DEFAULT_MAX_SNIPPETS_PER_FILE = 4;
export const DEFAULT_FULL_FILE_LINE_LIMIT = 80;
export const DEFAULT_TARGETED_SNIPPET_LINE_LIMIT = 60;

export interface ContextBudgetProfile {
  maxFiles: number;
  maxBytes: number;
  maxTokens: number;
  fullFileLineLimit: number;
  targetedSnippetLineLimit: number;
  maxSnippetsPerFile: number;
}

export function getModelBudgets(model: string): ContextBudgetProfile {
  const isOpus = model.includes('opus');
  const isSonnet = model.includes('sonnet');

  if (isOpus) {
    return {
      maxFiles: 20,
      maxBytes: 128_000,
      maxTokens: 32_000,
      fullFileLineLimit: 250,
      targetedSnippetLineLimit: 120,
      maxSnippetsPerFile: 6,
    };
  }

  if (isSonnet) {
    return {
      maxFiles: 14,
      maxBytes: 72_000,
      maxTokens: 18_000,
      fullFileLineLimit: 120,
      targetedSnippetLineLimit: 80,
      maxSnippetsPerFile: 5,
    };
  }

  return {
    maxFiles: 10,
    maxBytes: 48_000,
    maxTokens: 12_000,
    fullFileLineLimit: 80,
    targetedSnippetLineLimit: 60,
    maxSnippetsPerFile: 4,
  };
}

function estimateTokens(byteCount: number): number {
  return Math.ceil(byteCount / 3.2);
}

export function deriveSnippetCandidates(
  file: RankedContextFile,
  snapshot: ContextFileSnapshot,
  liveIdeState: LiveIdeState,
): SnippetRangeEntry[] {
  if (typeof snapshot.content !== 'string') return [];
  const totalLines = countLines(snapshot.content);
  if (totalLines === 0) return [];
  const context: SnippetContext = { file, snapshot, totalLines, liveIdeState, hunks: file.hunks };
  const ranges: SnippetRangeEntry[] = [];
  const selectionRange = getSelectionRange(file, liveIdeState);
  if (selectionRange)
    ranges.push({
      range: clampRange(selectionRange, totalLines),
      source: 'selection',
      label: 'Current editor selection',
    });
  appendReasonRanges(ranges, context);
  if (ranges.length === 0) {
    ranges.push({
      range: clampRange(
        { startLine: 1, endLine: Math.min(totalLines, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT) },
        totalLines,
      ),
      source: 'full_file',
      label: totalLines <= DEFAULT_FULL_FILE_LINE_LIMIT ? 'Full file' : 'Top of file',
    });
  }
  return groupRanges(ranges);
}

function sortSnippetCandidates(snippets: SnippetRangeEntry[]): SnippetRangeEntry[] {
  return [...snippets].sort((left, right) => {
    const leftLength = left.range.endLine - left.range.startLine;
    const rightLength = right.range.endLine - right.range.startLine;
    if (leftLength !== rightLength) return leftLength - rightLength;
    if (left.range.startLine !== right.range.startLine)
      return left.range.startLine - right.range.startLine;
    return left.range.endLine - right.range.endLine;
  });
}

export function dedupeSnippetCandidates(
  snapshot: ContextFileSnapshot,
  snippets: SnippetRangeEntry[],
): { snippets: ContextSnippet[]; truncationNotes: ContextTruncationNote[] } {
  if (typeof snapshot.content !== 'string') {
    return {
      snippets: [],
      truncationNotes: [
        { reason: 'omitted', detail: 'File content was unavailable at packet build time' },
      ],
    };
  }
  const ordered = sortSnippetCandidates(snippets);
  const finalSnippets: ContextSnippet[] = [];
  const seenRanges = new Set<string>();
  const truncationNotes: ContextTruncationNote[] = [];
  for (const snippet of ordered) {
    const key = `${snippet.range.startLine}:${snippet.range.endLine}`;
    const overlapsExisting = finalSnippets.some(
      (existing) =>
        snippet.range.startLine <= existing.range.endLine &&
        snippet.range.endLine >= existing.range.startLine,
    );
    if (seenRanges.has(key) || overlapsExisting) {
      truncationNotes.push({
        reason: 'deduped',
        detail: `Dropped overlapping snippet ${snippet.label} (${key})`,
      });
      continue;
    }
    seenRanges.add(key);
    finalSnippets.push({ ...snippet, content: sliceLines(snapshot.content, snippet.range) });
  }
  return { snippets: finalSnippets, truncationNotes };
}

export function buildBudgetSummary(
  maxBytes: number | undefined,
  maxTokens: number | undefined,
): ContextBudgetSummary {
  return {
    estimatedBytes: 0,
    estimatedTokens: 0,
    byteLimit: maxBytes,
    tokenLimit: maxTokens,
    droppedContentNotes: [],
  };
}

function resolveMaxLines(
  snippet: ContextSnippet,
  fullFileLineLimit?: number,
  targetedSnippetLineLimit?: number,
): number {
  return snippet.source === 'full_file' || snippet.source === 'manual_pin'
    ? (fullFileLineLimit ?? DEFAULT_FULL_FILE_LINE_LIMIT)
    : (targetedSnippetLineLimit ?? DEFAULT_TARGETED_SNIPPET_LINE_LIMIT);
}

function truncateSnippetToLimit(
  snippet: ContextSnippet,
  maxLines: number,
  content: string,
): ContextSnippet {
  const lineCount = Math.max(1, snippet.range.endLine - snippet.range.startLine + 1);
  if (lineCount <= maxLines) return snippet;
  const truncatedRange: ContextSnippetRange = {
    startLine: snippet.range.startLine,
    endLine: snippet.range.startLine + maxLines - 1,
  };
  return { ...snippet, range: truncatedRange, content: sliceLines(content, truncatedRange) };
}

function exceedsBudget(budget: ContextBudgetSummary, bytes: number, tokens: number): boolean {
  if (budget.byteLimit !== undefined && budget.estimatedBytes + bytes > budget.byteLimit)
    return true;
  if (budget.tokenLimit !== undefined && budget.estimatedTokens + tokens > budget.tokenLimit)
    return true;
  return false;
}

export function keepSnippetWithinBudget(options: {
  budget: ContextBudgetSummary;
  snapshot: ContextFileSnapshot;
  snippet: ContextSnippet;
  fullFileLineLimit?: number;
  targetedSnippetLineLimit?: number;
}): ContextSnippet | null {
  const { budget, snapshot, snippet } = options;
  const maxLines = resolveMaxLines(
    snippet,
    options.fullFileLineLimit,
    options.targetedSnippetLineLimit,
  );
  const candidate =
    typeof snapshot.content === 'string'
      ? truncateSnippetToLimit(snippet, maxLines, snapshot.content)
      : snippet;
  const content = candidate.content ?? '';
  const bytes = Buffer.byteLength(content, 'utf-8');
  const tokens = estimateTokens(bytes);
  if (exceedsBudget(budget, bytes, tokens)) return null;
  budget.estimatedBytes += bytes;
  budget.estimatedTokens += tokens;
  return candidate;
}
