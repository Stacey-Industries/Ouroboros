import React from 'react';

import type { ZoomMode } from './ImageViewer.parts';

/** Checkerboard background pattern for transparency */
const checkerboardBg =
  'repeating-conic-gradient(#80808020 0% 25%, transparent 0% 50%) 0 0 / 16px 16px';

export interface ImageViewportProps {
  fileUrl: string;
  filePath: string;
  loadError: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onLoad: () => void;
  onError: () => void;
  zoomMode: ZoomMode;
  imgStyle: React.CSSProperties;
  panOffset: { x: number; y: number };
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
  isPanning: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function getImageAreaStyle(zoomMode: ZoomMode, isPanning: boolean): React.CSSProperties {
  return {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: zoomMode === 'fit' ? 'center' : 'flex-start',
    justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
    padding: '16px',
    backgroundColor: 'var(--surface-base)',
    cursor: isPanning ? 'grabbing' : 'grab',
  };
}

function ImageTransformLayer({ fileUrl, filePath, imgRef, onLoad, onError, imgStyle, panOffset }: Pick<ImageViewportProps, 'fileUrl' | 'filePath' | 'imgRef' | 'onLoad' | 'onError' | 'imgStyle' | 'panOffset'>): React.ReactElement { return <div style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, background: checkerboardBg, display: 'inline-block', lineHeight: 0 }}><img ref={imgRef as React.RefObject<HTMLImageElement>} src={fileUrl} alt={filePath} onLoad={onLoad} onError={onError} style={imgStyle} draggable={false} /></div>; }

function ImageLoadError({ fileUrl }: { fileUrl: string }): React.ReactElement { return <div className="text-status-error" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontSize: '0.875rem', textAlign: 'center' }}><span style={{ fontSize: '1.5rem' }}>!</span><span>Failed to load image</span><span className="text-text-semantic-faint" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{fileUrl}</span></div>; }

export function ImageViewport({
  fileUrl,
  filePath,
  loadError,
  imgRef,
  onLoad,
  onError,
  zoomMode,
  imgStyle,
  panOffset,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
  isPanning,
  containerRef,
}: ImageViewportProps): React.ReactElement {
  return <div ref={containerRef as React.RefObject<HTMLDivElement>} style={{ ...getImageAreaStyle(zoomMode, isPanning), touchAction: 'none' }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerLeave} onWheel={onWheel}>{loadError ? <ImageLoadError fileUrl={fileUrl} /> : <ImageTransformLayer fileUrl={fileUrl} filePath={filePath} imgRef={imgRef} onLoad={onLoad} onError={onError} imgStyle={imgStyle} panOffset={panOffset} />}</div>;
}
