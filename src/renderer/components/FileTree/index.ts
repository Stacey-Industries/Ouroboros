// New hierarchical tree
export type { FileTreeProps } from './FileTree';
export { FileTree } from './FileTree';
export type { FileTreeItemProps, FlatRow, MatchRange,TreeNode } from './FileTreeItem';
export { FileTreeItem } from './FileTreeItem';

// Context menu
export type { ContextMenuProps,ContextMenuState } from './ContextMenu';
export { ContextMenu } from './ContextMenu';

// Store
export type { DiagnosticSeverity,FileTreeState, SortMode, TreeFilter } from './fileTreeStore';
export { useFileTreeStore } from './fileTreeStore';
export {
  useDiagnosticForPath,
  useDirectoryDiagnostic,
  useDirtyFileCount,
  useExpandedPaths,
  useFocusedPath,
  useIsDirty,
  useIsExpanded,
  useNestingEnabled,
  useSearchQuery,
  useSelectedPaths,
  useSelectionCount,
  useSortMode,
  useTreeFilter,
} from './fileTreeStore';

// Search bar
export type { FileTreeSearchBarProps } from './FileTreeSearchBar';
export { FileTreeSearchBar } from './FileTreeSearchBar';

// Staging area
export type { StagingAreaProps } from './StagingArea';
export { StagingArea } from './StagingArea';

// Git status filter
export type { GitFilteredViewProps,GitStatusCounts, GitStatusFilterBarProps } from './GitStatusFilter';
export { computeStatusCounts, getFilteredFiles,GitFilteredView, GitStatusFilterBar } from './GitStatusFilter';

// Git branch indicator
export type { GitBranchIndicatorProps } from './GitBranchIndicator';
export { GitBranchIndicator } from './GitBranchIndicator';

// File nesting rules
export { applyNesting,DEFAULT_NESTING_RULES, expandNestingPattern } from './fileNestingRules';

// Shared
export type { FileIconInfo } from './fileIcons';
export { getFileIcon } from './fileIcons';
export type { FileTypeIconProps, FolderTypeIconProps } from './FileTypeIcon';
export { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
export type { ProjectPickerProps } from './ProjectPicker';
export { ProjectPicker } from './ProjectPicker';
