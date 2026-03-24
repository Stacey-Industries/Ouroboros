import log from 'electron-log/renderer';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BundledTheme } from 'shiki';

import { getHighlighter, getLanguage, getShikiTheme } from './fileViewerUtils';

const MAX_HIGHLIGHT_CONTENT_LENGTH = 200_000;

interface HighlightResult {
  highlightedHtml: string | null;
  highlightLang: string | null;
  shikiTheme: BundledTheme;
}

interface HighlightContext {
  requestId: number;
  currentRequestIdRef: MutableRefObject<number>;
  setHighlightedHtml: (html: string | null) => void;
  setHighlightLang: (lang: string | null) => void;
}

async function runHighlight(
  filePath: string,
  content: string,
  shikiTheme: ReturnType<typeof getShikiTheme>,
  ctx: HighlightContext,
): Promise<void> {
  const { requestId, currentRequestIdRef, setHighlightedHtml, setHighlightLang } = ctx;
  const lang = getLanguage(filePath);
  if (lang === 'text' || content.length > MAX_HIGHLIGHT_CONTENT_LENGTH) return;
  try {
    const hl = await getHighlighter();
    try {
      await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0]);
    } catch {
      /* language may already be loaded or not exist */
    }
    if (requestId !== currentRequestIdRef.current) return;
    setHighlightedHtml(hl.codeToHtml(content, { lang, theme: shikiTheme }));
    setHighlightLang(lang);
  } catch (err) {
    log.warn('highlight failed:', err);
  }
}

export function useHighlighting(
  filePath: string | null,
  content: string | null,
  ideThemeId: string,
): HighlightResult {
  const shikiTheme = getShikiTheme(ideThemeId);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [highlightLang, setHighlightLang] = useState<string | null>(null);
  const currentRequestIdRef = useRef(0);

  useEffect(() => {
    setHighlightedHtml(null);
    setHighlightLang(null);
  }, [filePath, content]);

  const highlight = useCallback(
    async (requestId: number) => {
      if (!filePath || !content) return;
      await runHighlight(filePath, content, shikiTheme, {
        requestId,
        currentRequestIdRef,
        setHighlightedHtml,
        setHighlightLang,
      });
    },
    [filePath, content, shikiTheme],
  );

  useEffect(() => {
    currentRequestIdRef.current += 1;
    void highlight(currentRequestIdRef.current);
    return () => {
      currentRequestIdRef.current += 1;
    };
  }, [highlight]);

  return { highlightedHtml, highlightLang, shikiTheme };
}
