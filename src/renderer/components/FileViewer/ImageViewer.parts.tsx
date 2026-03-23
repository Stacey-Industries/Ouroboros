import React from 'react';

export type ZoomMode = 'fit' | '100' | 'custom';

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  userSelect: 'none',
};

const statusBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '2px 12px',
  borderTop: '1px solid var(--border-subtle)',
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

function ZoomModeButtons({
  zoomMode,
  onFit,
  onActualSize,
  onZoomOut,
  onZoomIn,
}: Pick<
  ImageViewerToolbarProps,
  'zoomMode' | 'onFit' | 'onActualSize' | 'onZoomOut' | 'onZoomIn'
>): React.ReactElement {
  return (
    <>
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
    </>
  );
}

function SvgSourceToggle({
  showSource,
  onToggleSource,
}: Pick<ImageViewerToolbarProps, 'showSource' | 'onToggleSource'>): React.ReactElement | null {
  if (!onToggleSource) {
    return null;
  }

  return (
    <button
      onClick={onToggleSource}
      title={showSource ? 'Show image' : 'View SVG source'}
      style={getZoomButtonStyle(Boolean(showSource))}
    >
      {showSource ? 'Image' : 'Source'}
    </button>
  );
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
      <ZoomModeButtons
        zoomMode={zoomMode}
        onFit={onFit}
        onActualSize={onActualSize}
        onZoomOut={onZoomOut}
        onZoomIn={onZoomIn}
      />
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
          <SvgSourceToggle showSource={showSource} onToggleSource={onToggleSource} />
        </>
      )}
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
  customZoom: number,
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
