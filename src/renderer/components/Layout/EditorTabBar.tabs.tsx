/**
 * EditorTabBar sub-components — MultiBufferTabItem, MultiBufferTabs, FileTabsRow.
 * Extracted to keep EditorTabBar.tsx under 300 lines.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { FileViewerTabs, useFileViewerManager } from '../FileViewer';
import { type MultiBufferTab } from '../FileViewer/MultiBufferManager';
import {
  closeButtonStyle, excerptCountStyle, multiBufferIconStyle, multiBufferLabelStyle,
  multiBufferTabActiveStyle, multiBufferTabStyle, newMultiBufferButtonStyle, renameInputStyle,
} from './EditorTabBar.styles';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function activateMultiBuffer(id: string): void {
  window.dispatchEvent(new CustomEvent('agent-ide:activate-multi-buffer', { detail: { id } }));
}

export function deactivateMultiBuffer(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
}

// ── useEditorTabActions ───────────────────────────────────────────────────────

export function useEditorTabActions(
  setActive: (filePath: string) => void,
  openMultiBuffer: () => string,
  closeMultiBuffer: (id: string) => void,
) {
  const handleNewMultiBuffer = useCallback(() => { activateMultiBuffer(openMultiBuffer()); }, [openMultiBuffer]);
  const handleActivateMultiBuffer = useCallback((id: string) => { activateMultiBuffer(id); }, []);
  const handleCloseMultiBuffer = useCallback((id: string) => {
    closeMultiBuffer(id); deactivateMultiBuffer();
  }, [closeMultiBuffer]);
  const handleActivateFile = useCallback((filePath: string) => {
    deactivateMultiBuffer();
    setActive(filePath);
    window.dispatchEvent(new CustomEvent('agent-ide:file-tab-clicked-while-special-view'));
  }, [setActive]);
  return { handleNewMultiBuffer, handleActivateMultiBuffer, handleCloseMultiBuffer, handleActivateFile };
}

// ── useActiveMultiBufferId ────────────────────────────────────────────────────

export function useActiveMultiBufferId(): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const onActivate = (event: Event) => { setActiveId((event as CustomEvent<{ id: string }>).detail.id); };
    const onDeactivate = () => { setActiveId(null); };
    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);
  return activeId;
}

// ── MultiBufferTabItem ────────────────────────────────────────────────────────

function useMultiBufferTabRename(buffer: MultiBufferTab, onRename: (id: string, name: string) => void) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(buffer.config.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== buffer.config.name) onRename(buffer.id, trimmed);
    setIsRenaming(false);
  }, [buffer.id, buffer.config.name, onRename, renameValue]);
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation(); setRenameValue(buffer.config.name); setIsRenaming(true);
  }, [buffer.config.name]);
  const handleRenameKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
    else if (event.key === 'Escape') { event.preventDefault(); setIsRenaming(false); }
  }, [commitRename]);
  useEffect(() => {
    if (isRenaming && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [isRenaming]);
  return { isRenaming, renameValue, setRenameValue, inputRef, commitRename, handleDoubleClick, handleRenameKeyDown };
}

function MultiBufferTabContent({ buffer, isRenaming, renameValue, setRenameValue, inputRef, commitRename, handleRenameKeyDown }: {
  buffer: MultiBufferTab; isRenaming: boolean; renameValue: string;
  setRenameValue: (v: string) => void; inputRef: React.RefObject<HTMLInputElement | null>;
  commitRename: () => void; handleRenameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  if (isRenaming) {
    return (
      <input ref={inputRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
        onBlur={commitRename} onKeyDown={handleRenameKeyDown}
        onClick={(e) => e.stopPropagation()} style={renameInputStyle} />
    );
  }
  const excerptCount = buffer.config.excerpts.length;
  return (
    <>
      <span style={multiBufferLabelStyle}>{buffer.config.name}</span>
      {excerptCount > 0 ? <span style={excerptCountStyle}>({excerptCount})</span> : null}
    </>
  );
}

function MultiBufferTabCloseIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MultiBufferTabItem({ buffer, isActive, onActivate, onClose, onRename }: {
  buffer: MultiBufferTab; isActive: boolean; onActivate: (id: string) => void;
  onClose: (id: string) => void; onRename: (id: string, name: string) => void;
}): React.ReactElement {
  const rename = useMultiBufferTabRename(buffer, onRename);
  const handleAuxClick = useCallback((event: React.MouseEvent) => {
    if (event.button !== 1) return; event.preventDefault(); onClose(buffer.id);
  }, [buffer.id, onClose]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') onActivate(buffer.id);
  }, [buffer.id, onActivate]);
  const handleCloseClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation(); onClose(buffer.id);
  }, [buffer.id, onClose]);
  return (
    <div role="tab" tabIndex={0} aria-selected={isActive}
      title={`${buffer.config.name} — double-click to rename`}
      onClick={() => onActivate(buffer.id)} onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown} onDoubleClick={rename.handleDoubleClick}
      style={isActive ? multiBufferTabActiveStyle : multiBufferTabStyle}
    >
      <span style={multiBufferIconStyle}>{'\u2630'}</span>
      <MultiBufferTabContent buffer={buffer} isRenaming={rename.isRenaming}
        renameValue={rename.renameValue} setRenameValue={rename.setRenameValue}
        inputRef={rename.inputRef} commitRename={rename.commitRename}
        handleRenameKeyDown={rename.handleRenameKeyDown} />
      <button onClick={handleCloseClick} aria-label={`Close ${buffer.config.name}`} tabIndex={-1} style={closeButtonStyle}>
        <MultiBufferTabCloseIcon />
      </button>
    </div>
  );
}

// ── MultiBufferTabs ───────────────────────────────────────────────────────────

export function MultiBufferTabs({ buffers, activeId, onActivate, onClose, onRename }: {
  buffers: MultiBufferTab[]; activeId: string | null;
  onActivate: (id: string) => void; onClose: (id: string) => void; onRename: (id: string, name: string) => void;
}): React.ReactElement {
  return (
    <>
      {buffers.map((buffer) => (
        <MultiBufferTabItem key={buffer.id} buffer={buffer} isActive={buffer.id === activeId}
          onActivate={onActivate} onClose={onClose} onRename={onRename} />
      ))}
    </>
  );
}

// ── NewMultiBufferButton ──────────────────────────────────────────────────────

export function NewMultiBufferButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button onClick={onClick}
      title="New Snippet Collection &#10;View code excerpts from multiple files side by side"
      style={newMultiBufferButtonStyle}>
      {'\u2630'}+
    </button>
  );
}

// ── FileTabsRow ───────────────────────────────────────────────────────────────

export function FileTabsRow({ openFiles, activeIndex, onActivate, onClose, onPin, onUnpin, onTogglePin, onCloseOthers, onCloseToRight, onCloseAll }: {
  openFiles: ReturnType<typeof useFileViewerManager>['openFiles'];
  activeIndex: number; onActivate: (filePath: string) => void;
  onClose: ReturnType<typeof useFileViewerManager>['closeFile'];
  onPin: ReturnType<typeof useFileViewerManager>['pinTab'];
  onUnpin: ReturnType<typeof useFileViewerManager>['unpinTab'];
  onTogglePin: ReturnType<typeof useFileViewerManager>['togglePin'];
  onCloseOthers: ReturnType<typeof useFileViewerManager>['closeOthers'];
  onCloseToRight: ReturnType<typeof useFileViewerManager>['closeToRight'];
  onCloseAll: ReturnType<typeof useFileViewerManager>['closeAll'];
}): React.ReactElement | null {
  if (openFiles.length === 0) return null;
  return (
    <FileViewerTabs files={openFiles} activeIndex={activeIndex} onActivate={onActivate}
      onClose={onClose} onPin={onPin} onUnpin={onUnpin} onTogglePin={onTogglePin}
      onCloseOthers={onCloseOthers} onCloseToRight={onCloseToRight} onCloseAll={onCloseAll} />
  );
}

