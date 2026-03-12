import React, { memo, useCallback, useState } from 'react';
import type { BufferExcerpt } from '../../types/electron';

// ─── Language detection (mirrors FileViewer) ─────────────────────────────────

function getLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const ext = lower.split('.').pop() ?? '';
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

// ─── Shiki highlighter singleton (shared with FileViewer) ────────────────────

import type { Highlighter, BundledTheme } from 'shiki';
import { useTheme } from '../../hooks/useTheme';

const IDE_TO_SHIKI_THEME: Record<string, BundledTheme> = {
  retro: 'monokai',
  modern: 'github-dark',
  warp: 'dracula',
  cursor: 'tokyo-night',
  kiro: 'catppuccin-mocha',
};
const DEFAULT_SHIKI_THEME: BundledTheme = 'github-dark';

function getShikiTheme(ideThemeId: string): BundledTheme {
  return IDE_TO_SHIKI_THEME[ideThemeId] ?? DEFAULT_SHIKI_THEME;
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

function parseShikiLines(html: string): string[] {
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

// ─── Excerpt component ──────────────────────────────────────────────────────

interface ExcerptContentProps {
  excerpt: BufferExcerpt;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  shikiTheme: BundledTheme;
}

const ExcerptContent = memo(function ExcerptContent({
  excerpt,
  content,
  isLoading,
  error,
  shikiTheme,
}: ExcerptContentProps): React.ReactElement {
  const [highlightedLines, setHighlightedLines] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    if (!content) {
      setHighlightedLines(null);
      return;
    }
    const lang = getLanguage(excerpt.filePath);
    if (lang === 'text') {
      setHighlightedLines(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const hl = await getHighlighterSingleton();
        try {
          await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0]);
        } catch { /* already loaded or not supported */ }

        // Highlight only the excerpt lines
        const allLines = content.split('\n');
        const start = Math.max(0, excerpt.startLine - 1);
        const end = Math.min(allLines.length, excerpt.endLine);
        const slice = allLines.slice(start, end).join('\n');

        const html = hl.codeToHtml(slice, { lang, theme: shikiTheme });
        if (!cancelled) {
          setHighlightedLines(parseShikiLines(html));
        }
      } catch {
        /* fallback to plain text */
      }
    })();

    return () => { cancelled = true; };
  }, [content, excerpt.filePath, excerpt.startLine, excerpt.endLine, shikiTheme]);

  if (isLoading) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--error, #f44)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
        Error: {error}
      </div>
    );
  }

  if (!content) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
        No content
      </div>
    );
  }

  const allLines = content.split('\n');
  const start = Math.max(0, excerpt.startLine - 1);
  const end = Math.min(allLines.length, excerpt.endLine);
  const lines = allLines.slice(start, end);
  const gutterWidth = String(end).length;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: '1.5',
          width: '100%',
        }}
      >
        <tbody>
          {lines.map((line, i) => {
            const lineNo = start + i + 1;
            return (
              <tr key={lineNo}>
                <td
                  style={{
                    padding: '0 12px 0 8px',
                    textAlign: 'right',
                    color: 'var(--text-faint)',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    width: `${gutterWidth + 2}ch`,
                    verticalAlign: 'top',
                  }}
                >
                  {lineNo}
                </td>
                <td
                  style={{
                    padding: '0 8px',
                    whiteSpace: 'pre',
                    color: 'var(--text)',
                  }}
                  dangerouslySetInnerHTML={
                    highlightedLines?.[i]
                      ? { __html: highlightedLines[i] }
                      : undefined
                  }
                >
                  {highlightedLines?.[i] ? undefined : line}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ─── Single excerpt section ─────────────────────────────────────────────────

interface ExcerptSectionProps {
  excerpt: BufferExcerpt;
  index: number;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  shikiTheme: BundledTheme;
  onRemove: (index: number) => void;
  onOpenFile: (filePath: string) => void;
}

const ExcerptSection = memo(function ExcerptSection({
  excerpt,
  index,
  content,
  isLoading,
  error,
  shikiTheme,
  onRemove,
  onOpenFile,
}: ExcerptSectionProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  const filename = excerpt.filePath.replace(/\\/g, '/').split('/').pop() ?? excerpt.filePath;

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [onRemove, index]);

  const handleOpenFile = useCallback(() => {
    onOpenFile(excerpt.filePath);
  }, [onOpenFile, excerpt.filePath]);

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          userSelect: 'none',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={handleToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: '0 2px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </button>

        {/* File path (clickable) */}
        <button
          onClick={handleOpenFile}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--accent)',
            padding: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            textDecoration: 'underline',
            textAlign: 'left',
          }}
          title={`Open ${excerpt.filePath}`}
        >
          {filename}
        </button>

        {/* Line range */}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          lines {excerpt.startLine}-{excerpt.endLine}
        </span>

        {/* Optional label */}
        {excerpt.label && (
          <span
            style={{
              color: 'var(--text)',
              fontSize: '0.75rem',
              backgroundColor: 'var(--bg-tertiary, var(--bg))',
              padding: '1px 6px',
              borderRadius: '3px',
            }}
          >
            {excerpt.label}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Open file button */}
        <button
          onClick={handleOpenFile}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: '2px 6px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
          }}
          title="Open full file"
        >
          Open File
        </button>

        {/* Remove button */}
        <button
          onClick={handleRemove}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: '2px 6px',
            fontSize: '0.6875rem',
            fontFamily: 'var(--font-ui)',
          }}
          title="Remove excerpt"
        >
          Remove
        </button>
      </div>

      {/* Content area */}
      {!collapsed && (
        <ExcerptContent
          excerpt={excerpt}
          content={content}
          isLoading={isLoading}
          error={error}
          shikiTheme={shikiTheme}
        />
      )}
    </div>
  );
});

// ─── MultiBufferView ────────────────────────────────────────────────────────

export interface MultiBufferViewProps {
  name: string;
  excerpts: BufferExcerpt[];
  /** Map of filePath -> { content, isLoading, error } */
  fileContents: Map<string, { content: string | null; isLoading: boolean; error: string | null }>;
  onRemoveExcerpt: (index: number) => void;
  onOpenFile: (filePath: string) => void;
}

export const MultiBufferView = memo(function MultiBufferView({
  name,
  excerpts,
  fileContents,
  onRemoveExcerpt,
  onOpenFile,
}: MultiBufferViewProps): React.ReactElement {
  const { theme: ideTheme } = useTheme();
  const shikiTheme = getShikiTheme(ideTheme.id);

  if (excerpts.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>No excerpts</span>
        <span style={{ fontSize: '0.8125rem' }}>
          Use "Add Excerpt" to compose code from multiple files
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-ui)',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        {name}
        <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px', fontSize: '0.75rem' }}>
          {excerpts.length} excerpt{excerpts.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Excerpts */}
      {excerpts.map((excerpt, i) => {
        const fc = fileContents.get(excerpt.filePath) ?? { content: null, isLoading: true, error: null };
        return (
          <ExcerptSection
            key={`${excerpt.filePath}:${excerpt.startLine}-${excerpt.endLine}:${i}`}
            excerpt={excerpt}
            index={i}
            content={fc.content}
            isLoading={fc.isLoading}
            error={fc.error}
            shikiTheme={shikiTheme}
            onRemove={onRemoveExcerpt}
            onOpenFile={onOpenFile}
          />
        );
      })}
    </div>
  );
});
