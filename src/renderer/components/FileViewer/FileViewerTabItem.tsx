import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import type { OpenFile } from './FileViewerManager';

export interface FileViewerTabItemProps {
  file: OpenFile;
  isActive: boolean;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  /** Pin a preview tab (double-click) */
  onPin?: (filePath: string) => void;
  /** Close all tabs except this one */
  onCloseOthers?: (filePath: string) => void;
  /** Close tabs to the right of this one */
  onCloseToRight?: (filePath: string) => void;
  /** Close all tabs */
  onCloseAll?: () => void;
  tabRef?: React.Ref<HTMLDivElement>;
}

const TAB_LABEL_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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
        backgroundColor: file.isDirtyOnDisk
          ? 'var(--warning)'
          : file.isDirty
            ? '#e5a00d'
            : 'var(--accent)',
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
    <span
      style={{
        ...TAB_LABEL_STYLE,
        fontStyle: file.isPreview ? 'italic' : 'normal',
      }}
    >
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

// ── Tab Context Menu ────────────────────────────────────────────────────

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

const CONTEXT_MENU_STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10000,
  minWidth: '160px',
  backgroundColor: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '4px 0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '4px 12px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
};

const MENU_SEPARATOR_STYLE: React.CSSProperties = {
  height: '1px',
  margin: '4px 0',
  backgroundColor: 'var(--border)',
};

function TabContextMenu({
  menu,
  file,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onDismiss,
}: {
  menu: ContextMenuState;
  file: OpenFile;
  onClose: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
  onDismiss: () => void;
}): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu.visible) return;
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
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
  }, [menu.visible, onDismiss]);

  if (!menu.visible) return null;

  const items: Array<{ label: string; action: () => void } | 'separator'> = [
    {
      label: 'Close',
      action: () => {
        if (confirmClose(file)) onClose(file.path);
        onDismiss();
      },
    },
  ];

  if (onCloseOthers) {
    items.push({
      label: 'Close Others',
      action: () => { onCloseOthers(file.path); onDismiss(); },
    });
  }
  if (onCloseToRight) {
    items.push({
      label: 'Close to the Right',
      action: () => { onCloseToRight(file.path); onDismiss(); },
    });
  }
  if (onCloseAll) {
    items.push('separator');
    items.push({
      label: 'Close All',
      action: () => { onCloseAll(); onDismiss(); },
    });
  }

  return (
    <div ref={menuRef} style={{ ...CONTEXT_MENU_STYLE, left: menu.x, top: menu.y }}>
      {items.map((item, idx) => {
        if (item === 'separator') {
          return <div key={`sep-${idx}`} style={MENU_SEPARATOR_STYLE} />;
        }
        return (
          <button
            key={item.label}
            style={MENU_ITEM_STYLE}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
            }}
            onClick={item.action}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tab Actions Hook ────────────────────────────────────────────────────

function useTabActions({
  file,
  onActivate,
  onClose,
  onPin,
}: Pick<FileViewerTabItemProps, 'file' | 'onActivate' | 'onClose' | 'onPin'>): {
  handleActivate: () => void;
  handleDoubleClick: () => void;
  handleAuxClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
} {
  const handleActivate = useCallback(() => onActivate(file.path), [file.path, onActivate]);
  const handleDoubleClick = useCallback(() => {
    // Double-click pins a preview tab
    if (file.isPreview && onPin) {
      onPin(file.path);
    }
  }, [file.path, file.isPreview, onPin]);
  const handleAuxClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    if (confirmClose(file)) onClose(file.path);
  }, [file, onClose]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') handleActivate();
  }, [handleActivate]);

  return { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown };
}

export const FileViewerTabItem = memo(function FileViewerTabItem({
  file,
  isActive,
  onActivate,
  onClose,
  onPin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  tabRef,
}: FileViewerTabItemProps): React.ReactElement {
  const { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown } = useTabActions({
    file,
    onActivate,
    onClose,
    onPin,
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);

  const dismissContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);

  return (
    <>
      <div
        ref={tabRef}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        title={file.path}
        onClick={handleActivate}
        onDoubleClick={handleDoubleClick}
        onAuxClick={handleAuxClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        style={getTabStyle(isActive)}
      >
        <TabIndicator file={file} />
        <TabLabel file={file} />
        <CloseTabButton file={file} isActive={isActive} onClose={onClose} />
      </div>
      <TabContextMenu
        menu={contextMenu}
        file={file}
        onClose={onClose}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        onDismiss={dismissContextMenu}
      />
    </>
  );
});
