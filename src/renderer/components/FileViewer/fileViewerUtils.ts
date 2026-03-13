/**
 * fileViewerUtils — shared utility functions for the FileViewer component.
 *
 * Extracted from FileViewer.tsx to reduce file size and improve testability.
 * Contains language detection, Shiki theme mapping, highlighter singleton,
 * and fold computation logic.
 */

import type { Highlighter, BundledTheme } from 'shiki';
import type { FoldRange } from './useFoldRanges';

// ─── Language detection ───────────────────────────────────────────────────────

export function getLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'jsonc',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    md: 'markdown',
    mdx: 'mdx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    bat: 'batch',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    php: 'php',
    sql: 'sql',
    prisma: 'prisma',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'dockerfile',
    txt: 'text',
    log: 'text',
    env: 'ini',
  };
  return langMap[ext] ?? 'text';
}

// ─── IDE theme -> Shiki theme mapping ─────────────────────────────────────────

const IDE_TO_SHIKI_THEME: Record<string, BundledTheme> = {
  retro: 'monokai',
  modern: 'github-dark',
  warp: 'dracula',
  cursor: 'tokyo-night',
  kiro: 'catppuccin-mocha',
};

const DEFAULT_SHIKI_THEME: BundledTheme = 'github-dark';

/** Map an IDE theme ID to the best-matching Shiki bundled theme name. */
export function getShikiTheme(ideThemeId: string): BundledTheme {
  return IDE_TO_SHIKI_THEME[ideThemeId] ?? DEFAULT_SHIKI_THEME;
}

// ─── Shiki highlighter singleton ─────────────────────────────────────────────

let highlighterPromise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        // Pre-load all IDE-mapped Shiki themes so switching is instant
        themes: Object.values(IDE_TO_SHIKI_THEME) as BundledTheme[],
        langs: [], // load on demand via loadLanguage
      })
    );
  }
  return highlighterPromise;
}

// ─── Shiki output parsing ────────────────────────────────────────────────────

/**
 * Parse Shiki's HTML output into per-line HTML strings.
 * Shiki wraps code in: <pre ...><code ...>...lines...</code></pre>
 * Each line is a <span class="line">...</span>.
 */
export function parseShikiLines(html: string): string[] {
  const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (!codeMatch) return [];
  const inner = codeMatch[1];
  const lineRegex = /<span class="line">([\s\S]*?)<\/span>/g;
  const result: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(inner)) !== null) {
    result.push(m[1]);
  }
  return result;
}

// ─── Fold helpers ────────────────────────────────────────────────────────────

/**
 * Given a set of collapsed fold start-lines, compute which lines are visible.
 * Returns a Set of 0-based line indices that should be shown,
 * and a Map of collapsed start-line -> number of hidden lines.
 */
export function computeVisibleLines(
  lineCount: number,
  collapsedFolds: Set<number>,
  foldableLines: Map<number, FoldRange>
): { visible: Set<number>; foldedCounts: Map<number, number> } {
  const hidden = new Set<number>();

  for (const startLine of collapsedFolds) {
    const range = foldableLines.get(startLine);
    if (!range) continue;
    for (let i = startLine + 1; i <= range.end && i < lineCount; i++) {
      hidden.add(i);
    }
  }

  const visible = new Set<number>();
  for (let i = 0; i < lineCount; i++) {
    if (!hidden.has(i)) visible.add(i);
  }

  const foldedCounts = new Map<number, number>();
  for (const startLine of collapsedFolds) {
    const range = foldableLines.get(startLine);
    if (!range) continue;
    const count = Math.min(range.end, lineCount - 1) - startLine;
    if (count > 0) foldedCounts.set(startLine, count);
  }

  return { visible, foldedCounts };
}
