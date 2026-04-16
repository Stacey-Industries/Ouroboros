/**
 * FileRefResolver.ts — Pure helper for extracting file references from agent output.
 *
 * Recognises path-like tokens in free text. Zero dependencies; safe to import in
 * all three processes (main, preload, renderer).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileRef {
  /** The raw matched string as it appeared in the text. */
  raw: string;
  /** Normalised path (no trailing `:line:col`). */
  path: string;
  /** 1-based line number, if present. */
  line?: number;
  /** 1-based column number, if present. */
  col?: number;
  /** Start offset (inclusive) in the original text. */
  start: number;
  /** End offset (exclusive) in the original text. */
  end: number;
}

// ── Regex ────────────────────────────────────────────────────────────────────

/**
 * Matches a file-path token with optional :line or :line:col suffix.
 *
 * Construction rules (to avoid false positives):
 *  - Preceded by a word boundary, whitespace, or start-of-string.
 *  - NOT preceded by `://` (URL scheme separator) or `[` / `(` (Markdown links).
 *  - Path must contain at least one `/` OR end with a dot-extension (.ts, .py …).
 *    This prevents matching bare words like "foo" or numbers like "123".
 *  - Cannot start with a digit (prevents matching version strings like "3.14").
 *  - Scheme-like prefixes (https://, ftp://, etc.) are rejected via negative
 *    look-behind on the `://` character sequence that would precede the match.
 *
 * The regex is compiled once and reused; reset `lastIndex` before each call.
 */
const FILE_REF_RE =
  /(?<![:/([])(?:^|(?<=[\s,;:"'`]))((?:\.{1,2}\/|\/)?[A-Za-z_.][^\s:()[\]{}<>"'`]*(?:\/[^\s:()[\]{}<>"'`]*)+|(?:\.{1,2}\/|\/)[^\s:()[\]{}<>"'`]+|[A-Za-z_][^\s:()[\]{}<>"'`]*\.[A-Za-z]{1,10})(?::(\d+)(?::(\d+))?)?(?=[\s,;)"'`\]]|$)/gm;

// ── Extension allowlist ───────────────────────────────────────────────────────

/**
 * When a path has NO `/` separator (bare filename), only accept it if its
 * extension is on this allowlist. This prevents plain words ending in `.` + two
 * chars from being treated as file refs.
 */
const KNOWN_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'cs', 'cpp', 'c', 'h',
  'md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml', 'env',
  'html', 'css', 'scss', 'less', 'svg', 'vue', 'svelte',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'sql', 'graphql', 'proto',
  'lock', 'sum', 'mod',
  'dockerfile', 'gitignore', 'editorconfig',
]);

// ── URL prefix rejection ──────────────────────────────────────────────────────

const URL_SCHEME_RE = /^[A-Za-z][A-Za-z\d+\-.]*:\/\//;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract all file references from `text`.
 *
 * Does NOT mutate the regex (uses matchAll internally).
 * Returns an array sorted by start offset.
 */
export function extractFileRefs(text: string): FileRef[] {
  const results: FileRef[] = [];

  // matchAll creates a new iterator; regex must have the `g` flag but we never
  // need to reset lastIndex manually when using matchAll.
  const re = new RegExp(FILE_REF_RE.source, FILE_REF_RE.flags);

  for (const m of text.matchAll(re)) {
    const rawPath = m[1];
    if (!rawPath) continue;
    if (isRejected(rawPath)) continue;

    const raw = m[0].trimStart();
    const matchStart = (m.index ?? 0) + (m[0].length - raw.length);

    const lineNum = m[2] ? parseInt(m[2], 10) : undefined;
    const colNum = m[3] ? parseInt(m[3], 10) : undefined;

    // Reconstruct raw with optional :line:col
    const suffix =
      lineNum !== undefined
        ? colNum !== undefined
          ? `:${lineNum}:${colNum}`
          : `:${lineNum}`
        : '';

    const fullRaw = rawPath + suffix;

    results.push({
      raw: fullRaw,
      path: rawPath,
      line: lineNum,
      col: colNum,
      start: matchStart,
      end: matchStart + fullRaw.length,
    });
  }

  return results;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function isRejected(candidate: string): boolean {
  // Reject URLs
  if (URL_SCHEME_RE.test(candidate)) return true;

  // Reject pure numbers (no alpha chars other than digits/dots/colons)
  if (/^\d[\d.]*$/.test(candidate)) return true;

  // Reject if no slash — only accept if it has a known file extension
  if (!candidate.includes('/')) {
    const dotIdx = candidate.lastIndexOf('.');
    if (dotIdx === -1) return true;
    const ext = candidate.slice(dotIdx + 1).toLowerCase();
    if (!KNOWN_EXTENSIONS.has(ext)) return true;
  }

  return false;
}
