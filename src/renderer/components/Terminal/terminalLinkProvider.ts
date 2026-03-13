/**
 * terminalLinkProvider.ts — xterm ILinkProvider that detects file paths in
 * terminal output and makes them clickable. Clicking opens the file in the
 * FileViewer via the `agent-ide:open-file` DOM CustomEvent.
 *
 * This runs alongside WebLinksAddon (which handles http/https URLs).
 * xterm supports multiple link providers — they do not conflict.
 *
 * Design constraints:
 * - No async fs checks in provideLinks (too slow for every rendered line).
 * - Conservative regex: false positives are worse than misses.
 * - Project root is used to resolve relative paths but is not required.
 */

import type { Terminal, ILinkProvider, ILink } from '@xterm/xterm'

// ── File extension whitelist ─────────────────────────────────────────────────
// Only match paths ending with known source/config file extensions.
// This prevents false positives on random text that looks path-like.
const EXT_PATTERN = '\\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|less|html|xml|yaml|yml|toml|env|sh|bash|ps1|py|rb|go|rs|java|kt|c|cpp|h|hpp|vue|svelte|astro|prisma|sql|graphql|gql|proto|txt|csv|log|conf|cfg|ini|lock|snap|test|spec|d\\.ts)';

// ── Patterns ─────────────────────────────────────────────────────────────────

// Relative paths starting with common project directories
// e.g. src/main/ipc.ts, lib/utils.ts, test/foo.spec.ts
const KNOWN_DIR_RE = new RegExp(
  '(?:^|[\\s\'"(\\[,=])' +                              // boundary
  '((?:src|lib|app|test|tests|spec|dist|build|public|assets|config|scripts|packages|node_modules)' +
  '/[\\w./@-]+' + EXT_PATTERN + ')' +                   // path
  '(?::(\\d+)(?::(\\d+))?)?' +                          // optional :line:col
  '(?=[\\s\'"\\)\\],;:]|$)',                             // trailing boundary
  'g'
);

// Explicit relative paths: ./foo/bar.ts, ../lib/utils.ts
const RELATIVE_RE = new RegExp(
  '(?:^|[\\s\'"(\\[,=])' +
  '(\\.{1,2}/[\\w./@-]+' + EXT_PATTERN + ')' +
  '(?::(\\d+)(?::(\\d+))?)?' +
  '(?=[\\s\'"\\)\\],;:]|$)',
  'g'
);

// Windows absolute paths: C:\Users\foo\bar.ts
const WIN_ABS_RE = new RegExp(
  '([A-Z]:\\\\[\\w\\\\./@ -]+' + EXT_PATTERN + ')' +
  '(?::(\\d+)(?::(\\d+))?)?' +
  '(?=[\\s\'"\\)\\],;:]|$)',
  'gi'
);

// Unix absolute paths: /home/user/project/src/foo.ts
const UNIX_ABS_RE = new RegExp(
  '(/(?:home|usr|tmp|var|opt|etc|mnt|media|Users|Library|Applications)[\\w./@-]+' + EXT_PATTERN + ')' +
  '(?::(\\d+)(?::(\\d+))?)?' +
  '(?=[\\s\'"\\)\\],;:]|$)',
  'g'
);

// ── Match result ─────────────────────────────────────────────────────────────

interface FileMatch {
  /** The file path as found in the text (before resolution) */
  path: string
  /** 0-based character offset where the path starts in the line */
  startIndex: number
  /** Length of the path text (excludes :line:col suffix) */
  pathLength: number
  /** 1-based line number, if present */
  line?: number
  /** 1-based column number, if present */
  col?: number
}

// ── Matching logic ───────────────────────────────────────────────────────────

function findFileMatches(lineText: string): FileMatch[] {
  const matches: FileMatch[] = [];
  const seen = new Set<string>(); // dedupe overlapping matches

  const patterns = [KNOWN_DIR_RE, RELATIVE_RE, WIN_ABS_RE, UNIX_ABS_RE];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(lineText)) !== null) {
      const filePath = m[1];
      if (!filePath) continue;

      // Find the actual start of the captured group within the full match.
      // The full match may include a leading boundary character.
      const startIndex = m.index + m[0].indexOf(filePath);

      const key = `${startIndex}:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const line = m[2] ? parseInt(m[2], 10) : undefined;
      const col = m[3] ? parseInt(m[3], 10) : undefined;

      matches.push({
        path: filePath,
        startIndex,
        pathLength: filePath.length,
        line,
        col,
      });
    }
  }

  return matches;
}

// ── Path resolution (no Node.js path module) ─────────────────────────────────

function resolveFilePath(rawPath: string, projectRoot: string | null): string {
  // Normalize backslashes to forward slashes
  let p = rawPath.replace(/\\/g, '/');

  // Already absolute
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) {
    return p;
  }

  // Relative path — resolve against project root
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
    if (p.startsWith('./')) {
      p = p.slice(2);
    }
    // Handle ../ segments
    const rootParts = root.split('/');
    const pathParts = p.split('/');
    const resolvedParts = [...rootParts];
    for (const part of pathParts) {
      if (part === '..') {
        resolvedParts.pop();
      } else if (part !== '.') {
        resolvedParts.push(part);
      }
    }
    return resolvedParts.join('/');
  }

  return p;
}

// ── Match to ILink conversion ──────────────────────────────────────────────

function computeLinkLength(match: FileMatch): number {
  let fullLength = match.pathLength;
  if (match.line != null) {
    fullLength += `:${match.line}`.length;
    if (match.col != null) {
      fullLength += `:${match.col}`.length;
    }
  }
  return fullLength;
}

function matchToLink(
  match: FileMatch,
  lineNumber: number,
  projectRoot: string | null,
): ILink {
  const fullLength = computeLinkLength(match);
  return {
    range: {
      start: { x: match.startIndex + 1, y: lineNumber },
      end: { x: match.startIndex + fullLength, y: lineNumber },
    },
    text: match.path,
    decorations: { underline: true, pointerCursor: true },
    activate(_event: MouseEvent, text: string): void {
      const resolved = resolveFilePath(text, projectRoot);
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-file', {
          detail: { filePath: resolved, line: match.line, col: match.col },
        })
      );
    },
  };
}

// ── provideLinks callback ─────────────────────────────────────────────────

function provideLinks(
  term: Terminal,
  getProjectRoot: () => string | null,
  lineNumber: number,
  callback: (links: ILink[] | undefined) => void,
): void {
  const line = term.buffer.active.getLine(lineNumber - 1);
  if (!line) { callback(undefined); return; }

  const lineText = line.translateToString(true);
  if (!lineText.trim()) { callback(undefined); return; }

  const matches = findFileMatches(lineText);
  if (matches.length === 0) { callback(undefined); return; }

  const projectRoot = getProjectRoot();
  callback(matches.map((m) => matchToLink(m, lineNumber, projectRoot)));
}

// ── Link provider registration ───────────────────────────────────────────────

/**
 * Register a file path link provider on the given terminal.
 * Returns a dispose function to unregister.
 */
export function registerFilePathLinks(
  term: Terminal,
  getProjectRoot: () => string | null,
): { dispose(): void } {
  const provider: ILinkProvider = {
    provideLinks(ln: number, cb: (links: ILink[] | undefined) => void) {
      provideLinks(term, getProjectRoot, ln, cb);
    },
  };
  return term.registerLinkProvider(provider);
}
