import React from 'react';

import { getImageStyle, getZoomLabel, ImageStatusBar, ImageViewerToolbar } from './ImageViewer.parts';
import { ImageViewport } from './ImageViewerViewport';
import type { ImageViewerState } from './useImageViewerState';

export interface ImageViewerFrameProps {
  filePath: string;
  fileSize?: number;
  viewer: ImageViewerState;
  isSvg: boolean;
  showSource: boolean;
  onToggleSource: () => void;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--surface-base)',
};

export function ImageViewerFrame({
  filePath,
  fileSize,
  viewer,
  isSvg,
  showSource,
  onToggleSource,
}: ImageViewerFrameProps): React.ReactElement<any> {
  const zoomLabel = getZoomLabel(viewer.zoomMode, viewer.customZoom);
  return <div style={rootStyle}><ImageViewerToolbar zoomMode={viewer.zoomMode} zoomLabel={zoomLabel} onFit={viewer.setFit} onActualSize={viewer.setActualSize} onZoomOut={viewer.zoomOut} onZoomIn={viewer.zoomIn} isSvg={isSvg} showSource={showSource} onToggleSource={onToggleSource} /><ImageViewport fileUrl={viewer.fileUrl} filePath={filePath} loadError={viewer.loadError} imgRef={viewer.imgRef} onLoad={viewer.handleLoad} onError={viewer.handleError} zoomMode={viewer.zoomMode} imgStyle={getImageStyle(viewer.zoomMode, viewer.naturalWidth, viewer.naturalHeight, viewer.customZoom)} panOffset={viewer.panOffset} onPointerDown={viewer.handlePointerDown} onPointerMove={viewer.handlePointerMove} onPointerUp={viewer.handlePointerUp} onPointerLeave={viewer.handlePointerUp} onWheel={viewer.handleWheel} isPanning={viewer.isPanning} containerRef={viewer.containerRef} /><ImageStatusBar naturalWidth={viewer.naturalWidth} naturalHeight={viewer.naturalHeight} fileSize={fileSize} zoomLabel={zoomLabel} /></div>;
}
