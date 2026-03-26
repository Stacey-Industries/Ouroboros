import React, { memo } from 'react';

import type { CodeRow } from './codeViewTypes';
import { EmptyState } from './EmptyState';
import { ErrorDisplay } from './ErrorDisplay';
import { FileViewerChrome } from './FileViewerChrome';
import { computeVisibleLines,parseShikiLines } from './fileViewerUtils';
import { HexViewer } from './HexViewer';
import { ImageViewer } from './ImageViewer';
import { injectLinks } from './linkDetector';
import { LoadingState } from './LoadingState';
import { PdfViewer } from './PdfViewer';
import { useFileViewerState } from './useFileViewerState';

export interface FileViewerProps {
  filePath: string | null;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk?: boolean;
  onReload?: () => void;
  originalContent?: string | null;
  projectRoot?: string | null;
  isImage?: boolean;
  isPdf?: boolean;
  isBinary?: boolean;
  binaryContent?: Uint8Array;
  onSave?: (content: string) => void;
  onContentChange?: (content: string) => void;
  onCancelEdit?: () => void;
  isDirty?: boolean;
}

/**
 * FileViewer — read-only syntax-highlighted code viewer.
 */
export const FileViewer = memo(function FileViewer(
  props: FileViewerProps
): React.ReactElement {
  return <FileViewerInner {...props} />;
});

function renderInitialViewerState(props: FileViewerProps): React.ReactElement | null {
  if (!props.filePath && !props.isLoading) return <EmptyState />;
  if (props.isLoading) return <LoadingState />;
  if (props.error) return <ErrorDisplay error={props.error} />;
  if (props.content === null) return <EmptyState />;
  return null;
}

function renderFileTypeViewer(props: FileViewerProps): React.ReactElement | null {
  const { filePath, isImage, isPdf, isBinary, binaryContent } = props;
  if (isImage && filePath) return <ImageViewer filePath={filePath} />;
  if (isPdf && filePath) return <PdfViewer filePath={filePath} />;
  if (isBinary && filePath && binaryContent) return <HexViewer content={binaryContent} filePath={filePath} />;
  if (isBinary && filePath) return <LoadingState />;
  return null;
}

function renderSpecialViewer(props: FileViewerProps): React.ReactElement | null {
  return renderInitialViewerState(props) ?? renderFileTypeViewer(props);
}

const FileViewerInner = memo(function FileViewerInner(
  props: FileViewerProps
): React.ReactElement {
  const s = useFileViewerState(props);
  const specialViewer = renderSpecialViewer(props);
  if (specialViewer) return specialViewer;

  const { content } = props;
  const shikiLines = s.highlightedHtml
    ? parseShikiLines(injectLinks(s.highlightedHtml))
    : null;
  const lines = (content ?? '').split('\n');
  const lineCount = lines.length;
  const { visible, foldedCounts } = computeVisibleLines(
    lineCount, s.collapsedFolds, s.foldableLines
  );
  const rows = buildRows(lineCount, visible, foldedCounts);
  const gutterWidth = Math.max(3, String(lineCount).length) * 9 + 16;

  return (
    <FileViewerChrome
      {...props}
      s={s}
      lines={lines}
      lineCount={lineCount}
      gutterWidth={gutterWidth}
      shikiLines={shikiLines}
      rows={rows}
    />
  );
});

function buildRows(
  lineCount: number,
  visible: Set<number>,
  foldedCounts: Map<number, number>
): CodeRow[] {
  const rows: CodeRow[] = [];
  for (let i = 0; i < lineCount; i++) {
    if (!visible.has(i)) continue;
    rows.push({ type: 'line', index: i });
    const count = foldedCounts.get(i);
    if (count != null) {
      rows.push({ type: 'fold-placeholder', startLine: i, count });
    }
  }
  return rows;
}

// CSS keyframe for spinner + search highlight styles (injected once)
if (typeof document !== 'undefined') {
  const styleId = '__file-viewer-spin__';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      'mark.fv-search-match { background-color: rgba(255, 200, 0, 0.3); color: inherit; border-radius: 2px; }',
      'mark.fv-search-match.fv-search-match-active { background-color: rgba(255, 200, 0, 0.6); outline: 1px solid rgba(255, 200, 0, 0.8); }',
    ].join('\n');
    document.head.appendChild(style);
  }
}
