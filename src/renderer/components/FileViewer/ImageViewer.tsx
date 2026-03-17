import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ImageStatusBar,
  ImageViewerToolbar,
  ImageViewport,
  getImageStyle,
  getZoomLabel,
  formatBytes,
} from './ImageViewer.parts';
import type { ZoomMode } from './ImageViewer.parts';

export interface ImageViewerProps {
  filePath: string;
  fileSize?: number;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: 'var(--bg)',
};

/**
 * ImageViewer -- renders local image files using the file:// protocol.
 * Supports fit-to-window, 100%, zoom in/out with scroll wheel,
 * pan with mouse drag, checkerboard transparency background,
 * and SVG source viewing via Monaco read-only.
 */
export function ImageViewer({
  filePath,
  fileSize,
}: ImageViewerProps): React.ReactElement {
  const viewer = useImageViewerState(filePath);
  const isSvg = filePath.toLowerCase().endsWith('.svg');
  const [showSource, setShowSource] = useState(false);
  const [svgSource, setSvgSource] = useState<string | null>(null);

  // Load SVG source on demand
  useEffect(() => {
    if (!isSvg) return;
    let cancelled = false;
    window.electronAPI.files.readFile(filePath).then((result) => {
      if (!cancelled && result.success && result.content != null) {
        setSvgSource(result.content);
      }
    });
    return () => { cancelled = true; };
  }, [filePath, isSvg]);

  // Reset source view when file changes
  useEffect(() => {
    setShowSource(false);
  }, [filePath]);

  if (showSource && svgSource != null) {
    // Lazy-load Monaco for SVG source view
    return (
      <div style={rootStyle}>
        <ImageViewerToolbar
          zoomMode={viewer.zoomMode}
          zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)}
          onFit={viewer.setFit}
          onActualSize={viewer.setActualSize}
          onZoomOut={viewer.zoomOut}
          onZoomIn={viewer.zoomIn}
          isSvg={isSvg}
          showSource={showSource}
          onToggleSource={() => setShowSource((v) => !v)}
        />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <SvgSourceView content={svgSource} filePath={filePath} />
        </div>
        <ImageStatusBar
          naturalWidth={viewer.naturalWidth}
          naturalHeight={viewer.naturalHeight}
          fileSize={fileSize}
          zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)}
        />
      </div>
    );
  }

  return (
    <div style={rootStyle}>
      <ImageViewerToolbar
        zoomMode={viewer.zoomMode}
        zoomLabel={getZoomLabel(viewer.zoomMode, viewer.customZoom)}
        onFit={viewer.setFit}
        onActualSize={viewer.setActualSize}
        onZoomOut={viewer.zoomOut}
        onZoomIn={viewer.zoomIn}
        isSvg={isSvg}
        showSource={showSource}
        onToggleSource={() => setShowSource((v) => !v)}
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
        panOffset={viewer.panOffset}
        onPointerDown={viewer.handlePointerDown}
        onPointerMove={viewer.handlePointerMove}
        onPointerUp={viewer.handlePointerUp}
        onPointerLeave={viewer.handlePointerUp}
        onWheel={viewer.handleWheel}
        isPanning={viewer.isPanning}
        containerRef={viewer.containerRef}
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

/** Lazy Monaco wrapper for SVG source viewing */
function SvgSourceView({ content, filePath }: { content: string; filePath: string }) {
  // Dynamically import MonacoEditor to avoid circular deps
  const [MonacoEditor, setMonacoEditor] = useState<React.ComponentType<{
    filePath: string;
    content: string;
    readOnly: boolean;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('./MonacoEditor').then((mod) => {
      if (!cancelled) {
        setMonacoEditor(() => mod.MonacoEditor);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!MonacoEditor) {
    return (
      <div style={{ padding: 16, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
        Loading editor...
      </div>
    );
  }

  return (
    <MonacoEditor
      filePath={filePath}
      content={content}
      readOnly={true}
    />
  );
}

function useImageViewerState(filePath: string) {
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoomMode('fit');
    setCustomZoom(1);
    setLoadError(false);
    setPanOffset({ x: 0, y: 0 });
  }, [filePath]);

  const handleLoad = useCallback(() => {
    const image = imgRef.current;
    if (!image) return;
    setNaturalWidth(image.naturalWidth);
    setNaturalHeight(image.naturalHeight);
    setLoadError(false);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
    e.preventDefault();
  }, [panOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.offsetX + dx,
      y: panStartRef.current.offsetY + dy,
    });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoomMode('custom');
    setCustomZoom((prev) => Math.min(Math.max(prev * factor, 0.05), 8));
  }, []);

  return {
    naturalWidth,
    naturalHeight,
    zoomMode,
    customZoom,
    loadError,
    imgRef,
    containerRef,
    panOffset,
    isPanning,
    fileUrl: toFileUrl(filePath),
    handleLoad,
    handleError: useCallback(() => setLoadError(true), []),
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    zoomIn: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1.25), []),
    zoomOut: useCallback(() => adjustCustomZoom(setZoomMode, setCustomZoom, 1 / 1.25), []),
    setFit: useCallback(() => {
      setZoomMode('fit');
      setPanOffset({ x: 0, y: 0 });
    }, []),
    setActualSize: useCallback(() => {
      setZoomMode('100');
      setPanOffset({ x: 0, y: 0 });
    }, []),
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
