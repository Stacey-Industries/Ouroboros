import DOMPurify from 'dompurify';
import React, { useEffect, useMemo } from 'react';

import { renderMarkdown } from './markdownPreviewRenderer';
import {
  ensureMarkdownPreviewStyles,
  PURIFY_CONFIG,
} from './markdownPreviewStyles';

export interface MarkdownPreviewProps {
  content: string;
  /** Base path for resolving relative image URLs (the directory containing the .md file) */
  basePath?: string;
}

const PREVIEW_SHELL_STYLE = {
  flex: 1,
  overflow: 'auto',
  padding: '24px 32px',
  maxWidth: '860px',
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
} as const;

function useSanitizedMarkdown(content: string): string {
  return useMemo(
    () => DOMPurify.sanitize(renderMarkdown(content), PURIFY_CONFIG as Parameters<typeof DOMPurify.sanitize>[1]),
    [content],
  );
}

export function MarkdownPreview({ content }: MarkdownPreviewProps): React.ReactElement {
  const sanitizedHtml = useSanitizedMarkdown(content);

  useEffect(() => {
    ensureMarkdownPreviewStyles();
  }, []);

  return (
    <div style={PREVIEW_SHELL_STYLE}>
      <div
        className="md-preview"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}
