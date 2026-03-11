/**
 * linkDetector.ts — Post-processes Shiki-highlighted HTML to make URLs,
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

// ── Pattern constants ────────────────────────────────────────────────────────

/** Matches http(s) URLs that don't contain HTML-special chars or whitespace. */
const URL_RE = /https?:\/\/[^\s"'<>&]+/g;

/**
 * Matches the string content of import / require path literals.
 * We look for the *already-HTML-escaped* quote character (&quot; or ').
 * Shiki uses real quotes inside span text content, so plain ' and " are fine.
 *
 * Captures: the path (group 1)
 */
const IMPORT_PATH_RE =
  /(?:from\s+|import\s+|require\s*\(\s*)(['"])((?:\.\.?\/)[^'"<>&\s]+)\1/g;

/**
 * Matches bare project-rooted paths like `/src/foo/bar.ts` or `src/foo/bar.ts`
 * that look like they could be source files.
 */
const PROJECT_PATH_RE =
  /(['"])((?:\/src\/|src\/|\.\/|\.\.\/)[^'"<>&\s]+\.[a-z]{1,6})\1/g;

// ── Inline style injected once ───────────────────────────────────────────────

const STYLE_ID = '__fv-link-styles__';

export function ensureLinkStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    'a.fv-link { color: inherit; text-decoration: none; cursor: pointer; }',
    'a.fv-link:hover { color: var(--accent); text-decoration: underline; }',
    'a.fv-link[data-link-type="url"]:hover { color: var(--accent); }',
    'a.fv-link[data-link-type="import"]:hover { color: var(--accent); }',
    'a.fv-link[data-link-type="path"]:hover { color: var(--accent); }',
  ].join('\n');
  document.head.appendChild(style);
}

// ── Replacer helpers ─────────────────────────────────────────────────────────

/** Wrap a matched substring in an <a> tag with the appropriate data attributes. */
function wrapUrl(url: string): string {
  const safeHref = url.replace(/"/g, '&quot;');
  return `<a class="fv-link" data-link-type="url" data-href="${safeHref}" tabindex="-1">${url}</a>`;
}

function wrapImport(full: string, quote: string, path: string): string {
  const safeHref = path.replace(/"/g, '&quot;');
  // Re-emit the full matched text with only the path part wrapped.
  // e.g. from './foo' → from '<a ...>./foo</a>'
  const wrapped = `<a class="fv-link" data-link-type="import" data-href="${safeHref}" tabindex="-1">${path}</a>`;
  return full.replace(path, wrapped);
}

function wrapProjectPath(full: string, _quote: string, path: string): string {
  const safeHref = path.replace(/"/g, '&quot;');
  const wrapped = `<a class="fv-link" data-link-type="path" data-href="${safeHref}" tabindex="-1">${path}</a>`;
  return full.replace(path, wrapped);
}

// ── Per-span processor ───────────────────────────────────────────────────────

/**
 * Replace link patterns within the *text content* of a single Shiki span.
 *
 * Shiki emits spans like: <span style="color:#...">some text</span>
 * We want to inject <a> tags inside the span text, not across span boundaries,
 * to avoid breaking the syntax highlighting structure.
 *
 * This function receives the inner HTML of a single span (already escaped by
 * Shiki) and returns modified inner HTML.
 */
function processSpanContent(spanInner: string): string {
  // Skip spans that already contain nested tags (e.g. existing <a>, <mark>)
  // to avoid double-wrapping.
  if (/<[a-z]/i.test(spanInner)) return spanInner;

  let result = spanInner;

  // 1. URLs (highest specificity — run first)
  result = result.replace(URL_RE, (url) => wrapUrl(url));

  // After URL replacement the string may contain <a> tags — reset for safety.
  if (/<[a-z]/i.test(result)) return result;

  // 2. Relative import paths
  result = result.replace(IMPORT_PATH_RE, (full, quote, path) =>
    wrapImport(full, quote, path)
  );

  if (/<[a-z]/i.test(result)) return result;

  // 3. Project-rooted paths (less common; skip if we already injected a tag)
  result = result.replace(PROJECT_PATH_RE, (full, quote, path) =>
    wrapProjectPath(full, quote, path)
  );

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Post-process the HTML string produced by Shiki to add clickable links.
 *
 * Only the text content inside `<span>` elements is mutated; the outer
 * `<pre>`/`<code>` structure and Shiki's `class="line"` wrapper spans are
 * preserved exactly.
 *
 * @param html - Full Shiki HTML output string.
 * @returns Modified HTML string with link anchors injected.
 */
export function injectLinks(html: string): string {
  // Replace content inside every leaf <span> element.
  // A leaf span is one whose inner HTML contains no nested block-level tags.
  // Pattern: <span ...>CONTENT</span> where CONTENT has no < characters
  // (or only already-closed inline tags that we allow through carefully).
  return html.replace(
    /(<span\b[^>]*>)([\s\S]*?)(<\/span>)/g,
    (_match, open, inner, close) => {
      const processed = processSpanContent(inner);
      return `${open}${processed}${close}`;
    }
  );
}

// ── Click handler factory ─────────────────────────────────────────────────────

/**
 * Attach a delegated click listener to `container` that handles all
 * `a.fv-link` clicks. Returns a cleanup function.
 *
 * @param container - The code content div (codeRef).
 * @param activeFilePath - The currently viewed file's absolute path.
 * @param projectRoot - The project root directory (for resolving relative paths).
 */
export function attachLinkClickHandler(
  container: HTMLElement,
  getActiveFilePath: () => string | null,
  getProjectRoot: () => string | null
): () => void {
  function handleClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest('a.fv-link') as HTMLAnchorElement | null;
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const linkType = target.dataset.linkType;
    const href = target.dataset.href ?? '';

    if (!href) return;

    if (linkType === 'url') {
      // Open external URL via IPC
      window.electronAPI?.app?.openExternal(href).catch(() => { /* ignore */ });
      return;
    }

    if (linkType === 'import' || linkType === 'path') {
      const activeFile = getActiveFilePath();
      if (!activeFile) return;

      let resolvedPath: string;

      if (href.startsWith('./') || href.startsWith('../')) {
        // Resolve relative to the directory of the active file.
        // Use simple string manipulation — no Node.js path module in renderer.
        const dir = activeFile.replace(/[/\\][^/\\]*$/, '');
        resolvedPath = resolveRelativePath(dir, href);
      } else {
        // Absolute project path like /src/... or src/...
        const root = getProjectRoot();
        if (!root) return;
        const normalRoot = root.replace(/[/\\]$/, '');
        resolvedPath = href.startsWith('/')
          ? normalRoot + href
          : normalRoot + '/' + href;
      }

      window.dispatchEvent(
        new CustomEvent('agent-ide:open-file', { detail: { filePath: resolvedPath } })
      );
    }
  }

  container.addEventListener('click', handleClick);
  return () => container.removeEventListener('click', handleClick);
}

// ── Path resolution (no Node.js path module) ─────────────────────────────────

/**
 * Resolve a relative path segment against a base directory.
 * Works with both `/` and `\` path separators.
 */
function resolveRelativePath(baseDir: string, relative: string): string {
  // Normalize separators to forward slash
  const dir = baseDir.replace(/\\/g, '/');
  const rel = relative.replace(/\\/g, '/');

  const parts = dir.split('/').filter(Boolean);
  const relParts = rel.split('/');

  for (const part of relParts) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  // Re-prefix with drive letter / leading slash if present
  const prefix = dir.startsWith('/') ? '/' : dir.match(/^[A-Za-z]:/) ? dir.slice(0, 2) + '/' : '';
  return prefix + parts.join('/');
}
