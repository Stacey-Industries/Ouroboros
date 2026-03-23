import React, { memo, useCallback, useState } from 'react';
import type { BundledTheme } from 'shiki';

import type { BufferExcerpt } from '../../types/electron';
import { MultiBufferExcerptHeader } from './MultiBufferExcerptHeader';
import {
  getExcerptSlice,
  useHighlightedExcerptLines,
} from './multiBufferViewSyntax';

interface ExcerptContentProps {
  excerpt: BufferExcerpt;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  shikiTheme: BundledTheme;
}

export interface ExcerptSectionProps extends ExcerptContentProps {
  index: number;
  onOpenFile: (filePath: string) => void;
  onRemove: (index: number) => void;
}

const STATUS_STYLE = {
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
} as const;

const TABLE_STYLE = {
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8125rem',
  lineHeight: '1.5',
  width: '100%',
} as const;

const LINE_NO_STYLE = {
  padding: '0 12px 0 8px',
  textAlign: 'right',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
} as const;

const LINE_CONTENT_STYLE = {
  padding: '0 8px',
  whiteSpace: 'pre',
} as const;

function ExcerptStatus({
  className,
  message,
}: {
  className: string;
  message: string;
}): React.ReactElement {
  return <div className={className} style={STATUS_STYLE}>{message}</div>;
}

function ExcerptLineRow({
  gutterWidth,
  highlightedHtml,
  line,
  lineNo,
}: {
  gutterWidth: number;
  highlightedHtml?: string;
  line: string;
  lineNo: number;
}): React.ReactElement {
  const lineNumberStyle = { ...LINE_NO_STYLE, width: `${gutterWidth + 2}ch` };

  return (
    <tr>
      <td className="text-text-semantic-faint" style={lineNumberStyle}>{lineNo}</td>
      <td
        className="text-text-semantic-primary"
        style={LINE_CONTENT_STYLE}
        dangerouslySetInnerHTML={highlightedHtml ? { __html: highlightedHtml } : undefined}
      >
        {highlightedHtml ? undefined : line}
      </td>
    </tr>
  );
}

function ExcerptLineTable({
  excerpt,
  content,
  highlightedLines,
}: {
  excerpt: BufferExcerpt;
  content: string;
  highlightedLines: string[] | null;
}): React.ReactElement {
  const { end, lines, start } = getExcerptSlice(content, excerpt);
  const gutterWidth = String(end).length;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={TABLE_STYLE}>
        <tbody>
          {lines.map((line, index) => {
            const lineNo = start + index + 1;
            return (
              <ExcerptLineRow
                key={lineNo}
                gutterWidth={gutterWidth}
                highlightedHtml={highlightedLines?.[index]}
                line={line}
                lineNo={lineNo}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const ExcerptContent = memo(function ExcerptContent({
  excerpt,
  content,
  isLoading,
  error,
  shikiTheme,
}: ExcerptContentProps): React.ReactElement {
  const highlightedLines = useHighlightedExcerptLines(excerpt, content, shikiTheme);

  if (isLoading) {
    return <ExcerptStatus className="text-text-semantic-muted" message="Loading..." />;
  }

  if (error) {
    return <ExcerptStatus className="text-status-error" message={`Error: ${error}`} />;
  }

  if (!content) {
    return <ExcerptStatus className="text-text-semantic-muted" message="No content" />;
  }

  return (
    <ExcerptLineTable
      excerpt={excerpt}
      content={content}
      highlightedLines={highlightedLines}
    />
  );
});

export const ExcerptSection = memo(function ExcerptSection({
  excerpt,
  index,
  content,
  isLoading,
  error,
  shikiTheme,
  onRemove,
  onOpenFile,
}: ExcerptSectionProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const handleToggle = useCallback(() => setCollapsed((prev) => !prev), []);
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
  const handleOpenFile = useCallback(
    () => onOpenFile(excerpt.filePath),
    [excerpt.filePath, onOpenFile],
  );

  return (
    <div style={{ borderBottom: '1px solid var(--border-semantic)' }}>
      <MultiBufferExcerptHeader
        collapsed={collapsed}
        excerpt={excerpt}
        onOpenFile={handleOpenFile}
        onRemove={handleRemove}
        onToggle={handleToggle}
      />
      {!collapsed ? (
        <ExcerptContent
          excerpt={excerpt}
          content={content}
          error={error}
          isLoading={isLoading}
          shikiTheme={shikiTheme}
        />
      ) : null}
    </div>
  );
});
