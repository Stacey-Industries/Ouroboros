import 'streamdown/styles.css';

import React, { useCallback } from 'react';
import { Streamdown } from 'streamdown';

import { markdownComponents } from './MessageMarkdownParts';
import { BlinkingCursor, useTypewriter } from './streamingUtils';

export interface MessageMarkdownProps {
  content: string;
  /** When true, enables typewriter animation and shows a blinking cursor. */
  streaming?: boolean;
}

function openExternalLink(href: string): void {
  const api = (
    window as unknown as { electronAPI?: { app?: { openExternal?: (url: string) => void } } }
  ).electronAPI;
  if (api?.app?.openExternal) {
    api.app.openExternal(href);
  } else {
    window.open(href, '_blank', 'noopener');
  }
}

function handleMarkdownLinkClick(e: React.MouseEvent<HTMLDivElement>): void {
  const target = e.target as HTMLElement;
  const anchor = target.closest('a');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  openExternalLink(href);
}

/**
 * Renders markdown using Streamdown (per-block memoization, streaming-aware).
 * Replaces react-markdown — completed blocks never re-render during streaming.
 */
export const MessageMarkdown = React.memo(function MessageMarkdown({
  content,
  streaming = false,
}: MessageMarkdownProps): React.ReactElement {
  const displayedContent = useTypewriter(content, streaming);
  const showCursor = streaming || (content.length > 0 && displayedContent.length < content.length);

  const handleLinkClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => handleMarkdownLinkClick(e),
    [],
  );

  return (
    <div
      className="agent-chat-markdown text-sm leading-relaxed text-text-semantic-primary"
      onClick={handleLinkClick}
    >
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        components={markdownComponents}
      >
        {(streaming ? displayedContent : content) || ' '}
      </Streamdown>
      {showCursor && <BlinkingCursor />}
    </div>
  );
});
