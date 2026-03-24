import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { markdownComponents } from './MessageMarkdownParts';

export interface MessageMarkdownProps {
  content: string;
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
 * Renders markdown using react-markdown + remark-gfm.
 * Full control over every rendered element — no third-party wrappers or borders.
 */
export const MessageMarkdown = React.memo(function MessageMarkdown({
  content,
}: MessageMarkdownProps): React.ReactElement {
  const handleLinkClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => handleMarkdownLinkClick(e),
    [],
  );

  return (
    <div
      className="agent-chat-markdown text-sm leading-relaxed text-text-semantic-primary"
      onClick={handleLinkClick}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content || ' '}
      </ReactMarkdown>
    </div>
  );
});
