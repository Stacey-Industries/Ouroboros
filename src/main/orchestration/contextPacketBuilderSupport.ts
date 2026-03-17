import path from 'path'
import type { ContextFileSnapshot } from './contextSelectionSupport'
import type {
  ContextBudgetSummary,
  ContextSnippet,
  ContextSnippetRange,
  ContextTruncationNote,
  GitDiffHunk,
  LiveIdeState,
  RankedContextFile,
} from './types'

export const DEFAULT_MAX_FILES = 10
export const DEFAULT_MAX_BYTES = 48_000
export const DEFAULT_MAX_TOKENS = 12_000
export const DEFAULT_MAX_SNIPPETS_PER_FILE = 4
export const DEFAULT_FULL_FILE_LINE_LIMIT = 80
export const DEFAULT_TARGETED_SNIPPET_LINE_LIMIT = 60

export interface ContextBudgetProfile {
  maxFiles: number
  maxBytes: number
  maxTokens: number
  fullFileLineLimit: number
  targetedSnippetLineLimit: number
  maxSnippetsPerFile: number
}

export function getModelBudgets(model: string): ContextBudgetProfile {
  const isOpus = model.includes('opus')
  const isSonnet = model.includes('sonnet')

  if (isOpus) {
    return {
      maxFiles: 20,
      maxBytes: 128_000,
      maxTokens: 32_000,
      fullFileLineLimit: 250,
      targetedSnippetLineLimit: 120,
      maxSnippetsPerFile: 6,
    }
  }

  if (isSonnet) {
    return {
      maxFiles: 14,
      maxBytes: 72_000,
      maxTokens: 18_000,
      fullFileLineLimit: 120,
      targetedSnippetLineLimit: 80,
      maxSnippetsPerFile: 5,
    }
  }

  return {
    maxFiles: 10,
    maxBytes: 48_000,
    maxTokens: 12_000,
    fullFileLineLimit: 80,
    targetedSnippetLineLimit: 60,
    maxSnippetsPerFile: 4,
  }
}

interface SnippetContext {
  file: RankedContextFile
  snapshot: ContextFileSnapshot
  totalLines: number
  liveIdeState: LiveIdeState
  hunks?: GitDiffHunk[]
}

function toPathKey(filePath: string): string {
  return path.normalize(filePath).toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countLines(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length
}

function estimateTokens(byteCount: number): number {
  return Math.ceil(byteCount / 4)
}

function clampRange(range: ContextSnippetRange, totalLines: number): ContextSnippetRange {
  const startLine = Math.max(1, Math.min(range.startLine, totalLines))
  const endLine = Math.max(startLine, Math.min(range.endLine, totalLines))
  return { startLine, endLine }
}

function sliceLines(content: string, range: ContextSnippetRange): string {
  return content.split(/\r?\n/).slice(range.startLine - 1, range.endLine).join('\n')
}

function mergeSnippetRanges(ranges: ContextSnippetRange[]): ContextSnippetRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine)
  const merged: ContextSnippetRange[] = [{ ...sorted[0] }]
  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    if (range.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, range.endLine)
      continue
    }
    merged.push({ ...range })
  }
  return merged
}

function findKeywordRanges(content: string, detail: string): ContextSnippetRange[] {
  const match = detail.match(/Matches keywords: (.+)$/)
  if (!match) return []
  const keywords = match[1].split(',').map((value) => value.trim()).filter(Boolean)
  if (keywords.length === 0) return []
  const ranges = content.split(/\r?\n/).flatMap((line, index) =>
    keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(line))
      ? [{ startLine: index + 1, endLine: index + 3 }]
      : [],
  )
  return mergeSnippetRanges(ranges)
}

function findImportRanges(content: string): ContextSnippetRange[] {
  const ranges = content.split(/\r?\n/).flatMap((line, index) =>
    /\b(import|export)\b|require\(/.test(line)
      ? [{ startLine: index + 1, endLine: index + 2 }]
      : [],
  )
  return mergeSnippetRanges(ranges)
}

function findLineWindow(totalLines: number, centerLine: number, lineLimit: number): ContextSnippetRange {
  const half = Math.max(1, Math.floor(lineLimit / 2))
  return clampRange({ startLine: centerLine - half, endLine: centerLine - half + lineLimit - 1 }, totalLines)
}

function groupRanges(
  ranges: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
): Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }> {
  const grouped = new Map<string, { source: ContextSnippet['source']; label: string; ranges: ContextSnippetRange[] }>()
  for (const item of ranges) {
    const key = `${item.source}:${item.label}`
    const group = grouped.get(key)
    if (group) {
      group.ranges.push(item.range)
      continue
    }
    grouped.set(key, { source: item.source, label: item.label, ranges: [item.range] })
  }
  return Array.from(grouped.values()).flatMap((group) =>
    mergeSnippetRanges(group.ranges).map((range) => ({ range, source: group.source, label: group.label })),
  )
}

