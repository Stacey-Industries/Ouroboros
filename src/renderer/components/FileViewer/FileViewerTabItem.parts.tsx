import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { OpenFile } from './FileViewerManager';
import { MENU_ITEM_STYLE, MENU_SEPARATOR_STYLE, MENU_STYLE } from './FileViewerTabs.parts';

export { MENU_ITEM_STYLE, MENU_SEPARATOR_STYLE, MENU_STYLE };

export function CloseIcon(): React.ReactElement<any> {
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
}): React.ReactElement<any> {
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

const CLOSE_X_BUTTON_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  borderRadius: '3px',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  transition: 'opacity 100ms ease, background-color 100ms ease',
};

type CloseXButtonProps = {
  fileName: string;
  isHovered: boolean;
  isActive: boolean;
  isTabHovered: boolean;
  handleClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};
function CloseXButton({
  fileName,
  isHovered,
  isActive,
  isTabHovered,
  handleClick,
  onMouseEnter,
  onMouseLeave,
}: CloseXButtonProps): React.ReactElement<any> {
  return (
    <button
      onClick={handleClick}
      aria-label={`Close ${fileName}`}
      tabIndex={-1}
      style={{
        ...CLOSE_X_BUTTON_BASE,
        background: isHovered ? 'var(--surface-raised)' : 'transparent',
        color: isHovered ? 'var(--text-primary)' : 'var(--text-faint)',
        opacity: isHovered || isActive || isTabHovered ? 1 : 0,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CloseIcon />
    </button>
  );
}

type CloseTabButtonProps = {
  fileName: string;
  isActive: boolean;
  isDirty: boolean;
  isTabHovered: boolean;
  onRequestClose: () => void;
};
export function CloseTabButton({
  fileName,
  isActive,
  isDirty,
  isTabHovered,
  onRequestClose,
}: CloseTabButtonProps): React.ReactElement<any> {
  const [isHovered, setIsHovered] = useState(false);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRequestClose();
    },
    [onRequestClose],
  );
  const enter = () => setIsHovered(true);
  const leave = () => setIsHovered(false);
  if (isDirty && !isHovered)
    return (
      <DirtyDotButton
        fileName={fileName}
        handleClick={handleClick}
        onMouseEnter={enter}
        onMouseLeave={leave}
      />
    );
  return (
    <CloseXButton
      fileName={fileName}
      isHovered={isHovered}
      isActive={isActive}
      isTabHovered={isTabHovered}
      handleClick={handleClick}
      onMouseEnter={enter}
      onMouseLeave={leave}
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

type MenuItem = { label: string; action: () => void } | 'separator';

function buildContextMenuItems(file: OpenFile, cbs: ContextMenuCallbacks): MenuItem[] {
  const { onClose, onCloseOthers, onCloseToRight, onCloseAll, onTogglePin, onDismiss } = cbs;
  const act = (fn: () => void) => () => {
    fn();
    onDismiss();
  };
  const items: MenuItem[] = [
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
    items.push({ label: 'Close Others', action: act(() => onCloseOthers(file.path)) });
  if (onCloseToRight)
    items.push({ label: 'Close to the Right', action: act(() => onCloseToRight(file.path)) });
  if (onCloseAll) {
    items.push('separator');
    items.push({ label: 'Close All', action: act(onCloseAll) });
  }
  if (onTogglePin) {
    items.push('separator');
    items.push({
      label: file.isPinned ? 'Unpin' : 'Pin',
      action: act(() => onTogglePin(file.path)),
    });
  }
  return items;
}

function useDismissMenuEffect(
  menuRef: React.RefObject<HTMLDivElement | null>,
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

function ContextMenuItem({ item }: { item: MenuItem }): React.ReactElement<any> {
  if (item === 'separator') return <div style={MENU_SEPARATOR_STYLE} />;
  return (
    <button
      className="text-text-semantic-primary"
      style={MENU_ITEM_STYLE}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
      onClick={item.action}
    >
      {item.label}
    </button>
  );
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
}: TabContextMenuProps): React.ReactElement<any> | null {
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
      {items.map((item, idx) => (
        <ContextMenuItem key={item === 'separator' ? `sep-${idx}` : item.label} item={item} />
      ))}
    </div>
  );
}
