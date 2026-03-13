import { useMemo } from 'react';

/**
 * A foldable region: the line at `start` is the fold header,
 * lines `start+1` through `end` (inclusive, 0-indexed) get hidden when folded.
 */
export interface FoldRange {
  /** 0-based line index of the fold header */
  start: number;
  /** 0-based line index of the last line in the fold (inclusive) */
  end: number;
}

// ── Bracket-based fold detection ─────────────────────────────────────────────

const OPEN_BRACKETS: Record<string, string> = { '{': '}', '(': ')', '[': ']' };

function addRange(
  ranges: FoldRange[],
  seen: Set<string>,
  start: number,
  end: number,
): void {
  if (end <= start) return;
  const key = `${start}:${end}`;
  if (seen.has(key)) return;
  seen.add(key);
  ranges.push({ start, end });
}

interface BracketPair {
  openChar: string;
  closeChar: string;
}

interface BracketScanState {
  ranges: FoldRange[];
  seen: Set<string>;
  stack: number[];
}

function getQuoteChar(ch: string): string | null {
  return ch === '"' || ch === "'" || ch === '`' ? ch : null;
}

function updateStringState(
  line: string,
  charIndex: number,
  ch: string,
  inString: string | null,
): { next: string | null; consumed: boolean } {
  if (!inString) {
    const quote = getQuoteChar(ch);
    return quote ? { next: quote, consumed: true } : { next: null, consumed: false };
  }
  if (ch === inString && line[charIndex - 1] !== '\\') {
    return { next: null, consumed: true };
  }
  return { next: inString, consumed: true };
}

function isLineComment(line: string, charIndex: number, ch: string): boolean {
  return ch === '/' && line[charIndex + 1] === '/';
}

function handleBracketChar(
  ch: string,
  lineIndex: number,
  pair: BracketPair,
  state: BracketScanState,
): boolean {
  if (ch === pair.openChar) {
    state.stack.push(lineIndex);
    return true;
  }
  if (ch !== pair.closeChar || state.stack.length === 0) return false;
  const startLine = state.stack.pop();
  if (startLine !== undefined) addRange(state.ranges, state.seen, startLine, lineIndex);
  return true;
}

function scanBracketLine(
  line: string,
  lineIndex: number,
  pair: BracketPair,
  state: BracketScanState,
): void {
  let inString: string | null = null;
  for (let charIndex = 0; charIndex < line.length; charIndex++) {
    const ch = line[charIndex];
    const stringState = updateStringState(line, charIndex, ch, inString);
    inString = stringState.next;
    if (stringState.consumed) {
      continue;
    }
    if (isLineComment(line, charIndex, ch)) break;
    handleBracketChar(ch, lineIndex, pair, state);
  }
}

function collectBracketRanges(
  lines: string[],
  ranges: FoldRange[],
  seen: Set<string>,
): void {
  for (const [openChar, closeChar] of Object.entries(OPEN_BRACKETS)) {
    const state: BracketScanState = { ranges, seen, stack: [] };
    const pair = { openChar, closeChar };
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      scanBracketLine(lines[lineIndex], lineIndex, pair, state);
    }
  }
}

function isIndentBlockHeader(line: string): boolean {
  return (
    line.endsWith(':') ||
    /^(def |class |if |elif |else:|for |while |with |try:|except |finally:| *async )/.test(line)
  );
}

function findIndentedBlockEnd(
  lines: string[],
  startIndex: number,
  baseIndent: number,
): number {
  let end = startIndex + 1;
  for (let lineIndex = startIndex + 2; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.trim().length === 0) continue;
    if (getIndent(line) <= baseIndent) break;
    end = lineIndex;
  }
  return end;
}

function collectIndentRanges(
  lines: string[],
  ranges: FoldRange[],
  seen: Set<string>,
): void {
  const bracketStarts = new Set(ranges.map((range) => range.start));
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex++) {
    if (bracketStarts.has(lineIndex)) continue;
    const line = lines[lineIndex];
    if (line.trim().length === 0) continue;
    const baseIndent = getIndent(line);
    const nextLine = lines[lineIndex + 1];
    if (nextLine.trim().length === 0 || getIndent(nextLine) <= baseIndent) continue;
    if (!isIndentBlockHeader(line.trim())) continue;
    addRange(ranges, seen, lineIndex, findIndentedBlockEnd(lines, lineIndex, baseIndent));
  }
}
/**
 * Detect foldable ranges by matching brackets and by indentation.
 * Returns an array of FoldRange sorted by start line.
 */
function detectFoldRanges(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];
  const seen = new Set<string>();
  collectBracketRanges(lines, ranges, seen);
  collectIndentRanges(lines, ranges, seen);
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  return ranges;
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  let count = 0;
  for (const ch of match[1]) {
    count += ch === '\t' ? 4 : 1;
  }
  return count;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Memoized fold range detection. Only recomputes when `content` changes.
 * Returns:
 *  - `foldRanges`: all detected foldable regions
 *  - `foldableLines`: a Map from start-line to its FoldRange, for O(1) gutter lookup
 */
export function useFoldRanges(content: string | null): {
  foldRanges: FoldRange[];
  foldableLines: Map<number, FoldRange>;
} {
  return useMemo(() => {
    if (!content) return { foldRanges: [], foldableLines: new Map() };

    const lines = content.split('\n');
    const foldRanges = detectFoldRanges(lines);

    const foldableLines = new Map<number, FoldRange>();
    for (const range of foldRanges) {
      // If multiple ranges start on the same line, keep the largest
      const existing = foldableLines.get(range.start);
      if (!existing || range.end > existing.end) {
        foldableLines.set(range.start, range);
      }
    }

    return { foldRanges, foldableLines };
  }, [content]);
}
