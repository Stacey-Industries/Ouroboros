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
import { useMultiBufferManager } from '../FileViewer/MultiBufferManager';

export function EditorTabBar(): React.ReactElement {
  const { openFiles, activeIndex, setActive, closeFile } = useFileViewerManager();
  const { multiBuffers, openMultiBuffer, closeMultiBuffer } = useMultiBufferManager();

  const handleNewMultiBuffer = useCallback(() => {
    const id = openMultiBuffer();
    // Dispatch event so the centre pane switches to multi-buffer view
    window.dispatchEvent(
      new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
    );
  }, [openMultiBuffer]);

  const handleActivateMultiBuffer = useCallback((id: string) => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
    );
  }, []);

  const handleCloseMultiBuffer = useCallback((id: string) => {
    closeMultiBuffer(id);
    // If this was the active multi-buffer, switch back to file view
    window.dispatchEvent(
      new CustomEvent('agent-ide:deactivate-multi-buffer'),
    );
  }, [closeMultiBuffer]);

  const handleActivateFile = useCallback((filePath: string) => {
    // Deactivate any multi-buffer first
    window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
    setActive(filePath);
  }, [setActive]);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', alignItems: 'stretch' }}>
      {/* File tabs */}
      {openFiles.length > 0 && (
        <FileViewerTabs
          files={openFiles}
          activeIndex={activeIndex}
          onActivate={handleActivateFile}
          onClose={closeFile}
        />
      )}

      {/* Multi-buffer tabs */}
      {multiBuffers.map((mb) => (
        <div
          key={mb.id}
          role="tab"
          tabIndex={0}
          title={mb.config.name}
          onClick={() => handleActivateMultiBuffer(mb.id)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); handleCloseMultiBuffer(mb.id); } }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleActivateMultiBuffer(mb.id); }}
          style={{
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
          }}
        >
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{'\u2630'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mb.config.name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); handleCloseMultiBuffer(mb.id); }}
            aria-label={`Close ${mb.config.name}`}
            tabIndex={-1}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '16px', height: '16px', borderRadius: '3px',
              border: 'none', background: 'transparent',
              color: 'var(--text-faint)', cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}

      {/* New Multi-Buffer button */}
      <button
        onClick={handleNewMultiBuffer}
        title="New Multi-Buffer"
        style={{
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
        }}
      >
        {'\u2630'}+
      </button>

      {/* Spacer */}
      {openFiles.length === 0 && multiBuffers.length === 0 && (
        <div style={{ flex: 1 }} aria-hidden="true" />
      )}
      <div style={{ flex: 1 }} />
    </div>
  );
}
