import React, { memo } from 'react';

import { DirtyCloseDialog } from './DirtyCloseDialog';
import type { OpenFile } from './FileViewerManager';
import { useTabActions, useTabItemState } from './FileViewerTabItem.helpers';
import { CloseTabButton, TabContextMenu } from './FileViewerTabItem.parts';

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

type TabBodyProps = {
  file: OpenFile;
  isActive: boolean;
  tabRef?: React.Ref<HTMLDivElement>;
  isTabHovered: boolean;
  setIsTabHovered: (v: boolean) => void;
  tabActions: ReturnType<typeof useTabActions>;
  requestClose: () => void;
  handleContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
};

function TabBody(p: TabBodyProps): React.ReactElement {
  const { handleActivate, handleDoubleClick, handleAuxClick, handleKeyDown } = p.tabActions;
  return (
    <div
      ref={p.tabRef}
      role="tab"
      aria-selected={p.isActive}
      tabIndex={p.isActive ? 0 : -1}
      title={p.file.path}
      onClick={handleActivate}
      onDoubleClick={handleDoubleClick}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      onContextMenu={p.handleContextMenu}
      onMouseEnter={() => p.setIsTabHovered(true)}
      onMouseLeave={() => p.setIsTabHovered(false)}
      style={getTabStyle(p.isActive, p.isTabHovered, p.file.isPinned)}
    >
      <TabIndicator file={p.file} />
      <TabLabel file={p.file} />
      {p.file.isPinned ? (
        <PinIndicator />
      ) : (
        <CloseTabButton
          fileName={p.file.name}
          isActive={p.isActive}
          isDirty={!!p.file.isDirty}
          isTabHovered={p.isTabHovered}
          onRequestClose={p.requestClose}
        />
      )}
    </div>
  );
}

type TabOverlaysProps = Pick<
  FileViewerTabItemProps,
  'file' | 'onClose' | 'onCloseOthers' | 'onCloseToRight' | 'onCloseAll' | 'onTogglePin'
> & {
  contextMenu: ReturnType<typeof useTabItemState>['contextMenu'];
  dismissContextMenu: () => void;
  isDialogOpen: boolean;
  handleDialogAction: ReturnType<typeof useTabItemState>['handleDialogAction'];
};
function TabOverlays({
  file,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onTogglePin,
  contextMenu,
  dismissContextMenu,
  isDialogOpen,
  handleDialogAction,
}: TabOverlaysProps): React.ReactElement {
  return (
    <>
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
  const s = useTabItemState(file, onActivate, onClose, onPin);
  return (
    <>
      <TabBody
        file={file}
        isActive={isActive}
        tabRef={tabRef}
        isTabHovered={s.isTabHovered}
        setIsTabHovered={s.setIsTabHovered}
        tabActions={s.tabActions}
        requestClose={s.requestClose}
        handleContextMenu={s.handleContextMenu}
      />
      <TabOverlays
        file={file}
        onClose={onClose}
        onCloseOthers={onCloseOthers}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        onTogglePin={onTogglePin}
        contextMenu={s.contextMenu}
        dismissContextMenu={s.dismissContextMenu}
        isDialogOpen={s.isDialogOpen}
        handleDialogAction={s.handleDialogAction}
      />
    </>
  );
});
