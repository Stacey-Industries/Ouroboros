/**
 * useCodeHighlight — async Shiki syntax highlighting for chat code blocks.
 *
 * Returns highlighted HTML string or null while loading/unsupported.
 * Uses requestId pattern to cancel stale highlights.
 * Re-highlights when the IDE theme changes.
 */
import { useEffect, useRef, useState } from 'react';
import type { BundledTheme } from 'shiki';

import { getShikiTheme, highlightCode } from '../../utils/shikiHighlighter';

const SKIP_LANGUAGES = new Set(['text', 'plaintext']);
const MAX_LENGTH = 50_000;

function resolveTheme(): BundledTheme {
  const themeId = document.documentElement.getAttribute('data-theme-id') ?? 'modern';
  return getShikiTheme(themeId);
}

export function useCodeHighlight(
  code: string,
  language?: string,
): { html: string | null } {
  const [html, setHtml] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [themeVersion, setThemeVersion] = useState(0);

  // Re-highlight when theme changes.
  useEffect(() => {
    const handler = (): void => setThemeVersion((v) => v + 1);
    window.addEventListener('agent-ide:theme-applied', handler);
    return () => window.removeEventListener('agent-ide:theme-applied', handler);
  }, []);

  useEffect(() => {
    setHtml(null);
    if (!language || SKIP_LANGUAGES.has(language)) return;
    if (code.length > MAX_LENGTH) return;

    const id = ++requestIdRef.current;
    const theme = resolveTheme();

    let cancelled = false;
    highlightCode(code, language, theme).then((result) => {
      if (cancelled || id !== requestIdRef.current) return;
      setHtml(result);
    });

    return () => { cancelled = true; };
  }, [code, language, themeVersion]);

  return { html };
}
