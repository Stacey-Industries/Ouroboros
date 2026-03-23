import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { DirtyCloseDialog } from './DirtyCloseDialog';
import { type DirtyCloseChoice, finalizeDirtyCloseChoice } from './dirtyCloseFlow';
import type { OpenFile } from './FileViewerManager';
import { useFileViewerManager } from './FileViewerManager';

export interface FileViewerTabItemProps {
  file: OpenFile;
  isActive: boolean;
  onActivate: (filePath: string) => void;
  onClose: (filePath: string) => void;
  onPin?: (filePath: string) => void;
  onUnpin?: (filePath: string) => void;
  onTogglePin?: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
  tabRef?: React.Ref<HTMLDivElement>;
}

const TAB_LABEL_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const ICON_BOX_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '16px',
  height: '16px',
  flexShrink: 0,
};
const MENU_STYLE: React.CSSProperties = {
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
const MENU_ITEM_STYLE: React.CSSProperties = {
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
const MENU_SEPARATOR_STYLE: React.CSSProperties = {
  height: '1px',
  margin: '4px 0',
  backgroundColor: 'var(--border-semantic)',
};

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
      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function PinIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
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
function TabIndicator({ file }: { file: OpenFile }): React.ReactElement | null {
  if (!file.isDirtyOnDisk && !file.isDirty) return null;
  return (
    <span
      title={file.isDirtyOnDisk ? 'File changed on disk' : 'Unsaved changes'}
      style={{
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        backgroundColor: file.isDirtyOnDisk ? 'var(--status-warning)' : 'var(--interactive-accent)',
        flexShrink: 0,
      }}
    />
  );
}
function getTabStyle(
  isActive: boolean,
  isHovered: boolean,
  isPinned?: boolean,
): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: isPinned ? '0 8px 0 10px' : '0 10px 0 12px',
    height: '100%',
    flexShrink: 0,
    cursor: 'pointer',
    userSelect: 'none',
    borderRight: '1px solid var(--border-semantic)',
    borderBottom: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
    backgroundColor: isActive
      ? 'var(--tab-active-bg)'
      : isHovered
        ? 'var(--tab-hover-bg)'
        : 'var(--tab-inactive-bg)',
    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '0.8125rem',
    fontFamily: 'var(--font-ui)',
    minWidth: isPinned ? '40px' : '80px',
    maxWidth: isPinned ? '120px' : '200px',
    position: 'relative',
    transition: 'background-color 150ms ease, color 150ms ease',
  };
}
function TabLabel({ file }: { file: OpenFile }): React.ReactElement {
  return (
    <span style={{ ...TAB_LABEL_STYLE, fontStyle: file.isPreview ? 'italic' : 'normal' }}>
      {file.name}
      {file.isDirty ? ' *' : ''}
    </span>
  );
}

function CloseTabButton({
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
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CloseIcon />
    </button>
  );
}

function PinIndicator(): React.ReactElement {
  return (
    <span className="text-text-semantic-faint" style={ICON_BOX_STYLE} title="Pinned">
      <PinIcon />
    </span>
  );
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

function TabContextMenu({
  menu,
  file,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  onDismiss,
}: {
  menu: ContextMenuState;
  file: OpenFile;
  onClose: (filePath: string) => void;
  onCloseOthers?: (filePath: string) => void;
  onCloseToRight?: (filePath: string) => void;
  onCloseAll?: () => void;
  onTogglePin?: (filePath: string) => void;
  onDismiss: () => void;
}): React.ReactElement | null {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu.visible) return;
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
  }, [menu.visible, onDismiss]);
  if (!menu.visible) return null;
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

function useTabActions({
  file,
  onActivate,
  onRequestClose,
  onPin,
}: {
  file: OpenFile;
  onActivate: (filePath: string) => void;
  onRequestClose: () => void;
  onPin?: (filePath: string) => void;
}) {
  const handleActivate = useCallback(() => onActivate(file.path), [file.path, onActivate]);
  const handleDoubleClick = useCallback(() => {
    if (file.isPreview && onPin) onPin(file.path);
  }, [file.isPreview, file.path, onPin]);
  const handleAuxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      onRequestClose();
    },
    [onRequestClose],
  );
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') handleActivate();
    },
    [handleActivate],
  );
  return { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown };
}

export const FileViewerTabItem = memo(function FileViewerTabItem({
  file,
  isActive,
  onActivate,
  onClose,
  onPin,
  onTogglePin,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  tabRef,
}: FileViewerTabItemProps): React.ReactElement {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTabHovered, setIsTabHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const { saveFile, discardDraft } = useFileViewerManager();
  const { toast } = useToastContext();
  const requestClose = useCallback(() => {
    if (file.isPinned) return;
    if (!file.isDirty) {
      onClose(file.path);
      return;
    }
    setIsDialogOpen(true);
  }, [file.isDirty, file.isPinned, file.path, onClose]);
  const handleDialogAction = useCallback(
    async (choice: DirtyCloseChoice) => {
      setIsDialogOpen(false);
      const resolution = await finalizeDirtyCloseChoice({
        choice,
        discardDraft,
        filePath: file.path,
        saveFile,
      });
      if (resolution.outcome !== 'close') {
        toast(
          resolution.choice === 'save' ? resolution.error : `Kept ${file.name} open`,
          resolution.choice === 'save' ? 'error' : 'info',
        );
        return;
      }
      toast(`Closed ${file.name}`, 'info');
      onClose(file.path);
    },
    [discardDraft, file.name, file.path, onClose, saveFile, toast],
  );
  const { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown } = useTabActions({
    file,
    onActivate,
    onRequestClose: requestClose,
    onPin,
  });
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);
  const dismissContextMenu = useCallback(() => setContextMenu({ visible: false, x: 0, y: 0 }), []);
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
        onMouseEnter={() => setIsTabHovered(true)}
        onMouseLeave={() => setIsTabHovered(false)}
        style={getTabStyle(isActive, isTabHovered, file.isPinned)}
      >
        <TabIndicator file={file} />
        <TabLabel file={file} />
        {file.isPinned ? (
          <PinIndicator />
        ) : (
          <CloseTabButton
            fileName={file.name}
            isActive={isActive}
            isDirty={!!file.isDirty}
            isTabHovered={isTabHovered}
            onRequestClose={requestClose}
          />
        )}
      </div>
      <TabContextMenu
        menu={contextMenu}
        file={file}
        onClose={onClose}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        onTogglePin={onTogglePin}
        onDismiss={dismissContextMenu}
      />
      <DirtyCloseDialog fileName={file.name} isOpen={isDialogOpen} onAction={handleDialogAction} />
    </>
  );
});
