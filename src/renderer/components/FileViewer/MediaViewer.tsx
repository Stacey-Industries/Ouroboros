import React, { useMemo } from 'react';

import { inferMimeType, useBinaryObjectUrl } from './binaryObjectUrl';
import { formatBytes } from './ImageViewer.parts';

export interface MediaViewerProps {
  filePath: string;
  mediaType: 'audio' | 'video';
  fileSize?: number;
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  backgroundColor: 'var(--surface-base)',
};

const toolbarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  borderBottom: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
};

const stageStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  overflow: 'auto',
};

const statusBarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '4px 12px',
  borderTop: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--surface-panel)',
  fontSize: '0.6875rem',
  userSelect: 'none',
};

const mediaSurfaceStyle: React.CSSProperties = {
  width: 'min(100%, 980px)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '10px',
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 88%, black), var(--surface-base))',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
  overflow: 'hidden',
};

const buttonStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: 'var(--text-semantic-secondary)',
  cursor: 'pointer',
};

const mediaStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxHeight: '72vh',
  backgroundColor: 'black',
};

function openExternalFile(filePath: string): void {
  void window.electronAPI.app.openExternal(filePath);
}

function fileLabel(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function MediaToolbar({ filePath, title }: { filePath: string; title: string }): React.ReactElement {
  return (
    <div style={toolbarStyle}>
      <span className="text-text-semantic-primary" style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-ui)' }}>
        {title}
      </span>
      <span className="text-text-semantic-faint" style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)' }}>
        {fileLabel(filePath)}
      </span>
      <div style={{ flex: 1 }} />
      <button style={buttonStyle} onClick={() => openExternalFile(filePath)}>Open External</button>
    </div>
  );
}

function MediaStage({ mediaType, fileUrl, error }: { mediaType: 'audio' | 'video'; fileUrl: string | null; error: string | null }): React.ReactElement {
  const MediaTag = mediaType;
  return (
    <div style={stageStyle}>
      <div style={mediaSurfaceStyle}>
        {error ? (
          <div className="text-status-error" style={{ padding: '24px', textAlign: 'center' }}>
            Failed to load {mediaType}: {error}
          </div>
        ) : fileUrl ? (
          <MediaTag controls preload="metadata" src={fileUrl} style={mediaStyle}>
            Your environment could not load this {mediaType} file.
          </MediaTag>
        ) : (
          <div className="text-text-semantic-faint" style={{ padding: '24px', textAlign: 'center' }}>
            Loading {mediaType}...
          </div>
        )}
      </div>
    </div>
  );
}

function MediaStatusBar({ mediaType, fileSize }: { mediaType: 'audio' | 'video'; fileSize?: number }): React.ReactElement {
  return (
    <div className="text-text-semantic-faint" style={statusBarStyle}>
      <span>{mediaType === 'video' ? 'HTML5 video preview' : 'HTML5 audio preview'}</span>
      {fileSize != null && <span>{formatBytes(fileSize)}</span>}
    </div>
  );
}

export function MediaViewer({ filePath, mediaType, fileSize }: MediaViewerProps): React.ReactElement {
  const mimeType = useMemo(
    () => inferMimeType(filePath, mediaType === 'video' ? 'video/mp4' : 'audio/mpeg'),
    [filePath, mediaType],
  );
  const { objectUrl: fileUrl, error } = useBinaryObjectUrl(filePath, mimeType);
  const title = mediaType === 'video' ? 'Video Preview' : 'Audio Preview';
  return (
    <div style={rootStyle}>
      <MediaToolbar filePath={filePath} title={title} />
      <MediaStage mediaType={mediaType} fileUrl={fileUrl} error={error} />
      <MediaStatusBar mediaType={mediaType} fileSize={fileSize} />
    </div>
  );
}
