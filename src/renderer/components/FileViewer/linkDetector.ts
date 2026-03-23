/**
 * linkDetector.ts â€” Post-processes Shiki-highlighted HTML to make URLs,
 * relative imports, and project-path references clickable.
 *
 * This runs on the HTML string *before* it is set as innerHTML so we can
 * inject <a> wrappers in a single pass, safely, without touching the live DOM.
 *
 * Safety constraints:
 * - Only wraps patterns that are provably simple strings (no HTML tags).
 * - Operates on text content that has already been HTML-escaped by Shiki,
 *   so attribute values / tag boundaries can never be synthesised by user data.
 * - The generated <a> tags use data- attributes; actual navigation is handled
 *   by a delegated click listener attached once in FileViewer, keeping all
 *   imperative side-effects out of the HTML string itself.
 */

const URL_RE = /https?:\/\/[^\s"'<>&]+/g;
const IMPORT_PATH_RE = /(?:from\s+|import\s+|require\s*\(\s*)(['"])((?:\.\.?\/)[^'"<>&\s]+)\1/g;
const PROJECT_PATH_RE = /(['"])((?:\/src\/|src\/|\.\/|\.\.\/)[^'"<>&\s]+\.[a-z]{1,6})\1/g;

const STYLE_ID = '__fv-link-styles__';

export function ensureLinkStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    'a.fv-link { color: inherit; text-decoration: none; cursor: pointer; }',
    'a.fv-link:hover { color: var(--interactive-accent); text-decoration: underline; }',
    'a.fv-link[data-link-type="url"]:hover { color: var(--interactive-accent); }',
    'a.fv-link[data-link-type="import"]:hover { color: var(--interactive-accent); }',
    'a.fv-link[data-link-type="path"]:hover { color: var(--interactive-accent); }',
  ].join('\n');
  document.head.appendChild(style);
}

function wrapUrl(url: string): string {
  return wrapLink('url', url);
}

function wrapImport(full: string, _quote: string, path: string): string {
  return full.replace(path, wrapLink('import', path));
}

function wrapProjectPath(full: string, _quote: string, path: string): string {
  return full.replace(path, wrapLink('path', path));
}

function wrapLink(linkType: 'url' | 'import' | 'path', href: string): string {
  const safeHref = href.replace(/"/g, '&quot;');
  return `<a class="fv-link" data-link-type="${linkType}" data-href="${safeHref}" tabindex="-1">${href}</a>`;
}

function processSpanContent(spanInner: string): string {
  if (/<[a-z]/i.test(spanInner)) return spanInner;

  let result = spanInner.replace(URL_RE, (url) => wrapUrl(url));
  if (/<[a-z]/i.test(result)) return result;

  result = result.replace(IMPORT_PATH_RE, (full, quote, path) => wrapImport(full, quote, path));
  if (/<[a-z]/i.test(result)) return result;

  return result.replace(PROJECT_PATH_RE, (full, quote, path) => wrapProjectPath(full, quote, path));
}

/**
 * Post-process the HTML string produced by Shiki to add clickable links.
 *
 * Only the text content inside `<span>` elements is mutated; the outer
 * `<pre>`/`<code>` structure and Shiki's `class="line"` wrapper spans are
 * preserved exactly.
 */
export function injectLinks(html: string): string {
  return html.replace(
    /(<span\b[^>]*>)([\s\S]*?)(<\/span>)/g,
    (_match, open, inner, close) => `${open}${processSpanContent(inner)}${close}`,
  );
}

/**
 * Attach a delegated click listener to `container` that handles all
 * `a.fv-link` clicks. Returns a cleanup function.
 */
export function attachLinkClickHandler(
  container: HTMLElement,
  getActiveFilePath: () => string | null,
  getProjectRoot: () => string | null,
): () => void {
  function handleClick(event: MouseEvent): void {
    const target = getLinkTarget(event);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    handleLinkTarget(target, getActiveFilePath, getProjectRoot);
  }

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}

function getLinkTarget(event: MouseEvent): HTMLAnchorElement | null {
  return (event.target as HTMLElement).closest('a.fv-link') as HTMLAnchorElement | null;
}

function handleLinkTarget(
  target: HTMLAnchorElement,
  getActiveFilePath: () => string | null,
  getProjectRoot: () => string | null,
): void {
  const href = target.dataset.href ?? '';
  if (!href) return;

  if (target.dataset.linkType === 'url') {
    window.electronAPI?.app?.openExternal(href).catch((error) => {
      console.error('[linkDetector] Failed to open external URL:', href, error);
    });
    return;
  }

  const resolvedPath = resolveLinkedFilePath(href, getActiveFilePath, getProjectRoot);
  if (!resolvedPath) return;

  window.dispatchEvent(
    new CustomEvent('agent-ide:open-file', { detail: { filePath: resolvedPath } }),
  );
}

function resolveLinkedFilePath(
  href: string,
  getActiveFilePath: () => string | null,
  getProjectRoot: () => string | null,
): string | null {
  const activeFile = getActiveFilePath();
  if (!activeFile) return null;

  if (href.startsWith('./') || href.startsWith('../')) {
    const directory = activeFile.replace(/[/\\][^/\\]*$/, '');
    return resolveRelativePath(directory, href);
  }

  const root = getProjectRoot();
  if (!root) return null;

  const normalizedRoot = root.replace(/[/\\]$/, '');
  return href.startsWith('/') ? normalizedRoot + href : `${normalizedRoot}/${href}`;
}

/**
 * Resolve a relative path segment against a base directory.
 * Works with both `/` and `\` path separators.
 */
function resolveRelativePath(baseDir: string, relative: string): string {
  const dir = baseDir.replace(/\\/g, '/');
  const rel = relative.replace(/\\/g, '/');
  const parts = dir.split('/').filter(Boolean);

  for (const part of rel.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }

  const prefix = dir.startsWith('/') ? '/' : dir.match(/^[A-Za-z]:/) ? `${dir.slice(0, 2)}/` : '';

  return prefix + parts.join('/');
}
