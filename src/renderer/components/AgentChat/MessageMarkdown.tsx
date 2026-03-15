import React, { useCallback, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import 'streamdown/styles.css';

export interface MessageMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

/* ---------- Copy button for code blocks ---------- */

function CopyIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Renders markdown content using Streamdown.
 *
 * During streaming (`isStreaming=true`), Streamdown handles incomplete markdown
 * gracefully (unclosed code fences, partial lists, etc.) and only re-renders
 * the changed portions for optimal performance.
 *
 * Links are opened in the external browser via Electron's shell.openExternal.
 */
export function MessageMarkdown({ content, isStreaming = false }: MessageMarkdownProps): React.ReactElement {
  const mode = isStreaming ? 'streaming' : 'static';

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Prevent default navigation inside Electron
    e.preventDefault();

    // Open external links via Electron shell
    const api = (window as unknown as { electronAPI?: { app?: { openExternal?: (url: string) => void } } }).electronAPI;
    if (api?.app?.openExternal) {
      api.app.openExternal(href);
    } else {
      window.open(href, '_blank', 'noopener');
    }
  }, []);

  return (
    <div
      className="agent-chat-markdown text-sm leading-relaxed text-[var(--text)]"
      onClick={handleLinkClick}
    >
      <Streamdown
        mode={mode}
        parseIncompleteMarkdown={isStreaming}
        controls={{
          copy: true,
          download: false,
          expand: false,
        }}
      >
        {content || ' '}
      </Streamdown>
    </div>
  );
}
