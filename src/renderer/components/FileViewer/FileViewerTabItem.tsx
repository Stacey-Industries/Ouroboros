import React, { memo, useCallback, useState } from 'react';
import type { OpenFile } from './FileViewerManager';

interface FileViewerTabItemProps {
  file: OpenFile;
  isActive: boolean;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  tabRef?: React.Ref<HTMLDivElement>;
}

const TAB_LABEL_STYLE = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

function confirmClose(file: OpenFile): boolean {
  if (!file.isDirty) return true;
  return window.confirm(`"${file.name}" has unsaved changes. Close anyway?`);
}

function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 2L8 8M8 2L2 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TabIndicator({ file }: { file: OpenFile }): React.ReactElement | null {
  if (!file.isDirtyOnDisk && !file.isDirty) return null;

  return (
    <span
      title={file.isDirtyOnDisk ? 'File changed on disk' : 'Unsaved changes'}
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: file.isDirtyOnDisk ? 'var(--warning)' : 'var(--accent)',
        flexShrink: 0,
      }}
    />
  );
}

function getTabStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 10px 0 12px',
    height: '100%',
    flexShrink: 0,
    cursor: 'pointer',
    userSelect: 'none',
    borderRight: '1px solid var(--border)',
    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
    backgroundColor: isActive ? 'var(--bg)' : 'var(--bg-secondary)',
    color: isActive ? 'var(--text)' : 'var(--text-muted)',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-ui)',
    minWidth: '80px',
    maxWidth: '200px',
    position: 'relative',
    transition: 'background-color 100ms ease, color 100ms ease',
  };
}

function TabLabel({ file }: { file: OpenFile }): React.ReactElement {
  return (
    <span style={TAB_LABEL_STYLE}>
      {file.name}
      {file.isDirty ? ' *' : ''}
    </span>
  );
}

function CloseTabButton({
  file,
  isActive,
  onClose,
}: Pick<FileViewerTabItemProps, 'file' | 'isActive' | 'onClose'>): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (confirmClose(file)) onClose(file.path);
  }, [file, onClose]);

  return (
    <button
      onClick={handleClick}
      aria-label={`Close ${file.name}`}
      tabIndex={-1}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '3px',
        border: 'none',
        background: isHovered ? 'var(--bg-tertiary)' : 'transparent',
        color: isHovered ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: isHovered || isActive ? 1 : 0,
        transition: 'opacity 100ms ease, background-color 100ms ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CloseIcon />
    </button>
  );
}

function useTabActions({
  file,
  onActivate,
  onClose,
}: Pick<FileViewerTabItemProps, 'file' | 'onActivate' | 'onClose'>): {
  handleActivate: () => void;
  handleAuxClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
} {
  const handleActivate = useCallback(() => onActivate(file.path), [file.path, onActivate]);
  const handleAuxClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    if (confirmClose(file)) onClose(file.path);
  }, [file, onClose]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') handleActivate();
  }, [handleActivate]);

  return { handleActivate, handleAuxClick, handleKeyDown };
}

export const FileViewerTabItem = memo(function FileViewerTabItem({
  file,
  isActive,
  onActivate,
  onClose,
  tabRef,
}: FileViewerTabItemProps): React.ReactElement {
  const { handleActivate, handleAuxClick, handleKeyDown } = useTabActions({
    file,
    onActivate,
    onClose,
  });

  return (
    <div
      ref={tabRef}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      title={file.path}
      onClick={handleActivate}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      style={getTabStyle(isActive)}
    >
      <TabIndicator file={file} />
      <TabLabel file={file} />
      <CloseTabButton file={file} isActive={isActive} onClose={onClose} />
    </div>
  );
});
