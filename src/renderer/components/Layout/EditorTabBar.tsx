/**
 * EditorTabBar — renders file tabs and multi-buffer tabs in the centre pane header.
 *
 * Extracted from App.tsx. Reads open files from FileViewerManager context
 * and multi-buffers from MultiBufferManager context.
 * Passed as the `editorTabBar` slot of AppLayout / CentrePane.
 */

import React, { useCallback } from 'react';
import {
  useFileViewerManager,
  FileViewerTabs,
} from '../FileViewer';
import {
  useMultiBufferManager,
  type MultiBufferTab,
} from '../FileViewer/MultiBufferManager';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  height: '100%',
  alignItems: 'stretch',
};

const spacerStyle: React.CSSProperties = { flex: 1 };

const multiBufferTabStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 10px 0 12px',
  height: '100%',
  flexShrink: 0,
  cursor: 'pointer',
  userSelect: 'none',
  borderRight: '1px solid var(--border)',
  borderBottom: '2px solid transparent',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  minWidth: '80px',
  maxWidth: '200px',
  transition: 'background-color 100ms ease, color 100ms ease',
};

const multiBufferIconStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  opacity: 0.6,
};

const multiBufferLabelStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const closeButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '3px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
};

const newMultiBufferButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '100%',
  flexShrink: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontFamily: 'var(--font-ui)',
  padding: 0,
  borderRight: '1px solid var(--border)',
};

function activateMultiBuffer(id: string): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
  );
}

function deactivateMultiBuffer(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
}

function useEditorTabActions(
  setActive: (filePath: string) => void,
  openMultiBuffer: () => string,
  closeMultiBuffer: (id: string) => void,
) {
  const handleNewMultiBuffer = useCallback(() => {
    activateMultiBuffer(openMultiBuffer());
  }, [openMultiBuffer]);

  const handleActivateMultiBuffer = useCallback((id: string) => {
    activateMultiBuffer(id);
  }, []);

  const handleCloseMultiBuffer = useCallback((id: string) => {
    closeMultiBuffer(id);
    deactivateMultiBuffer();
  }, [closeMultiBuffer]);

  const handleActivateFile = useCallback((filePath: string) => {
    deactivateMultiBuffer();
    setActive(filePath);
  }, [setActive]);

  return {
    handleNewMultiBuffer,
    handleActivateMultiBuffer,
    handleCloseMultiBuffer,
    handleActivateFile,
  };
}

function MultiBufferTabCloseIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

interface MultiBufferTabItemProps {
  buffer: MultiBufferTab;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function MultiBufferTabItem({
  buffer,
  onActivate,
  onClose,
}: MultiBufferTabItemProps): React.ReactElement {
  const handleAuxClick = useCallback((event: React.MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(buffer.id);
  }, [buffer.id, onClose]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') onActivate(buffer.id);
  }, [buffer.id, onActivate]);

  const handleCloseClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClose(buffer.id);
  }, [buffer.id, onClose]);

  return (
    <div
      role="tab"
      tabIndex={0}
      title={buffer.config.name}
      onClick={() => onActivate(buffer.id)}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      style={multiBufferTabStyle}
    >
      <span style={multiBufferIconStyle}>{'\u2630'}</span>
      <span style={multiBufferLabelStyle}>{buffer.config.name}</span>
      <button onClick={handleCloseClick} aria-label={`Close ${buffer.config.name}`} tabIndex={-1} style={closeButtonStyle}>
        <MultiBufferTabCloseIcon />
      </button>
    </div>
  );
}

interface MultiBufferTabsProps {
  buffers: MultiBufferTab[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function MultiBufferTabs({
  buffers,
  onActivate,
  onClose,
}: MultiBufferTabsProps): React.ReactElement {
  return (
    <>
      {buffers.map((buffer) => (
        <MultiBufferTabItem key={buffer.id} buffer={buffer} onActivate={onActivate} onClose={onClose} />
      ))}
    </>
  );
}

function NewMultiBufferButton({
  onClick,
}: {
  onClick: () => void;
}): React.ReactElement {
  return (
    <button onClick={onClick} title="New Multi-Buffer" style={newMultiBufferButtonStyle}>
      {'\u2630'}+
    </button>
  );
}

export function EditorTabBar(): React.ReactElement {
  const { openFiles, activeIndex, setActive, closeFile } = useFileViewerManager();
  const { multiBuffers, openMultiBuffer, closeMultiBuffer } = useMultiBufferManager();
  const {
    handleNewMultiBuffer,
    handleActivateMultiBuffer,
    handleCloseMultiBuffer,
    handleActivateFile,
  } = useEditorTabActions(setActive, openMultiBuffer, closeMultiBuffer);

  return (
    <div style={containerStyle}>
      {openFiles.length > 0 && (
        <FileViewerTabs
          files={openFiles}
          activeIndex={activeIndex}
          onActivate={handleActivateFile}
          onClose={closeFile}
        />
      )}
      <MultiBufferTabs
        buffers={multiBuffers}
        onActivate={handleActivateMultiBuffer}
        onClose={handleCloseMultiBuffer}
      />
      <NewMultiBufferButton onClick={handleNewMultiBuffer} />
      {openFiles.length === 0 && multiBuffers.length === 0 && (
        <div style={spacerStyle} aria-hidden="true" />
      )}
      <div style={spacerStyle} />
    </div>
  );
}
