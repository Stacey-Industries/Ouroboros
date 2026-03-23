import React, { useCallback, useState } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Module-scope regex — avoids re-allocation on every render.
// g flag used; reset lastIndex before each call.
const TREE_CHAR_RE = /[│├└─┬┌┐┘┤┊┆╰╭╮╯║═╔╗╚╝╠╣╦╩╬┃┗┣┏┓┛┫┳┻╋]/g;

export interface MessageMarkdownProps {
  content: string;
}

/* ---------- Copy button for code blocks ---------- */

function CopyButton({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover/code:opacity-100 bg-surface-base text-text-semantic-muted border border-border-semantic"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function getMarkdownText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map((child) => (typeof child === 'string' ? child : '')).join('');
  return '';
}

function isTreeLikeText(text: string): boolean {
  TREE_CHAR_RE.lastIndex = 0;
  return (text.match(TREE_CHAR_RE)?.length ?? 0) >= 3;
}

function MarkdownCodeBlock({
  className,
  children,
  rest,
}: {
  className?: string;
  children?: React.ReactNode;
  rest: Record<string, unknown>;
}): React.ReactElement {
  const match = /language-(\w+)/.exec(className || '');
  const codeStr = String(children).replace(/\n$/, '');
  return (
    <div className="group/code relative my-2">
      {match && <div className="rounded-t px-3 py-1 text-[10px] font-medium bg-surface-raised text-text-semantic-muted" style={{ borderBottom: '1px solid var(--border)' }}>{match[1]}</div>}
      <pre className={match ? 'rounded-b' : 'rounded'} style={{ margin: 0, padding: '0.65em 0.85em', backgroundColor: 'var(--bg-tertiary, rgba(30, 30, 40, 0.6))', border: '1px solid var(--border)', borderTop: match ? 'none' : undefined, overflowX: 'auto', lineHeight: 1.5 }}>
        <code className={className} style={{ fontSize: '0.85em' }} {...rest}>{children}</code>
      </pre>
      <CopyButton text={codeStr} />
    </div>
  );
}

function MarkdownInlineCode({
  className,
  children,
  rest,
}: {
  className?: string;
  children?: React.ReactNode;
  rest: Record<string, unknown>;
}): React.ReactElement {
  return (
    <code className={`${className ?? ''} bg-surface-raised`} style={{ padding: '0.15em 0.35em', borderRadius: '4px', fontSize: '0.9em', fontFamily: 'var(--font-mono)' }} {...rest}>
      {children}
    </code>
  );
}

function MarkdownCode({
  className,
  children,
  ...rest
}: {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}): React.ReactElement {
  const match = /language-(\w+)/.exec(className || '');
  const codeStr = String(children).replace(/\n$/, '');
  return codeStr.includes('\n') || match
    ? <MarkdownCodeBlock className={className} rest={rest as Record<string, unknown>}>{children}</MarkdownCodeBlock>
    : <MarkdownInlineCode className={className} rest={rest as Record<string, unknown>}>{children}</MarkdownInlineCode>;
}

function MarkdownTable({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="my-2 overflow-x-auto"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', fontFamily: 'var(--font-mono)' }}>{children}</table></div>;
}

function MarkdownTh({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th className="text-text-semantic-primary" style={{ padding: '0.4em 0.75em', textAlign: 'left', borderBottom: '2px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</th>;
}

function MarkdownTd({ children }: { children: React.ReactNode }): React.ReactElement {
  return <td className="text-text-semantic-muted" style={{ padding: '0.35em 0.75em', borderBottom: '1px solid var(--border)' }}>{children}</td>;
}

function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }): React.ReactElement {
  return <a href={href} className="text-interactive-accent underline">{children}</a>;
}

function MarkdownParagraph({ children }: { children: React.ReactNode }): React.ReactElement {
  const text = getMarkdownText(children);
  if (isTreeLikeText(text)) {
    return (
      <pre className="text-text-semantic-muted" style={{ margin: '0.4em 0', fontFamily: 'var(--font-mono)', fontSize: '0.85em', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'none', border: 'none', padding: 0 }}>
        {children}
      </pre>
    );
  }
  return <p style={{ margin: '0.4em 0' }}>{children}</p>;
}

function MarkdownBlockquote({ children }: { children: React.ReactNode }): React.ReactElement {
  return <blockquote className="text-text-semantic-muted" style={{ margin: '0.5em 0', padding: '0.25em 0 0.25em 0.75em', borderLeft: '3px solid var(--accent, #58a6ff)' }}>{children}</blockquote>;
}

function MarkdownHr(): React.ReactElement {
  return <hr style={{ margin: '0.75em 0', border: 'none', borderTop: '1px solid var(--border)' }} />;
}

function MarkdownHeading(level: 1 | 2 | 3, children: React.ReactNode): React.ReactElement {
  const Tag = `h${level}` as const;
  const style = level === 1
    ? { fontSize: '1.3em', fontWeight: 700, margin: '0.6em 0 0.3em' }
    : level === 2
      ? { fontSize: '1.15em', fontWeight: 600, margin: '0.5em 0 0.25em' }
      : { fontSize: '1.05em', fontWeight: 600, margin: '0.4em 0 0.2em' };
  return <Tag className="text-text-semantic-primary" style={style}>{children}</Tag>;
}

function MarkdownList({ ordered, children }: { ordered: boolean; children: React.ReactNode }): React.ReactElement {
  return ordered ? <ol style={{ margin: '0.3em 0', paddingLeft: '1.5em', listStyleType: 'decimal' }}>{children}</ol> : <ul style={{ margin: '0.3em 0', paddingLeft: '1.5em', listStyleType: 'disc' }}>{children}</ul>;
}

function MarkdownListItem({ children }: { children: React.ReactNode }): React.ReactElement {
  return <li className="text-text-semantic-primary" style={{ margin: '0.15em 0' }}>{children}</li>;
}

const markdownComponents: Components = {
  code: MarkdownCode,
  table: MarkdownTable,
  th: MarkdownTh,
  td: MarkdownTd,
  a: MarkdownLink,
  p: MarkdownParagraph,
  blockquote: MarkdownBlockquote,
  hr: MarkdownHr,
  h1: ({ children }) => MarkdownHeading(1, children),
  h2: ({ children }) => MarkdownHeading(2, children),
  h3: ({ children }) => MarkdownHeading(3, children),
  ul: ({ children }) => MarkdownList({ ordered: false, children }),
  ol: ({ children }) => MarkdownList({ ordered: true, children }),
  li: MarkdownListItem,
};

/**
 * Renders markdown using react-markdown + remark-gfm.
 * Full control over every rendered element — no third-party wrappers or borders.
 */
export const MessageMarkdown = React.memo(function MessageMarkdown({ content }: MessageMarkdownProps): React.ReactElement {
  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    e.preventDefault();
    const api = (window as unknown as { electronAPI?: { app?: { openExternal?: (url: string) => void } } }).electronAPI;
    if (api?.app?.openExternal) {
      api.app.openExternal(href);
    } else {
      window.open(href, '_blank', 'noopener');
    }
  }, []);

  return <div className="agent-chat-markdown text-sm leading-relaxed text-text-semantic-primary" onClick={handleLinkClick}><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content || ' '}</ReactMarkdown></div>;
});
