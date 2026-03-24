import React, { memo, useCallback, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import { DirtyCloseDialog } from './DirtyCloseDialog';
import { type DirtyCloseChoice, finalizeDirtyCloseChoice } from './dirtyCloseFlow';
import type { OpenFile } from './FileViewerManager';
import { useFileViewerManager } from './FileViewerManager';
import { CloseTabButton, type ContextMenuState, TabContextMenu } from './FileViewerTabItem.parts';

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
        flexShrink: 0,
        backgroundColor: file.isDirtyOnDisk ? 'var(--status-warning)' : 'var(--interactive-accent)',
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

function PinIndicator(): React.ReactElement {
  return (
    <span className="text-text-semantic-faint" style={ICON_BOX_STYLE} title="Pinned">
      <PinIcon />
    </span>
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

function useRequestClose(
  file: OpenFile,
  onClose: (filePath: string) => void,
  setIsDialogOpen: (open: boolean) => void,
): () => void {
  return useCallback(() => {
    if (file.isPinned) return;
    if (!file.isDirty) {
      onClose(file.path);
      return;
    }
    setIsDialogOpen(true);
  }, [file.isDirty, file.isPinned, file.path, onClose, setIsDialogOpen]);
}

interface HandleDialogActionArgs {
  file: OpenFile;
  onClose: (filePath: string) => void;
  setIsDialogOpen: (open: boolean) => void;
  saveFile: ReturnType<typeof useFileViewerManager>['saveFile'];
  discardDraft: ReturnType<typeof useFileViewerManager>['discardDraft'];
  toast: ReturnType<typeof useToastContext>['toast'];
}

function useHandleDialogAction(args: HandleDialogActionArgs) {
  const { file, onClose, setIsDialogOpen, saveFile, discardDraft, toast } = args;
  return useCallback(
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
    [discardDraft, file.name, file.path, onClose, saveFile, setIsDialogOpen, toast],
  );
}

function useTabItemState(
  file: OpenFile,
  onActivate: (p: string) => void,
  onClose: (p: string) => void,
  onPin?: (p: string) => void,
) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTabHovered, setIsTabHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const { saveFile, discardDraft } = useFileViewerManager();
  const { toast } = useToastContext();
  const requestClose = useRequestClose(file, onClose, setIsDialogOpen);
  const handleDialogAction = useHandleDialogAction({
    file,
    onClose,
    setIsDialogOpen,
    saveFile,
    discardDraft,
    toast,
  });
  const tabActions = useTabActions({ file, onActivate, onRequestClose: requestClose, onPin });
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  }, []);
  const dismissContextMenu = useCallback(() => setContextMenu({ visible: false, x: 0, y: 0 }), []);
  return {
    isDialogOpen,
    isTabHovered,
    setIsTabHovered,
    contextMenu,
    dismissContextMenu,
    handleContextMenu,
    requestClose,
    handleDialogAction,
    tabActions,
  };
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
  const {
    isDialogOpen,
    isTabHovered,
    setIsTabHovered,
    contextMenu,
    dismissContextMenu,
    handleContextMenu,
    requestClose,
    handleDialogAction,
    tabActions,
  } = useTabItemState(file, onActivate, onClose, onPin);
  const { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown } = tabActions;
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