function getSelectionRange(file: RankedContextFile, liveIdeState: LiveIdeState): ContextSnippetRange | undefined {
  const dirtyBuffer = liveIdeState.dirtyBuffers.find((buffer) => toPathKey(buffer.filePath) === toPathKey(file.filePath))
  if (dirtyBuffer?.selection) return dirtyBuffer.selection
  if (liveIdeState.activeFile && toPathKey(liveIdeState.activeFile) === toPathKey(file.filePath) && liveIdeState.selection) {
    return liveIdeState.selection
  }
  return undefined
}

function appendRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  ranges: ContextSnippetRange[],
  source: ContextSnippet['source'],
  label: string,
): void {
  for (const range of ranges) target.push({ range, source, label })
}

function appendDirtyReasonRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  context: SnippetContext,
): void {
  const dirtyBuffer = context.liveIdeState.dirtyBuffers.find((buffer) => toPathKey(buffer.filePath) === toPathKey(context.file.filePath))
  if (!dirtyBuffer) return
  const dirtyRange = dirtyBuffer.selection ?? findLineWindow(context.totalLines, 1, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT)
  target.push({ range: clampRange(dirtyRange, context.totalLines), source: 'dirty_buffer', label: 'Unsaved buffer snapshot' })
}

function appendKeywordReasonRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  detail: string,
  content: string | null,
): void {
  if (!content) return
  appendRanges(target, findKeywordRanges(content, detail), 'keyword_match', 'Keyword match')
}

function appendImportReasonRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  content: string | null,
): void {
  if (!content) return
  appendRanges(target, findImportRanges(content), 'import_adjacency', 'Import adjacency')
}

function appendWindowReasonRange(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  totalLines: number,
  source: 'diff_hunk' | 'diagnostic',
  label: string,
): void {
  target.push({ range: findLineWindow(totalLines, 1, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT), source, label })
}

function appendDiffHunkRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  hunks: GitDiffHunk[] | undefined,
  totalLines: number,
): void {
  if (!hunks || hunks.length === 0) {
    appendWindowReasonRange(target, totalLines, 'diff_hunk', 'Changed file (no hunk detail)')
    return
  }

  const CONTEXT_PADDING = 5
  for (const hunk of hunks.slice(0, 6)) {
    const range: ContextSnippetRange = {
      startLine: Math.max(1, hunk.startLine - CONTEXT_PADDING),
      endLine: Math.min(totalLines, hunk.startLine + hunk.lineCount + CONTEXT_PADDING),
    }
    target.push({
      range: clampRange(range, totalLines),
      source: 'diff_hunk',
      label: `Diff hunk at line ${hunk.startLine}`,
    })
  }
}

function appendExplicitReasonRange(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  totalLines: number,
): void {
  target.push({
    range: clampRange({ startLine: 1, endLine: Math.min(totalLines, DEFAULT_FULL_FILE_LINE_LIMIT) }, totalLines),
    source: 'manual_pin',
    label: 'Explicit context inclusion',
  })
}

function appendReasonRanges(
  target: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
  context: SnippetContext,
): void {
  for (const reason of context.file.reasons) {
    if (reason.kind === 'dirty_buffer') appendDirtyReasonRanges(target, context)
    if (reason.kind === 'keyword_match') appendKeywordReasonRanges(target, reason.detail, context.snapshot.content)
    if (reason.kind === 'import_adjacency') appendImportReasonRanges(target, context.snapshot.content)
    if (reason.kind === 'git_diff') appendDiffHunkRanges(target, context.hunks, context.totalLines)
    if (reason.kind === 'diagnostic') appendWindowReasonRange(target, context.totalLines, 'diagnostic', 'Diagnostics file context')
    if (reason.kind === 'user_selected' || reason.kind === 'pinned' || reason.kind === 'included') appendExplicitReasonRange(target, context.totalLines)
  }
}

