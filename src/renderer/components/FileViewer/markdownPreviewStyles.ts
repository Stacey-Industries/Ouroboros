import DOMPurify from 'dompurify';

const MARKDOWN_PREVIEW_STYLE_ID = '__md-preview-styles__';

const MARKDOWN_PREVIEW_STYLES = `
  .md-preview { font-family: var(--font-ui); color: var(--text); line-height: 1.7; }
  .md-preview h1, .md-preview h2, .md-preview h3,
  .md-preview h4, .md-preview h5, .md-preview h6 {
    color: var(--text);
    font-weight: 600;
    margin: 1.2em 0 0.4em;
    line-height: 1.3;
  }
  .md-preview h1 { font-size: 1.75em; border-bottom: 1px solid var(--border-muted); padding-bottom: 0.25em; }
  .md-preview h2 { font-size: 1.4em; border-bottom: 1px solid var(--border-muted); padding-bottom: 0.2em; }
  .md-preview h3 { font-size: 1.15em; }
  .md-preview h4 { font-size: 1em; }
  .md-preview p { margin: 0.6em 0; }
  .md-preview ul, .md-preview ol { margin: 0.6em 0; padding-left: 1.75em; }
  .md-preview li { margin: 0.2em 0; }
  .md-preview a { color: var(--interactive-accent); text-decoration: underline; }
  .md-preview a:hover { opacity: 0.85; }
  .md-preview code {
    font-family: var(--font-mono);
    font-size: 0.875em;
    background: var(--surface-panel);
    border: 1px solid var(--border-muted);
    border-radius: 3px;
    padding: 0.1em 0.35em;
    color: var(--text);
  }
  .md-preview pre {
    font-family: var(--font-mono);
    font-size: 0.8125em;
    background: var(--surface-panel);
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
    border-left: 3px solid var(--interactive-accent);
    margin: 0.8em 0;
    padding: 0.4em 1em;
    color: var(--text-muted);
    background: var(--surface-panel);
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
  .md-preview em { font-style: italic; }
  .md-preview del { text-decoration: line-through; color: var(--text-muted); }
`;

export const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'del', 'code', 'pre',
    'blockquote',
    'ul', 'ol', 'li',
    'a', 'img',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'data-lang', 'style'],
  FORBID_ATTR: [],
  ALLOW_DATA_ATTR: false,
};

export function ensureMarkdownPreviewStyles(): void {
  if (document.getElementById(MARKDOWN_PREVIEW_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MARKDOWN_PREVIEW_STYLE_ID;
  style.textContent = MARKDOWN_PREVIEW_STYLES;
  document.head.appendChild(style);
}
