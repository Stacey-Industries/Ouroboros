import React, { useState, useCallback, useRef, useEffect } from 'react';

export interface ImageViewerProps {
  filePath: string;
  fileSize?: number;
}

type ZoomMode = 'fit' | '100' | 'custom';

/**
 * ImageViewer — renders local image files using the file:// protocol.
 * Supports fit-to-window, 100%, zoom in/out, and shows pixel dimensions.
 */
export function ImageViewer({ filePath, fileSize }: ImageViewerProps): React.ReactElement {
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Normalize the path to a file:// URL.
  // On Windows paths use backslashes; convert to forward slashes.
  const fileUrl = filePath.startsWith('file://')
    ? filePath
    : 'file:///' + filePath.replace(/\\/g, '/').replace(/^\//, '');

  const handleLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalWidth(img.naturalWidth);
    setNaturalHeight(img.naturalHeight);
    setLoadError(false);
  }, []);

  const handleError = useCallback(() => {
    setLoadError(true);
  }, []);

  // Reset state when file changes
  useEffect(() => {
    setNaturalWidth(null);
    setNaturalHeight(null);
    setZoomMode('fit');
    setCustomZoom(1);
    setLoadError(false);
  }, [filePath]);

  const zoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((prev) => Math.min(prev * 1.25, 8));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((prev) => Math.max(prev / 1.25, 0.05));
  }, []);

  const setFit = useCallback(() => {
    setZoomMode('fit');
  }, []);

  const set100 = useCallback(() => {
    setZoomMode('100');
  }, []);

  // Compute displayed zoom percentage for status bar
  const zoomLabel = (() => {
    if (zoomMode === 'fit') return 'Fit';
    if (zoomMode === '100') return '100%';
    return `${Math.round(customZoom * 100)}%`;
  })();

  // Image style based on zoom mode
  const imgStyle: React.CSSProperties = (() => {
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
    // custom
    return {
      width: naturalWidth != null ? naturalWidth * customZoom : 'auto',
      height: naturalHeight != null ? naturalHeight * customZoom : 'auto',
      display: 'block',
    };
  })();

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
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
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 12px',
          borderBottom: '1px solid var(--border-muted)',
          backgroundColor: 'var(--bg-secondary)',
          userSelect: 'none',
        }}
      >
        <button onClick={setFit} title="Fit to window" style={btnStyle(zoomMode === 'fit')}>
          Fit
        </button>
        <button onClick={set100} title="100% (actual size)" style={btnStyle(zoomMode === '100')}>
          100%
        </button>
        <button onClick={zoomOut} title="Zoom out" style={btnStyle(false)}>
          −
        </button>
        <button onClick={zoomIn} title="Zoom in" style={btnStyle(false)}>
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

      {/* Image area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          alignItems: zoomMode === 'fit' ? 'center' : 'flex-start',
          justifyContent: zoomMode === 'fit' ? 'center' : 'flex-start',
          padding: '16px',
          backgroundColor: 'var(--bg)',
        }}
      >
        {loadError ? (
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
            <span style={{ fontSize: '1.5rem' }}>⚠</span>
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
        ) : (
          <img
            ref={imgRef}
            src={fileUrl}
            alt={filePath}
            onLoad={handleLoad}
            onError={handleError}
            style={imgStyle}
            draggable={false}
          />
        )}
      </div>

      {/* Status bar */}
      <div
        style={{
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
        }}
      >
        {naturalWidth != null && naturalHeight != null && (
          <span>
            {naturalWidth} × {naturalHeight} px
          </span>
        )}
        {fileSize != null && <span>{formatBytes(fileSize)}</span>}
        <span>{zoomLabel}</span>
      </div>
    </div>
  );
}
