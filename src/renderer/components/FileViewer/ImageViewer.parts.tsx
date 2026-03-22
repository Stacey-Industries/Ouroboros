import React from 'react';

export type ZoomMode = 'fit' | '100' | 'custom';

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
};

const statusBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '2px 12px',
  borderTop: '1px solid var(--border-muted)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.6875rem',
  userSelect: 'none',
};

export interface ImageViewerToolbarProps {
  zoomMode: ZoomMode;
  zoomLabel: string;
  onFit: () => void;
  onActualSize: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  isSvg?: boolean;
  showSource?: boolean;
  onToggleSource?: () => void;
}

export function ImageViewerToolbar({
  zoomMode,
  zoomLabel,
  onFit,
  onActualSize,
  onZoomOut,
  onZoomIn,
  isSvg,
  showSource,
  onToggleSource,
}: ImageViewerToolbarProps): React.ReactElement {
  return (
    <div style={toolbarStyle}>
      <button onClick={onFit} title="Fit to window" style={getZoomButtonStyle(zoomMode === 'fit')}>
        Fit
      </button>
      <button
        onClick={onActualSize}
        title="100% (actual size)"
        style={getZoomButtonStyle(zoomMode === '100')}
      >
        100%
      </button>
      <button onClick={onZoomOut} title="Zoom out" style={getZoomButtonStyle(false)}>
        -
      </button>
      <button onClick={onZoomIn} title="Zoom in" style={getZoomButtonStyle(false)}>
        +
      </button>
      <span
        className="text-text-semantic-faint"
        style={{
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-ui)',
          marginLeft: '4px',
        }}
      >
        {zoomLabel}
      </span>
      {isSvg && onToggleSource && (
        <>
          <div style={{ flex: 1 }} />
          <button
            onClick={onToggleSource}
            title={showSource ? 'Show image' : 'View SVG source'}
            style={getZoomButtonStyle(!!showSource)}
          >
            {showSource ? 'Image' : 'Source'}
          </button>
        </>
      )}
    </div>
  );
}

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
  /** Pan offset (pixels) applied via CSS transform */
  panOffset: { x: number; y: number };
  /** Pointer handlers for pan (supports mouse, touch, pen) */
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  /** Scroll-wheel zoom */
  onWheel: (e: React.WheelEvent) => void;
  /** Whether panning is in progress (changes cursor) */
  isPanning: boolean;
  /** Container ref for scroll-wheel coordinate math */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

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
  return (
    <div
      ref={containerRef}
      style={{ ...getImageAreaStyle(zoomMode, isPanning), touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
    >
      {loadError ? (
        <ImageLoadError fileUrl={fileUrl} />
      ) : (
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            background: checkerboardBg,
            display: 'inline-block',
            lineHeight: 0,
          }}
        >
          <img
            ref={imgRef}
            src={fileUrl}
            alt={filePath}
            onLoad={onLoad}
            onError={onError}
            style={imgStyle}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

function ImageLoadError({ fileUrl }: { fileUrl: string }): React.ReactElement {
  return (
    <div
      className="text-status-error"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.875rem',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>!</span>
      <span>Failed to load image</span>
      <span
        className="text-text-semantic-faint"
        style={{
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          wordBreak: 'break-all',
        }}
      >
        {fileUrl}
      </span>
    </div>
  );
}

export interface ImageStatusBarProps {
  naturalWidth: number | null;
  naturalHeight: number | null;
  fileSize?: number;
  zoomLabel: string;
}

export function ImageStatusBar({
  naturalWidth,
  naturalHeight,
  fileSize,
  zoomLabel,
}: ImageStatusBarProps): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={statusBarStyle}>
      {naturalWidth != null && naturalHeight != null && (
        <span>
          {naturalWidth} x {naturalHeight} px
        </span>
      )}
      {fileSize != null && <span>{formatBytes(fileSize)}</span>}
      <span>{zoomLabel}</span>
    </div>
  );
}

export function getZoomLabel(zoomMode: ZoomMode, customZoom: number): string {
  if (zoomMode === 'fit') return 'Fit';
  if (zoomMode === '100') return '100%';
  return `${Math.round(customZoom * 100)}%`;
}

export function getImageStyle(
  zoomMode: ZoomMode,
  naturalWidth: number | null,
  naturalHeight: number | null,
  customZoom: number
): React.CSSProperties {
  if (zoomMode === 'fit') {
    return {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      display: 'block',
    };
  }

  if (zoomMode === '100') {
    return {
      width: naturalWidth ?? 'auto',
      height: naturalHeight ?? 'auto',
      display: 'block',
    };
  }

  return {
    width: naturalWidth != null ? naturalWidth * customZoom : 'auto',
    height: naturalHeight != null ? naturalHeight * customZoom : 'auto',
    display: 'block',
  };
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

function getZoomButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
    border: '1px solid',
    borderColor: active ? 'var(--interactive-accent)' : 'var(--border-semantic)',
    borderRadius: '4px',
    backgroundColor: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    cursor: 'pointer',
    lineHeight: '1.5',
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
