/**
 * wordDiff.ts — Pure per-word diff using longest-common-subsequence.
 *
 * No external dependencies. Takes two strings, tokenises on whitespace,
 * and returns a sequence of diff tokens with change type.
 *
 * Wave 36 Phase F — compare-providers diff view.
 */

export type DiffKind = 'equal' | 'insert' | 'delete';

export interface DiffToken {
  kind: DiffKind;
  text: string;
}

// ─── LCS ──────────────────────────────────────────────────────────────────────

function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

interface TraceArgs { dp: number[][]; a: string[]; b: string[]; i: number; j: number }

function traceback({ dp, a, b, i, j }: TraceArgs): DiffToken[] {
  if (i === 0 && j === 0) return [];
  if (i === 0) return [...traceback({ dp, a, b, i: 0, j: j - 1 }), { kind: 'insert', text: b[j - 1] }];
  if (j === 0) return [...traceback({ dp, a, b, i: i - 1, j: 0 }), { kind: 'delete', text: a[i - 1] }];
  if (a[i - 1] === b[j - 1]) {
    return [...traceback({ dp, a, b, i: i - 1, j: j - 1 }), { kind: 'equal', text: a[i - 1] }];
  }
  if (dp[i - 1][j] >= dp[i][j - 1]) {
    return [...traceback({ dp, a, b, i: i - 1, j }), { kind: 'delete', text: a[i - 1] }];
  }
  return [...traceback({ dp, a, b, i, j: j - 1 }), { kind: 'insert', text: b[j - 1] }];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a per-word diff between two strings.
 * Tokens are split on whitespace boundaries; whitespace is preserved as
 * separate tokens so the result can be joined back to readable text.
 */
export function wordDiff(textA: string, textB: string): DiffToken[] {
  const wordsA = tokenise(textA);
  const wordsB = tokenise(textB);
  if (wordsA.length === 0 && wordsB.length === 0) return [];
  const dp = buildLcsTable(wordsA, wordsB);
  return traceback({ dp, a: wordsA, b: wordsB, i: wordsA.length, j: wordsB.length });
}

/** Split text into word and whitespace tokens, preserving original spacing. */
function tokenise(text: string): string[] {
  return text.match(/\S+|\s+/g) ?? [];
}
