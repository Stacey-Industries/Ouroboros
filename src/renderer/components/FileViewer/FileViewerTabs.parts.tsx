import React, { useEffect, useRef } from 'react';

import type { OpenFile } from './FileViewerManager';

export const MENU_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10000,
  minWidth: '160px',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  padding: '4px 0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

export const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '4px 12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
};

export const MENU_SEPARATOR_STYLE: React.CSSProperties = {
  height: '1px',
  margin: '4px 0',
  backgroundColor: 'var(--border-semantic)',
};

export const OVERFLOW_DROPDOWN_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  zIndex: 10000,
  minWidth: '180px',
  maxWidth: '300px',
  maxHeight: '300px',
  overflowY: 'auto',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  padding: '4px 0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

export const OVERFLOW_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  padding: '4px 12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function OverflowPinIcon(): React.ReactElement<any> {
  return (
    <svg width="8" height="8" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 2.5L13.5 5.5L10 9L11 13L8 10L5 13L6 9L2.5 5.5L5.5 2.5L8 5L10.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OverflowDirtyDot(): React.ReactElement<any> {
  return (
    <span
      style={{
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        backgroundColor: 'var(--interactive-accent)',
        flexShrink: 0,
      }}
    />
  );
}

type OverflowItemProps = {
  file: OpenFile;
  index: number;
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onDismiss: () => void;
};
function OverflowItem({
  file,
  index,
  activeIndex,
  onActivate,
  onDismiss,
}: OverflowItemProps): React.ReactElement<any> {
  const isActive = index === activeIndex;
  return (
    <button
      key={file.path}
      style={{
        ...OVERFLOW_ITEM_STYLE,
        fontWeight: isActive ? 600 : 'normal',
        color: isActive ? 'var(--interactive-accent)' : 'var(--text-primary)',
        fontStyle: file.isPreview ? 'italic' : 'normal',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
      onClick={() => {
        onActivate(file.path);
        onDismiss();
      }}
    >
      {file.isPinned && <OverflowPinIcon />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.name}
      </span>
      {file.isDirty && <OverflowDirtyDot />}
    </button>
  );
}

interface OverflowDropdownProps {
  files: OpenFile[];
  activeIndex: number;
  onActivate: (filePath: string) => void;
  onDismiss: () => void;
}

function useOverflowDropdownDismiss(
  menuRef: React.RefObject<HTMLDivElement | null>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onDismiss();
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onDismiss, menuRef]);
}

export function OverflowDropdown({
  files,
  activeIndex,
  onActivate,
  onDismiss,
}: OverflowDropdownProps): React.ReactElement<any> {
  const menuRef = useRef<HTMLDivElement>(null);
  useOverflowDropdownDismiss(menuRef, onDismiss);

  return (
    <div ref={menuRef} style={OVERFLOW_DROPDOWN_STYLE}>
      {files.map((file, index) => (
        <OverflowItem
          key={file.path}
          file={file}
          index={index}
          activeIndex={activeIndex}
          onActivate={onActivate}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
