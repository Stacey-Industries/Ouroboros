/**
 * lineDiff.ts — Pure per-line LCS diff for unified diff rendering.
 *
 * Wave 37 Phase B. No external dependencies. Takes two strings, splits on
 * newlines, and returns a sequence of diff lines with change kind.
 *
 * Deliberately kept small — only line-level granularity is needed here.
 * For word-level diffs see AgentChat/wordDiff.ts.
 */

export type LineDiffKind = 'equal' | 'insert' | 'delete'

export interface DiffLine {
  kind: LineDiffKind
  text: string
}

// ── LCS ───────────────────────────────────────────────────────────────────────

function buildLcs(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => new Array<number>(n + 1).fill(0),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

interface TraceArgs {
  dp: number[][]
  a: string[]
  b: string[]
  i: number
  j: number
}

function traceback({ dp, a, b, i, j }: TraceArgs): DiffLine[] {
  if (i === 0 && j === 0) return []
  if (i === 0) {
    return [
      ...traceback({ dp, a, b, i: 0, j: j - 1 }),
      { kind: 'insert', text: b[j - 1] },
    ]
  }
  if (j === 0) {
    return [
      ...traceback({ dp, a, b, i: i - 1, j: 0 }),
      { kind: 'delete', text: a[i - 1] },
    ]
  }
  if (a[i - 1] === b[j - 1]) {
    return [
      ...traceback({ dp, a, b, i: i - 1, j: j - 1 }),
      { kind: 'equal', text: a[i - 1] },
    ]
  }
  if (dp[i - 1][j] >= dp[i][j - 1]) {
    return [
      ...traceback({ dp, a, b, i: i - 1, j }),
      { kind: 'delete', text: a[i - 1] },
    ]
  }
  return [
    ...traceback({ dp, a, b, i, j: j - 1 }),
    { kind: 'insert', text: b[j - 1] },
  ]
}

// ── Reorder ───────────────────────────────────────────────────────────────────

/**
 * Reorder adjacent insert/delete groups so deletes always precede inserts,
 * matching unified-diff convention. This is a post-processing step because
 * the LCS traceback can emit inserts before deletes depending on dp tie-breaks.
 */
function reorderDeletionsFirst(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind === 'equal') {
      out.push(lines[i++])
      continue
    }
    // Collect a contiguous run of inserts and deletes
    const deletes: DiffLine[] = []
    const inserts: DiffLine[] = []
    while (i < lines.length && lines[i].kind !== 'equal') {
      if (lines[i].kind === 'delete') deletes.push(lines[i])
      else inserts.push(lines[i])
      i++
    }
    // Emit deletes before inserts
    out.push(...deletes, ...inserts)
  }
  return out
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a per-line unified diff between two multi-line strings.
 * Returns DiffLine[] in output order (deletes before inserts within each hunk).
 */
export function lineDiff(textA: string, textB: string): DiffLine[] {
  if (textA === '' && textB === '') return []
  const linesA = textA.split('\n')
  const linesB = textB.split('\n')
  const dp = buildLcs(linesA, linesB)
  const raw = traceback({ dp, a: linesA, b: linesB, i: linesA.length, j: linesB.length })
  return reorderDeletionsFirst(raw)
}
