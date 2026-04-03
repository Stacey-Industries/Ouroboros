import React, { Suspense } from 'react';

import { getZoomLabel, ImageStatusBar, ImageViewerToolbar } from './ImageViewer.parts';
import type { ImageViewerState } from './useImageViewerState';

const LazyMonacoEditor = React.lazy(() => import('./MonacoEditor').then((mod) => ({ default: mod.MonacoEditor })));

export interface ImageViewerSourceFrameProps {
  fileSize?: number;
  viewer: ImageViewerState;
  isSvg: boolean;
  showSource: boolean;
  onToggleSource: () => void;
  children: React.ReactNode;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

function SourceLoader({ content, filePath }: { content: string; filePath: string }): React.ReactElement {
  return (
    <Suspense fallback={<div className="text-text-semantic-faint" style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>Loading editor...</div>}>
      <LazyMonacoEditor filePath={filePath} content={content} readOnly={true} />
    </Suspense>
  );
}

export function ImageViewerSourceFrame({
  fileSize,
  viewer,
  isSvg,
  showSource,
  onToggleSource,
  children,
}: ImageViewerSourceFrameProps): React.ReactElement {
  return (
    <div style={rootStyle}>
      <ImageViewerToolbar zoomMode={viewer.zoomMode} zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)} onFit={viewer.setFit} onActualSize={viewer.setActualSize} onZoomOut={viewer.zoomOut} onZoomIn={viewer.zoomIn} isSvg={isSvg} showSource={showSource} onToggleSource={onToggleSource} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
      <ImageStatusBar naturalWidth={viewer.naturalWidth} naturalHeight={viewer.naturalHeight} fileSize={fileSize} zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)} />
    </div>
  );
}

export function SvgSourceView({ content, filePath }: { content: string; filePath: string }): React.ReactElement {
  return <SourceLoader content={content} filePath={filePath} />;
}
