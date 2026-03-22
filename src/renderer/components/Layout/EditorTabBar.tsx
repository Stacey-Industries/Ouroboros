/**
 * EditorTabBar — renders file tabs and multi-buffer tabs in the centre pane header.
 *
 * Extracted from App.tsx. Reads open files from FileViewerManager context
 * and multi-buffers from MultiBufferManager context.
 * Passed as the `editorTabBar` slot of AppLayout / CentrePane.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useFileViewerManager,
  FileViewerTabs,
} from '../FileViewer';
import {
  useMultiBufferManager,
  type MultiBufferTab,
} from '../FileViewer/MultiBufferManager';

type SpecialViewType = 'settings' | 'usage' | 'context-builder' | 'time-travel' | 'extensions' | 'mcp';

export type { SpecialViewType };

export interface EditorTabBarProps {
  openSpecialViews: SpecialViewType[];
  activeSpecialView: SpecialViewType | null;
  onSpecialViewClick: (view: SpecialViewType) => void;
  onSpecialViewClose: (view: SpecialViewType) => void;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  height: '100%',
  alignItems: 'stretch',
};

const spacerStyle: React.CSSProperties = { flex: 1 };

const splitButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '100%',
  flexShrink: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-faint, var(--text-secondary))',
  cursor: 'pointer',
  padding: 0,
  transition: 'color 150ms ease, background-color 150ms ease',
};

const splitButtonActiveStyle: React.CSSProperties = {
  ...splitButtonStyle,
  color: 'var(--interactive-accent)',
};

const multiBufferTabStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 10px 0 12px',
  height: '100%',
  flexShrink: 0,
  cursor: 'pointer',
  userSelect: 'none',
  borderRight: '1px solid var(--border-semantic)',
  borderBottom: '2px solid transparent',
  backgroundColor: 'var(--surface-panel)',
  color: 'var(--text-secondary)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  fontStyle: 'italic',
  minWidth: '80px',
  maxWidth: '200px',
  transition: 'background-color 150ms ease, color 150ms ease',
};

const multiBufferTabActiveStyle: React.CSSProperties = {
  ...multiBufferTabStyle,
  backgroundColor: 'var(--surface-base)',
  color: 'var(--text-primary)',
  borderBottom: '2px solid var(--interactive-accent)',
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

const renameInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--surface-base)',
  border: '1px solid var(--interactive-accent)',
  borderRadius: '2px',
  color: 'var(--text-primary)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  fontStyle: 'italic',
  padding: '0 4px',
  outline: 'none',
  minWidth: 0,
};

const excerptCountStyle: React.CSSProperties = {
  fontSize: '0.625rem',
  color: 'var(--text-faint, var(--text-secondary))',
  fontStyle: 'normal',
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
  color: 'var(--text-faint, var(--text-secondary))',
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
  color: 'var(--text-faint, var(--text-secondary))',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontFamily: 'var(--font-ui)',
  padding: 0,
  borderRight: '1px solid var(--border-semantic)',
};

const specialViewTabStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 10px 0 12px',
  height: '100%',
  flexShrink: 0,
  cursor: 'pointer',
  userSelect: 'none',
  borderRight: '1px solid var(--border-semantic)',
  borderBottom: '2px solid transparent',
  backgroundColor: 'var(--surface-panel)',
  color: 'var(--text-secondary)',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-ui)',
  minWidth: '80px',
  maxWidth: '200px',
  transition: 'background-color 150ms ease, color 150ms ease',
};

const specialViewTabActiveStyle: React.CSSProperties = {
  ...specialViewTabStyle,
  backgroundColor: 'var(--surface-base)',
  color: 'var(--text-primary)',
  borderBottom: '2px solid var(--interactive-accent)',
};

const specialViewIconStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  opacity: 0.7,
};

function activateMultiBuffer(id: string): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }),
  );
}

const SPECIAL_VIEW_META: Record<SpecialViewType, { label: string; icon: string }> = {
  'settings': { label: 'Settings', icon: '\u2699' },
  'usage': { label: 'Usage', icon: '\u2630' },
  'context-builder': { label: 'Context', icon: '\u2631' },
  'time-travel': { label: 'Time Travel', icon: '\u21B7' },
  'extensions': { label: 'Extensions', icon: '\u2B29' },
  'mcp': { label: 'MCP Servers', icon: '\u2B21' },
};

function SpecialViewTab({
  specialView,
  isActive,
  onClick,
  onClose,
}: {
  specialView: SpecialViewType;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
}): React.ReactElement {
  const meta = SPECIAL_VIEW_META[specialView];
  if (!meta) return <></>;
  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      title={meta.label}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={isActive ? specialViewTabActiveStyle : specialViewTabStyle}
    >
      <span style={specialViewIconStyle}>{meta.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta.label}
      </span>
      {onClose && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label={`Close ${meta.label}`}
          style={specialViewCloseStyle}
        >
          ×
        </button>
      )}
    </div>
  );
}

const specialViewCloseStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '18px', height: '18px', marginLeft: '4px',
  borderRadius: '4px', border: 'none', background: 'transparent',
  color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', lineHeight: 1,
  flexShrink: 0,
};

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
    window.dispatchEvent(new CustomEvent('agent-ide:file-tab-clicked-while-special-view'));
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
  isActive: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function MultiBufferTabItem({
  buffer,
  isActive,
  onActivate,
  onClose,
  onRename,
}: MultiBufferTabItemProps): React.ReactElement {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(buffer.config.name);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setRenameValue(buffer.config.name);
    setIsRenaming(true);
  }, [buffer.config.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== buffer.config.name) {
      onRename(buffer.id, trimmed);
    }
    setIsRenaming(false);
  }, [buffer.id, buffer.config.name, onRename, renameValue]);

  const handleRenameKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsRenaming(false);
    }
  }, [commitRename]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const excerptCount = buffer.config.excerpts.length;
  const tabStyle = isActive ? multiBufferTabActiveStyle : multiBufferTabStyle;

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      title={`${buffer.config.name} — double-click to rename`}
      onClick={() => onActivate(buffer.id)}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      style={tabStyle}
    >
      <span style={multiBufferIconStyle}>{'\u2630'}</span>
      {isRenaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={renameInputStyle}
        />
      ) : (
        <>
          <span style={multiBufferLabelStyle}>{buffer.config.name}</span>
          {excerptCount > 0 ? (
            <span style={excerptCountStyle}>({excerptCount})</span>
          ) : null}
        </>
      )}
      <button onClick={handleCloseClick} aria-label={`Close ${buffer.config.name}`} tabIndex={-1} style={closeButtonStyle}>
        <MultiBufferTabCloseIcon />
      </button>
    </div>
  );
}

interface MultiBufferTabsProps {
  buffers: MultiBufferTab[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

function MultiBufferTabs({
  buffers,
  activeId,
  onActivate,
  onClose,
  onRename,
}: MultiBufferTabsProps): React.ReactElement {
  return (
    <>
      {buffers.map((buffer) => (
        <MultiBufferTabItem
          key={buffer.id}
          buffer={buffer}
          isActive={buffer.id === activeId}
          onActivate={onActivate}
          onClose={onClose}
          onRename={onRename}
        />
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
    <button
      onClick={onClick}
      title="New Snippet Collection &#10;View code excerpts from multiple files side by side"
      style={newMultiBufferButtonStyle}
    >
      {'\u2630'}+
    </button>
  );
}

function SplitColumnsIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SplitEditorButton({
  isSplit,
  onSplit,
  onCloseSplit,
}: {
  isSplit: boolean;
  onSplit: () => void;
  onCloseSplit: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={isSplit ? onCloseSplit : onSplit}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isSplit ? 'Close Split Editor' : 'Split Editor Right'}
      aria-label={isSplit ? 'Close Split Editor' : 'Split Editor Right'}
      style={{
        ...(isSplit ? splitButtonActiveStyle : splitButtonStyle),
        color: isHovered ? 'var(--interactive-accent)' : (isSplit ? 'var(--interactive-accent)' : 'var(--text-faint, var(--text-secondary))'),
        backgroundColor: isHovered ? 'var(--surface-raised)' : 'transparent',
      }}
    >
      <SplitColumnsIcon />
    </button>
  );
}

function useActiveMultiBufferId(): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const onActivate = (event: Event) => {
      setActiveId((event as CustomEvent<{ id: string }>).detail.id);
    };
    const onDeactivate = () => {
      setActiveId(null);
    };

    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);

  return activeId;
}

export function EditorTabBar({
  openSpecialViews,
  activeSpecialView,
  onSpecialViewClick,
  onSpecialViewClose,
}: EditorTabBarProps): React.ReactElement {
  const {
    openFiles, activeIndex, setActive, closeFile,
    pinTab, unpinTab, togglePin, closeOthers, closeToRight, closeAll,
    split, splitRight, closeSplit,
  } = useFileViewerManager();
  const { multiBuffers, openMultiBuffer, closeMultiBuffer, renameMultiBuffer } = useMultiBufferManager();
  const {
    handleNewMultiBuffer,
    handleActivateMultiBuffer,
    handleCloseMultiBuffer,
    handleActivateFile,
  } = useEditorTabActions(setActive, openMultiBuffer, closeMultiBuffer);
  const activeMultiBufferId = useActiveMultiBufferId();

  return (
    <div style={containerStyle}>
      {openFiles.length > 0 && (
        <FileViewerTabs
          files={openFiles}
          activeIndex={activeIndex}
          onActivate={handleActivateFile}
          onClose={closeFile}
          onPin={pinTab}
          onUnpin={unpinTab}
          onTogglePin={togglePin}
          onCloseOthers={closeOthers}
          onCloseToRight={closeToRight}
          onCloseAll={closeAll}
        />
      )}
      {openSpecialViews.map((view) => (
        <SpecialViewTab
          key={view}
          specialView={view}
          isActive={view === activeSpecialView}
          onClick={() => onSpecialViewClick(view)}
          onClose={() => onSpecialViewClose(view)}
        />
      ))}
      <MultiBufferTabs
        buffers={multiBuffers}
        activeId={activeMultiBufferId}
        onActivate={handleActivateMultiBuffer}
        onClose={handleCloseMultiBuffer}
        onRename={renameMultiBuffer}
      />
      <NewMultiBufferButton onClick={handleNewMultiBuffer} />
      {openFiles.length === 0 && multiBuffers.length === 0 && (
        <div style={spacerStyle} aria-hidden="true" />
      )}
      <div style={spacerStyle} />
      {openFiles.length > 0 && (
        <SplitEditorButton
          isSplit={split.isSplit}
          onSplit={() => splitRight()}
          onCloseSplit={closeSplit}
        />
      )}
    </div>
  );
}
