import React, { useEffect, useRef } from 'react';

const preStyle: React.CSSProperties = {
  flex: 1,
  margin: 0,
  padding: '12px 16px',
  overflow: 'auto',
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  lineHeight: 1.6,
  background: 'var(--surface-base)',
  color: 'var(--text-semantic-primary)',
  whiteSpace: 'pre',
};

export interface MonacoMobileReadonlyProps {
  content: string;
  language: string;
  monacoTheme: string;
}

/**
 * Read-only mobile fallback — renders content in a <pre> and calls
 * monaco.editor.colorizeElement() for lightweight syntax highlighting.
 * No workers are loaded; colorizeElement is synchronous + tokenizer-only.
 */
export function MonacoMobileReadonly({
  content,
  language,
  monacoTheme,
}: MonacoMobileReadonlyProps): React.ReactElement {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = preRef.current;
    if (!node) return;

    let cancelled = false;
    import('monaco-editor').then((monaco) => {
      if (cancelled || !preRef.current) return;
      void monaco.editor.colorizeElement(preRef.current, {
        mimeType: language,
        theme: monacoTheme,
      });
    }).catch(() => {
      // colorize is best-effort; plain text is still readable
    });

    return () => { cancelled = true; };
  }, [content, language, monacoTheme]);

  return (
    <pre
      ref={preRef}
      data-monaco-fallback="readonly"
      style={preStyle}
    >
      {content}
    </pre>
  );
}
