// New hierarchical tree
export { FileTree } from './FileTree';
export type { FileTreeProps } from './FileTree';
export { FileTreeItem } from './FileTreeItem';
export type { TreeNode, FlatRow, FileTreeItemProps, MatchRange } from './FileTreeItem';

// Context menu
export { ContextMenu } from './ContextMenu';
export type { ContextMenuState, ContextMenuProps } from './ContextMenu';

// Store
export { useFileTreeStore } from './fileTreeStore';
export type { FileTreeState, TreeFilter, SortMode, DiagnosticSeverity } from './fileTreeStore';
export {
  useSearchQuery,
  useExpandedPaths,
  useIsExpanded,
  useTreeFilter,
  useSortMode,
  useSelectedPaths,
  useFocusedPath,
  useSelectionCount,
  useDiagnosticForPath,
  useDirectoryDiagnostic,
  useIsDirty,
  useDirtyFileCount,
  useNestingEnabled,
} from './fileTreeStore';

// Search bar
export { FileTreeSearchBar } from './FileTreeSearchBar';
export type { FileTreeSearchBarProps } from './FileTreeSearchBar';

// Staging area
export { StagingArea } from './StagingArea';
export type { StagingAreaProps } from './StagingArea';

// Git status filter
export { GitStatusFilterBar, GitFilteredView, computeStatusCounts, getFilteredFiles } from './GitStatusFilter';
export type { GitStatusCounts, GitStatusFilterBarProps, GitFilteredViewProps } from './GitStatusFilter';

// Git branch indicator
export { GitBranchIndicator } from './GitBranchIndicator';
export type { GitBranchIndicatorProps } from './GitBranchIndicator';

// File nesting rules
export { DEFAULT_NESTING_RULES, expandNestingPattern, applyNesting } from './fileNestingRules';

// Shared
export { ProjectPicker } from './ProjectPicker';
export type { ProjectPickerProps } from './ProjectPicker';
export { getFileIcon } from './fileIcons';
export type { FileIconInfo } from './fileIcons';
export { FileTypeIcon, FolderTypeIcon } from './FileTypeIcon';
export type { FileTypeIconProps, FolderTypeIconProps } from './FileTypeIcon';
