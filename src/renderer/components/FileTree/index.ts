// New hierarchical tree
export { FileTree } from './FileTree';
export type { FileTreeProps } from './FileTree';
export { FileTreeItem } from './FileTreeItem';
export type { TreeNode, FlatRow, FileTreeItemProps, MatchRange } from './FileTreeItem';

// Legacy flat list (kept for backwards compat, no longer used in sidebar)
export { FileList } from './FileList';
export type { FileListProps } from './FileList';
export { FileListItem } from './FileListItem';
export type { FileEntry, FileListItemProps } from './FileListItem';

// Context menu
export { ContextMenu } from './ContextMenu';
export type { ContextMenuState, ContextMenuProps } from './ContextMenu';

// Shared
export { ProjectPicker } from './ProjectPicker';
export type { ProjectPickerProps } from './ProjectPicker';
export { getFileIcon } from './fileIcons';
export type { FileIconInfo } from './fileIcons';
export { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
export type { FileTypeIconProps, FolderTypeIconProps } from './FileTypeIcon';
