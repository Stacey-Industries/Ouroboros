import { useEffect, useState } from 'react';
import type { BufferExcerpt } from '../../types/electron';
import type { BundledTheme, Highlighter } from 'shiki';

const IDE_TO_SHIKI_THEME: Record<string, BundledTheme> = {
  retro: 'monokai',
  modern: 'github-dark',
  warp: 'dracula',
  cursor: 'tokyo-night',
  kiro: 'catppuccin-mocha',
};

const DEFAULT_SHIKI_THEME: BundledTheme = 'github-dark';

function getLanguage(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    mjs: 'javascript', cjs: 'javascript', json: 'json', jsonc: 'jsonc',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', html: 'html', htm: 'html',
    xml: 'xml', svg: 'xml', css: 'css', scss: 'scss', sass: 'sass',
    less: 'less', md: 'markdown', mdx: 'mdx', py: 'python', rs: 'rust',
    go: 'go', rb: 'ruby', sh: 'bash', bash: 'bash', zsh: 'bash',
    fish: 'fish', bat: 'batch', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp',
    cxx: 'cpp', hpp: 'cpp', cs: 'csharp', java: 'java', kt: 'kotlin',
    swift: 'swift', php: 'php', sql: 'sql', prisma: 'prisma',
    graphql: 'graphql', gql: 'graphql', dockerfile: 'dockerfile',
    txt: 'text', log: 'text', env: 'ini',
  };
  return langMap[ext] ?? 'text';
}

function parseShikiLines(html: string): string[] {
  const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  if (!codeMatch) return [];

  const result: string[] = [];
  const lineRegex = /<span class="line">([\s\S]*?)<\/span>/g;
  let match: RegExpExecArray | null;

  while ((match = lineRegex.exec(codeMatch[1])) !== null) {
    result.push(match[1]);
  }

  return result;
}

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighterSingleton(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: Object.values(IDE_TO_SHIKI_THEME) as BundledTheme[],
        langs: [],
      }),
    );
  }

  return highlighterPromise;
}

async function highlightExcerpt(
  content: string,
  excerpt: BufferExcerpt,
  shikiTheme: BundledTheme,
): Promise<string[] | null> {
  const lang = getLanguage(excerpt.filePath);
  if (lang === 'text') return null;

  const highlighter = await getHighlighterSingleton();
  try {
    await highlighter.loadLanguage(
      lang as Parameters<typeof highlighter.loadLanguage>[0],
    );
  } catch {
    // Language may already be loaded or unsupported.
  }

  const slice = getExcerptSlice(content, excerpt).lines.join('\n');
  const html = highlighter.codeToHtml(slice, { lang, theme: shikiTheme });
  return parseShikiLines(html);
}

export function getShikiTheme(ideThemeId: string): BundledTheme {
  return IDE_TO_SHIKI_THEME[ideThemeId] ?? DEFAULT_SHIKI_THEME;
}

export function getExcerptSlice(
  content: string,
  excerpt: BufferExcerpt,
): { end: number; lines: string[]; start: number } {
  const allLines = content.split('\n');
  const start = Math.max(0, excerpt.startLine - 1);
  const end = Math.min(allLines.length, excerpt.endLine);

  return {
    end,
    lines: allLines.slice(start, end),
    start,
  };
}

export function useHighlightedExcerptLines(
  excerpt: BufferExcerpt,
  content: string | null,
  shikiTheme: BundledTheme,
): string[] | null {
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (!content) {
      setHighlightedLines(null);
      return;
    }

    let cancelled = false;
    void highlightExcerpt(content, excerpt, shikiTheme)
      .then((nextLines) => {
        if (!cancelled) setHighlightedLines(nextLines);
      })
      .catch((error) => {
        console.error('[multiBuffer] Syntax highlighting failed:', error);
        if (!cancelled) setHighlightedLines(null);
      });

    return () => {
      cancelled = true;
    };
  }, [content, excerpt, shikiTheme]);

  return highlightedLines;
}
