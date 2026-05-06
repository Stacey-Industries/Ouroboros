// Wave 82.1 — instrumentation: trace render decisions so we can diagnose F1
// (toolbar disappears after Edit→Exit). Remove after the symptom is closed.
import log from 'electron-log/renderer';
import React, { memo, useEffect, useRef } from 'react';

import type { CodeRow } from './codeViewTypes';
import { EmptyState } from './EmptyState';
import { ErrorDisplay } from './ErrorDisplay';
import { FileViewerChrome } from './FileViewerChrome';
import { computeVisibleLines, parseShikiLines } from './fileViewerUtils';
import { HexViewer } from './HexViewer';
import { ImageViewer } from './ImageViewer';
import { injectLinks } from './linkDetector';
import { LoadingState } from './LoadingState';
import { MediaViewer } from './MediaViewer';
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
  isAudio?: boolean;
  isVideo?: boolean;
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
export const FileViewer = memo(function FileViewer(props: FileViewerProps): React.ReactElement {
  return <FileViewerInner {...props} />;
});

function hasSpecialViewer(props: FileViewerProps): boolean {
  return Boolean(props.isImage || props.isPdf || props.isAudio || props.isVideo || props.isBinary);
}

function renderInitialViewerState(props: FileViewerProps): React.ReactElement | null {
  if (!props.filePath && !props.isLoading) {
    log.info('[trace:FileViewer] renderInitial → EmptyState (no filePath, not loading)', {
      filePath: props.filePath,
      isLoading: props.isLoading,
      hasContent: props.content !== null,
      isDirty: props.isDirty,
    });
    return <EmptyState />;
  }
  if (props.isLoading) {
    log.info('[trace:FileViewer] renderInitial → LoadingState', { filePath: props.filePath });
    return <LoadingState />;
  }
  if (props.error) {
    log.info('[trace:FileViewer] renderInitial → ErrorDisplay', {
      filePath: props.filePath,
      error: props.error,
    });
    return <ErrorDisplay error={props.error} />;
  }
  // Wave 82 (post-smoke): if filePath is set but content is null, fall through
  // to the chrome and render with empty content. Returning EmptyState here
  // momentarily during edit-mode transitions caused the entire toolbar
  // (Edit/Minimap/Blame/Outline/History) to vanish until the user closed and
  // reopened the file. Chrome handles null content gracefully.
  if (props.content === null && !props.filePath && !hasSpecialViewer(props)) return <EmptyState />;
  // Wave 82.1 — instrument: log the resolved state when chrome will render.
  // If the toolbar disappears after Edit→Exit, this trace tells us whether
  // FileViewerChrome stayed mounted (and the toolbar issue is downstream)
  // or whether something forced one of the early-return EmptyState paths.
  log.info('[trace:FileViewer] renderInitial → null (chrome path)', {
    filePath: props.filePath,
    hasContent: props.content !== null,
    contentLen: props.content?.length ?? 0,
    isDirty: props.isDirty,
    isImage: props.isImage,
    isBinary: props.isBinary,
  });
  return null;
}

function renderMediaViewer(
  filePath: string,
  isVideo?: boolean,
  isAudio?: boolean,
): React.ReactElement | null {
  if (!isAudio && !isVideo) return null;
  return <MediaViewer filePath={filePath} mediaType={isVideo ? 'video' : 'audio'} />;
}

function renderBinaryViewer(filePath: string, binaryContent?: Uint8Array): React.ReactElement {
  if (binaryContent) return <HexViewer content={binaryContent} filePath={filePath} />;
  return <LoadingState />;
}

function renderFileTypeViewer(props: FileViewerProps): React.ReactElement | null {
  const { filePath, isImage, isPdf, isAudio, isVideo, isBinary, binaryContent } = props;
  if (!filePath) return null;
  if (isImage) return <ImageViewer filePath={filePath} />;
  if (isPdf) return <PdfViewer filePath={filePath} />;
  if (isAudio || isVideo) return renderMediaViewer(filePath, isVideo, isAudio);
  if (isBinary) return renderBinaryViewer(filePath, binaryContent);
  return null;
}

function renderSpecialViewer(props: FileViewerProps): React.ReactElement | null {
  return renderInitialViewerState(props) ?? renderFileTypeViewer(props);
}

function useTraceMountCount(filePath: string | null): void {
  const countRef = useRef(0);
  useEffect(() => {
    countRef.current += 1;
    log.info(`[trace:EditBtn] FileViewerInner mount #${countRef.current}`, { filePath });
  }, [filePath]);
}

const FileViewerInner = memo(function FileViewerInner(props: FileViewerProps): React.ReactElement {
  useTraceMountCount(props.filePath);
  const s = useFileViewerState(props);
  const specialViewer = renderSpecialViewer(props);
  if (specialViewer) return specialViewer;

  const { content } = props;
  const shikiLines = s.highlightedHtml ? parseShikiLines(injectLinks(s.highlightedHtml)) : null;
  const lines = (content ?? '').split('\n');
  const lineCount = lines.length;
  const { visible, foldedCounts } = computeVisibleLines(
    lineCount,
    s.collapsedFolds,
    s.foldableLines,
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
  foldedCounts: Map<number, number>,
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
