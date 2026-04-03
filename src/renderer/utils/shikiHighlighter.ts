/**
 * Shared Shiki highlighter singleton — used by both FileViewer and AgentChat.
 *
 * Re-exports the existing highlighter and theme mapping from fileViewerUtils.ts
 * and adds a convenience `highlightCode()` wrapper for direct use.
 */
import type { BundledTheme } from 'shiki';

import { getHighlighter, getShikiTheme } from '../components/FileViewer/fileViewerUtils';

export { getHighlighter, getShikiTheme };

/** IDE theme → Shiki theme mapping (extended for all IDE themes). */
export const IDE_THEME_MAP: Record<string, string> = {
  modern: 'github-dark',
  cursor: 'github-dark',
  warp: 'github-dark',
  kiro: 'github-dark',
  light: 'github-light',
  retro: 'monokai',
  'high-contrast': 'github-dark-high-contrast',
};

const MAX_HIGHLIGHT_LENGTH = 50_000;
const SKIP_LANGUAGES = new Set(['text', 'plaintext', '']);

/**
 * Highlight a code string and return HTML.
 * Returns `null` if the language is unsupported, code is too long, or an error occurs.
 */
export async function highlightCode(
  code: string,
  language: string,
  theme: BundledTheme,
): Promise<string | null> {
  if (!language || SKIP_LANGUAGES.has(language)) return null;
  if (code.length > MAX_HIGHLIGHT_LENGTH) return null;

  try {
    const hl = await getHighlighter();
    try {
      await hl.loadLanguage(language as Parameters<typeof hl.loadLanguage>[0]);
    } catch {
      return null;
    }
    const html = hl.codeToHtml(code, { lang: language, theme });
    return stripShikiWrappers(html);
  } catch {
    return null;
  }
}

/**
 * Strip Shiki's outer `<pre>` and `<code>` wrappers, keeping only the
 * inner span-based content. This lets the caller control background
 * and container styling.
 */
function stripShikiWrappers(html: string): string {
  return html
    .replace(/^<pre[^>]*><code[^>]*>/, '')
    .replace(/<\/code><\/pre>$/, '');
}
