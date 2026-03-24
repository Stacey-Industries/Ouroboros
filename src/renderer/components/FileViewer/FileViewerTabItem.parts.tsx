import React, { useCallback, useEffect, useRef, useState } from 'react';

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

export function CloseIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const DIRTY_DOT_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '3px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
};

function DirtyDotButton({
  fileName,
  handleClick,
  onMouseEnter,
  onMouseLeave,
}: {
  fileName: string;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={handleClick}
      aria-label={`Close ${fileName}`}
      tabIndex={-1}
      style={DIRTY_DOT_BUTTON_STYLE}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        style={{
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          backgroundColor: 'var(--interactive-accent)',
        }}
      />
    </button>
  );
}

function CloseXButton({
  fileName,
  isHovered,
  isActive,
  isTabHovered,
  handleClick,
  onMouseEnter,
  onMouseLeave,
}: {
  fileName: string;
  isHovered: boolean;
  isActive: boolean;
  isTabHovered: boolean;
  handleClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={handleClick}
      aria-label={`Close ${fileName}`}
      tabIndex={-1}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '3px',
        border: 'none',
        background: isHovered ? 'var(--surface-raised)' : 'transparent',
        color: isHovered ? 'var(--text-primary)' : 'var(--text-faint)',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: isHovered || isActive || isTabHovered ? 1 : 0,
        transition: 'opacity 100ms ease, background-color 100ms ease',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CloseIcon />
    </button>
  );
}

export function CloseTabButton({
  fileName,
  isActive,
  isDirty,
  isTabHovered,
  onRequestClose,
}: {
  fileName: string;
  isActive: boolean;
  isDirty: boolean;
  isTabHovered: boolean;
  onRequestClose: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRequestClose();
    },
    [onRequestClose],
  );
  if (isDirty && !isHovered) {
    return (
      <DirtyDotButton
        fileName={fileName}
        handleClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
    );
  }
  return (
    <CloseXButton
      fileName={fileName}
      isHovered={isHovered}
      isActive={isActive}
      isTabHovered={isTabHovered}
      handleClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    />
  );
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface ContextMenuCallbacks {
  onClose: (filePath: string) => void;
  onCloseOthers: ((filePath: string) => void) | undefined;
  onCloseToRight: ((filePath: string) => void) | undefined;
  onCloseAll: (() => void) | undefined;
  onTogglePin: ((filePath: string) => void) | undefined;
  onDismiss: () => void;
}

function buildContextMenuItems(
  file: OpenFile,
  cbs: ContextMenuCallbacks,
): Array<{ label: string; action: () => void } | 'separator'> {
  const { onClose, onCloseOthers, onCloseToRight, onCloseAll, onTogglePin, onDismiss } = cbs;
  const items: Array<{ label: string; action: () => void } | 'separator'> = [
    {
      label: 'Close',
      action: () => {
        if (!file.isDirty || window.confirm(`"${file.name}" has unsaved changes. Close anyway?`))
          onClose(file.path);
        onDismiss();
      },
    },
  ];
  if (onCloseOthers)
    items.push({
      label: 'Close Others',
      action: () => {
        onCloseOthers(file.path);
        onDismiss();
      },
    });
  if (onCloseToRight)
    items.push({
      label: 'Close to the Right',
      action: () => {
        onCloseToRight(file.path);
        onDismiss();
      },
    });
  if (onCloseAll) {
    items.push('separator');
    items.push({
      label: 'Close All',
      action: () => {
        onCloseAll();
        onDismiss();
      },
    });
  }
  if (onTogglePin) {
    items.push('separator');
    items.push({
      label: file.isPinned ? 'Unpin' : 'Pin',
      action: () => {
        onTogglePin(file.path);
        onDismiss();
      },
    });
  }
  return items;
}

function useDismissMenuEffect(
  menuRef: React.RefObject<HTMLDivElement>,
  visible: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onDismiss();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onDismiss, menuRef]);
}

interface TabContextMenuProps {
  menu: ContextMenuState;
  file: OpenFile;
  onClose: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
  onTogglePin?: (filePath: string) => void;
  onDismiss: () => void;
}

export function TabContextMenu({
  menu,
  file,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  onDismiss,
}: TabContextMenuProps): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissMenuEffect(menuRef, menu.visible, onDismiss);
  if (!menu.visible) return null;
  const items = buildContextMenuItems(file, {
    onClose,
    onCloseOthers,
    onCloseToRight,
    onCloseAll,
    onTogglePin,
    onDismiss,
  });
  return (
    <div ref={menuRef} style={{ ...MENU_STYLE, left: menu.x, top: menu.y }}>
      {items.map((item, idx) =>
        item === 'separator' ? (
          <div key={`sep-${idx}`} style={MENU_SEPARATOR_STYLE} />
        ) : (
          <button
            key={item.label}
            className="text-text-semantic-primary"
            style={MENU_ITEM_STYLE}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                'var(--surface-raised)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
            onClick={item.action}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
