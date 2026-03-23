import { useCallback, useEffect, useRef, useState } from 'react';
import type { BundledTheme } from 'shiki';

import { getHighlighter, getLanguage, getShikiTheme } from './fileViewerUtils';

const MAX_HIGHLIGHT_CONTENT_LENGTH = 200_000;

interface HighlightResult {
  highlightedHtml: string | null;
  highlightLang: string | null;
  shikiTheme: BundledTheme;
}

export function useHighlighting(
  filePath: string | null,
  content: string | null,
  ideThemeId: string
): HighlightResult {
  const shikiTheme = getShikiTheme(ideThemeId);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [highlightLang, setHighlightLang] = useState<string | null>(null);
  const currentRequestIdRef = useRef(0);

  useEffect(() => {
    setHighlightedHtml(null);
    setHighlightLang(null);
  }, [filePath, content]);

  const highlight = useCallback(async (requestId: number) => {
    if (!filePath || !content) return;
    const lang = getLanguage(filePath);
    if (lang === 'text' || content.length > MAX_HIGHLIGHT_CONTENT_LENGTH) return;
    try {
      const hl = await getHighlighter();
      try {
        await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0]);
      } catch { /* language may already be loaded or not exist */ }
      if (requestId !== currentRequestIdRef.current) return;
      setHighlightedHtml(hl.codeToHtml(content, { lang, theme: shikiTheme }));
      setHighlightLang(lang);
    } catch (err) {
      console.warn('[FileViewer] highlight failed:', err);
    }
  }, [filePath, content, shikiTheme]);

  useEffect(() => {
    currentRequestIdRef.current += 1;
    void highlight(currentRequestIdRef.current);
    return () => { currentRequestIdRef.current += 1; };
  }, [highlight]);

  return { highlightedHtml, highlightLang, shikiTheme };
}
