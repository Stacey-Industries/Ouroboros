import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ImageStatusBar,
  ImageViewerToolbar,
  ImageViewport,
  getImageStyle,
  getZoomLabel,
} from './ImageViewer.parts';

export interface ImageViewerProps {
  filePath: string;
  fileSize?: number;
}

type ZoomMode = 'fit' | '100' | 'custom';

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--bg)',
};

/**
 * ImageViewer â€” renders local image files using the file:// protocol.
 * Supports fit-to-window, 100%, zoom in/out, and shows pixel dimensions.
 */
export function ImageViewer({
  filePath,
  fileSize,
}: ImageViewerProps): React.ReactElement {
  const viewer = useImageViewerState(filePath);

  return (
    <div style={rootStyle}>
      <ImageViewerToolbar
        zoomMode={viewer.zoomMode}
        zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)}
        onFit={viewer.setFit}
        onActualSize={viewer.setActualSize}
        onZoomOut={viewer.zoomOut}
        onZoomIn={viewer.zoomIn}
      />
      <ImageViewport
        fileUrl={viewer.fileUrl}
        filePath={filePath}
        loadError={viewer.loadError}
        imgRef={viewer.imgRef}
        onLoad={viewer.handleLoad}
        onError={viewer.handleError}
        zoomMode={viewer.zoomMode}
        imgStyle={getImageStyle(
          viewer.zoomMode,
          viewer.naturalWidth,
          viewer.naturalHeight,
          viewer.customZoom
        )}
      />
      <ImageStatusBar
        naturalWidth={viewer.naturalWidth}
        naturalHeight={viewer.naturalHeight}
        fileSize={fileSize}
        zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)}
      />
    </div>
  );
}

function useImageViewerState(filePath: string) {
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoomMode('fit');
    setCustomZoom(1);
    setLoadError(false);
  }, [filePath]);

  const handleLoad = useCallback(() => {
    const image = imgRef.current;
    if (!image) return;
    setNaturalWidth(image.naturalWidth);
    setNaturalHeight(image.naturalHeight);
    setLoadError(false);
  }, []);

  return {
    naturalWidth,
    naturalHeight,
    zoomMode,
    customZoom,
    loadError,
    imgRef,
    fileUrl: toFileUrl(filePath),
    handleLoad,
    handleError: useCallback(() => setLoadError(true), []),
    zoomIn: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1.25), []),
    zoomOut: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1 / 1.25), []),
    setFit: useCallback(() => setZoomMode('fit'), []),
    setActualSize: useCallback(() => setZoomMode('100'), []),
  };
}

function toFileUrl(filePath: string): string {
  return filePath.startsWith('file://')
    ? filePath
    : `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`;
}

function adjustCustomZoom(
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>,
  setCustomZoom: React.Dispatch<React.SetStateAction<number>>,
  factor: number
): void {
  setZoomMode('custom');
  setCustomZoom((previous) => Math.min(Math.max(previous * factor, 0.05), 8));
}
