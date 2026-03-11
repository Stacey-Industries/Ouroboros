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
const CLOSE_TO_OPEN: Record<string, string> = { '}': '{', ')': '(', ']': '[' };

/**
 * Detect foldable ranges by matching brackets and by indentation.
 * Returns an array of FoldRange sorted by start line.
 */
function detectFoldRanges(lines: string[]): FoldRange[] {
  const ranges: FoldRange[] = [];
  const seen = new Set<string>();

  // ── Pass 1: Bracket matching ──
  // For each bracket type, walk the file and match open/close pairs.
  for (const openChar of Object.keys(OPEN_BRACKETS)) {
    const closeChar = OPEN_BRACKETS[openChar];
    const stack: number[] = []; // stack of line indices where this bracket opened

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Walk characters, skipping strings and comments (simple heuristic)
      let inString: string | null = null;
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];

        // Simple string/comment skip
        if (inString) {
          if (ch === inString && line[c - 1] !== '\\') inString = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
          continue;
        }
        // Skip line comments
        if (ch === '/' && line[c + 1] === '/') break;

        if (ch === openChar) {
          stack.push(i);
        } else if (ch === closeChar && stack.length > 0) {
          const startLine = stack.pop()!;
          // Only create a fold if it spans at least 2 lines
          if (i > startLine) {
            const key = `${startLine}:${i}`;
            if (!seen.has(key)) {
              seen.add(key);
              ranges.push({ start: startLine, end: i });
            }
          }
        }
      }
    }
  }

  // ── Pass 2: Indentation-based folds (Python, YAML, etc.) ──
  // A line followed by one or more lines with strictly greater indentation is foldable.
  // Only add if no bracket-based fold already starts on that line.
  const bracketStarts = new Set(ranges.map((r) => r.start));

  for (let i = 0; i < lines.length - 1; i++) {
    if (bracketStarts.has(i)) continue;

    const line = lines[i];
    if (line.trim().length === 0) continue;

    const baseIndent = getIndent(line);
    const nextIndent = getIndent(lines[i + 1]);

    // The next non-empty line must have greater indentation
    if (lines[i + 1].trim().length === 0 || nextIndent <= baseIndent) continue;

    // Check if the line looks like a block header
    const trimmed = line.trim();
    const isBlockHeader =
      trimmed.endsWith(':') || // Python / YAML
      /^(def |class |if |elif |else:|for |while |with |try:|except |finally:| *async )/.test(trimmed);

    if (!isBlockHeader) continue;

    // Find the end of the indented block
    let end = i + 1;
    for (let j = i + 2; j < lines.length; j++) {
      const jLine = lines[j];
      if (jLine.trim().length === 0) {
        // Empty lines don't break the block, but if followed by
        // a line at base indent or less, stop here.
        continue;
      }
      if (getIndent(jLine) > baseIndent) {
        end = j;
      } else {
        break;
      }
    }

    if (end > i) {
      const key = `${i}:${end}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({ start: i, end });
      }
    }
  }

  // Sort by start line, then by end (larger ranges first for nesting)
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
