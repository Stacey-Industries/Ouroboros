import React, { useMemo, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

export interface MarkdownPreviewProps {
  content: string;
  /** Base path for resolving relative image URLs (the directory containing the .md file) */
  basePath?: string;
}

// ─── Simple Markdown → HTML renderer ─────────────────────────────────────────
// Handles: headings, bold, italic, strikethrough, inline code, fenced code blocks,
// blockquotes, unordered/ordered lists, horizontal rules, links, images, paragraphs.
// Does NOT support tables or HTML passthrough (stripped by DOMPurify anyway).

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Apply inline formatting: bold, italic, strikethrough, inline code, links, images */
function renderInline(text: string): string {
  // Images: ![alt](url)
  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width:100%;" />`
  );

  // Links: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, url) => {
      const safeUrl = /^(https?:|mailto:|#)/.test(url) ? escapeHtml(url) : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }
  );

  // Inline code: `code`
  text = text.replace(
    /`([^`]+)`/g,
    (_, code) => `<code>${escapeHtml(code)}</code>`
  );

  // Bold+italic: ***text*** or ___text___
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  return text;
}

/** Render a block of non-blank lines as a list */
function renderList(lines: string[], ordered: boolean): string {
  let html = ordered ? '<ol>\n' : '<ul>\n';
  for (const line of lines) {
    const content = line.replace(/^(\s*(?:\d+\.|-|\*|\+)\s+)/, '');
    html += `<li>${renderInline(content)}</li>\n`;
  }
  html += ordered ? '</ol>\n' : '</ul>\n';
  return html;
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      html += `<pre${langAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>\n`;
      continue;
    }

    // ── Horizontal rule ──
    if (/^(?:---+|===+|\*\*\*+)\s*$/.test(line)) {
      html += '<hr />\n';
      i++;
      continue;
    }

    // ── Heading ──
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      html += `<h${level}>${renderInline(text)}</h${level}>\n`;
      i++;
      continue;
    }

    // ── Blockquote ──
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const inner = renderMarkdown(quoteLines.join('\n'));
      html += `<blockquote>${inner}</blockquote>\n`;
      continue;
    }

    // ── Unordered list ──
    if (/^(\s*[-*+]\s+)/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^(\s*[-*+]\s+)/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      html += renderList(listLines, false);
      continue;
    }

    // ── Ordered list ──
    if (/^\s*\d+\.\s+/.test(line)) {
      const listLines: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      html += renderList(listLines, true);
      continue;
    }

    // ── Blank line ──
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph — collect until blank line or block element ──
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|>|```|(\s*[-*+]\s+)|\s*\d+\.\s+|---+|===+|\*\*\*+)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html += `<p>${renderInline(paraLines.join(' '))}</p>\n`;
    }
  }

  return html;
}

// ─── DOMPurify config ─────────────────────────────────────────────────────────

const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'del', 'code', 'pre',
    'blockquote',
    'ul', 'ol', 'li',
    'a', 'img',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'data-lang', 'style'],
  // Forbid javascript: in hrefs
  FORBID_ATTR: [],
  ALLOW_DATA_ATTR: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MarkdownPreview — renders markdown content as sanitized HTML.
 * Uses a built-in lightweight renderer + DOMPurify for XSS protection.
 */
export function MarkdownPreview({ content }: MarkdownPreviewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  const sanitizedHtml = useMemo(() => {
    const raw = renderMarkdown(content);
    return DOMPurify.sanitize(raw, PURIFY_CONFIG) as string;
  }, [content]);

  // Inject scoped styles once
  useEffect(() => {
    const id = '__md-preview-styles__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .md-preview { font-family: var(--font-ui); color: var(--text); line-height: 1.7; }
      .md-preview h1, .md-preview h2, .md-preview h3,
      .md-preview h4, .md-preview h5, .md-preview h6 {
        color: var(--text);
        font-weight: 600;
        margin: 1.2em 0 0.4em;
        line-height: 1.3;
      }
      .md-preview h1 { font-size: 1.75em; border-bottom: 1px solid var(--border-muted); padding-bottom: 0.25em; }
      .md-preview h2 { font-size: 1.4em;  border-bottom: 1px solid var(--border-muted); padding-bottom: 0.2em; }
      .md-preview h3 { font-size: 1.15em; }
      .md-preview h4 { font-size: 1em; }
      .md-preview p  { margin: 0.6em 0; }
      .md-preview ul, .md-preview ol { margin: 0.6em 0; padding-left: 1.75em; }
      .md-preview li { margin: 0.2em 0; }
      .md-preview a  { color: var(--accent); text-decoration: underline; }
      .md-preview a:hover { opacity: 0.85; }
      .md-preview code {
        font-family: var(--font-mono);
        font-size: 0.875em;
        background: var(--bg-secondary);
        border: 1px solid var(--border-muted);
        border-radius: 3px;
        padding: 0.1em 0.35em;
        color: var(--text);
      }
      .md-preview pre {
        font-family: var(--font-mono);
        font-size: 0.8125em;
        background: var(--bg-secondary);
        border: 1px solid var(--border-muted);
        border-radius: 6px;
        padding: 12px 16px;
        overflow-x: auto;
        margin: 0.8em 0;
        line-height: 1.6;
        color: var(--text);
      }
      .md-preview pre code {
        background: none;
        border: none;
        padding: 0;
        font-size: inherit;
      }
      .md-preview blockquote {
        border-left: 3px solid var(--accent);
        margin: 0.8em 0;
        padding: 0.4em 1em;
        color: var(--text-muted);
        background: var(--bg-secondary);
        border-radius: 0 4px 4px 0;
      }
      .md-preview hr {
        border: none;
        border-top: 1px solid var(--border-muted);
        margin: 1.5em 0;
      }
      .md-preview img {
        max-width: 100%;
        border-radius: 4px;
        margin: 0.5em 0;
      }
      .md-preview strong { font-weight: 600; }
      .md-preview em     { font-style: italic; }
      .md-preview del    { text-decoration: line-through; color: var(--text-muted); }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px 32px',
        maxWidth: '860px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={containerRef}
        className="md-preview"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}