export function deriveSnippetCandidates(
  file: RankedContextFile,
  snapshot: ContextFileSnapshot,
  liveIdeState: LiveIdeState,
): Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }> {
  if (typeof snapshot.content !== 'string') return []
  const totalLines = countLines(snapshot.content)
  if (totalLines === 0) return []
  const context: SnippetContext = { file, snapshot, totalLines, liveIdeState, hunks: file.hunks }
  const ranges: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }> = []
  const selectionRange = getSelectionRange(file, liveIdeState)
  if (selectionRange) ranges.push({ range: clampRange(selectionRange, totalLines), source: 'selection', label: 'Current editor selection' })
  appendReasonRanges(ranges, context)
  if (ranges.length === 0) {
    ranges.push({
      range: clampRange({ startLine: 1, endLine: Math.min(totalLines, DEFAULT_TARGETED_SNIPPET_LINE_LIMIT) }, totalLines),
      source: 'full_file',
      label: totalLines <= DEFAULT_FULL_FILE_LINE_LIMIT ? 'Full file' : 'Top of file',
    })
  }
  return groupRanges(ranges)
}

export function dedupeSnippetCandidates(
  snapshot: ContextFileSnapshot,
  snippets: Array<{ range: ContextSnippetRange; source: ContextSnippet['source']; label: string }>,
): { snippets: ContextSnippet[]; truncationNotes: ContextTruncationNote[] } {
  if (typeof snapshot.content !== 'string') {
    return { snippets: [], truncationNotes: [{ reason: 'omitted', detail: 'File content was unavailable at packet build time' }] }
  }
  const ordered = [...snippets].sort((left, right) => {
    const leftLength = left.range.endLine - left.range.startLine
    const rightLength = right.range.endLine - right.range.startLine
    if (leftLength !== rightLength) return leftLength - rightLength
    if (left.range.startLine !== right.range.startLine) return left.range.startLine - right.range.startLine
    return left.range.endLine - right.range.endLine
  })
  const finalSnippets: ContextSnippet[] = []
  const seenRanges = new Set<string>()
  const truncationNotes: ContextTruncationNote[] = []
  for (const snippet of ordered) {
    const key = `${snippet.range.startLine}:${snippet.range.endLine}`
    const overlapsExisting = finalSnippets.some((existing) => snippet.range.startLine <= existing.range.endLine && snippet.range.endLine >= existing.range.startLine)
    if (seenRanges.has(key) || overlapsExisting) {
      truncationNotes.push({ reason: 'deduped', detail: `Dropped overlapping snippet ${snippet.label} (${key})` })
      continue
    }
    seenRanges.add(key)
    finalSnippets.push({ ...snippet, content: sliceLines(snapshot.content, snippet.range) })
  }
  return { snippets: finalSnippets, truncationNotes }
}

export function buildBudgetSummary(maxBytes: number | undefined, maxTokens: number | undefined): ContextBudgetSummary {
  return { estimatedBytes: 0, estimatedTokens: 0, byteLimit: maxBytes, tokenLimit: maxTokens, droppedContentNotes: [] }
}

export function keepSnippetWithinBudget(options: {
  budget: ContextBudgetSummary
  snapshot: ContextFileSnapshot
  snippet: ContextSnippet
  fullFileLineLimit?: number
  targetedSnippetLineLimit?: number
}): ContextSnippet | null {
  const { budget, snapshot, snippet } = options
  const maxLines = snippet.source === 'full_file' || snippet.source === 'manual_pin'
    ? (options.fullFileLineLimit ?? DEFAULT_FULL_FILE_LINE_LIMIT)
    : (options.targetedSnippetLineLimit ?? DEFAULT_TARGETED_SNIPPET_LINE_LIMIT)
  const lineCount = Math.max(1, snippet.range.endLine - snippet.range.startLine + 1)
  const candidate = lineCount > maxLines && typeof snapshot.content === 'string'
    ? { ...snippet, range: { startLine: snippet.range.startLine, endLine: snippet.range.startLine + maxLines - 1 }, content: sliceLines(snapshot.content, { startLine: snippet.range.startLine, endLine: snippet.range.startLine + maxLines - 1 }) }
    : snippet
  const content = candidate.content ?? ''
  const bytes = Buffer.byteLength(content, 'utf-8')
  const tokens = estimateTokens(bytes)
  if ((budget.byteLimit !== undefined && budget.estimatedBytes + bytes > budget.byteLimit) || (budget.tokenLimit !== undefined && budget.estimatedTokens + tokens > budget.tokenLimit)) {
    return null
  }
  budget.estimatedBytes += bytes
  budget.estimatedTokens += tokens
  return candidate
}
