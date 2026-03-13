import React from 'react';

type ZoomMode = 'fit' | '100' | 'custom';

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-muted)',
  backgroundColor: 'var(--bg-secondary)',
  userSelect: 'none',
};

const statusBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '2px 12px',
  borderTop: '1px solid var(--border-muted)',
  backgroundColor: 'var(--bg-secondary)',
  fontSize: '0.6875rem',
  color: 'var(--text-faint)',
  userSelect: 'none',
};

export interface ImageViewerToolbarProps {
  zoomMode: ZoomMode;
  zoomLabel: string;
  onFit: () => void;
  onActualSize: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
}

export function ImageViewerToolbar({
  zoomMode,
  zoomLabel,
  onFit,
  onActualSize,
  onZoomOut,
  onZoomIn,
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
        style={{
          fontSize: '0.6875rem',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-ui)',
          marginLeft: '4px',
        }}
      >
        {zoomLabel}
      </span>
    </div>
  );
}

export interface ImageViewportProps {
  fileUrl: string;
  filePath: string;
  loadError: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onLoad: () => void;
  onError: () => void;
  zoomMode: ZoomMode;
  imgStyle: React.CSSProperties;
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
}: ImageViewportProps): React.ReactElement {
  return (
    <div style={getImageAreaStyle(zoomMode)}>
      {loadError ? (
        <ImageLoadError fileUrl={fileUrl} />
      ) : (
        <img
          ref={imgRef}
          src={fileUrl}
          alt={filePath}
          onLoad={onLoad}
          onError={onError}
          style={imgStyle}
          draggable={false}
        />
      )}
    </div>
  );
}

function ImageLoadError({ fileUrl }: { fileUrl: string }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--error, #f85149)',
        fontSize: '0.875rem',
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: '1.5rem' }}>!</span>
      <span>Failed to load image</span>
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-faint)',
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
    <div style={statusBarStyle}>
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

function getImageAreaStyle(zoomMode: ZoomMode): React.CSSProperties {
  return {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: zoomMode === 'fit' ? 'center' : 'flex-start',
    justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
    padding: '16px',
    backgroundColor: 'var(--bg)',
  };
}

function getZoomButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px',
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-ui)',
    fontWeight: 500,
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    borderRadius: '4px',
    backgroundColor: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-muted)',
    cursor: 'pointer',
    lineHeight: '1.5',
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
