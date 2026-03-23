import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useToastContext } from '../../contexts/ToastContext';
import type { GitFileStatus } from '../../types/electron';
import type { ContextMenuState } from './ContextMenu';
import { buildMenuItems, type MenuBuilderOptions } from './contextMenuControllerHelpers';
import type { TreeNode } from './FileTreeItem';
import { useFileTreeStore } from './fileTreeStore';
import { type BulkHandlerArgs, useBulkHandlers, useContextMenuHandlers } from './useContextMenuHandlerHooks';

export interface MenuItem {
  action: () => void;
  danger?: boolean;
  label: string;
  separator?: boolean;
  shortcut?: string;
}

type ToastFn = ReturnType<typeof useToastContext>['toast'];

interface UseContextMenuControllerProps {
  state: ContextMenuState;
  projectRoot: string;
  onClose: () => void;
  onRename: (node: TreeNode) => void;
  onNewFile: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onDeleted: (node: TreeNode) => void;
  onMultiDeleted?: (paths: string[]) => void;
  onPushUndo?: (items: import('./useFileTreeUndo').UndoItem[]) => void;
  selectedPaths?: Set<string>;
  isBookmarked?: boolean;
  onBookmarkToggle?: (node: TreeNode) => void;
  gitStatus?: GitFileStatus;
  onStage?: (node: TreeNode) => void;
  onUnstage?: (node: TreeNode) => void;
}

function useDismissMenu(menuRef: React.RefObject<HTMLDivElement | null>, onClose: () => void, visible: boolean): void {
  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const onScroll = () => { onClose(); };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menuRef, onClose, visible]);
}

function useDeleteConfirmation(node: TreeNode | null, visible: boolean): readonly [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const state = useState(false);
  const [, setConfirmingDelete] = state;
  useEffect(() => { setConfirmingDelete(false); }, [node, setConfirmingDelete, visible]);
  return state;
}

function useMenuItems(node: TreeNode | null, options: Omit<MenuBuilderOptions, 'isRoot'>): ReturnType<typeof buildMenuItems> {
  return useMemo(() => {
    if (!node) return [];
    return buildMenuItems({ ...options, isRoot: node.relativePath === '' });
  }, [node, options]);
}

function buildBulkHandlerArgs(opts: {
  options: Omit<UseContextMenuControllerProps, 'state' | 'projectRoot'>;
  projectRoot: string;
  toast: ToastFn;
  confirmingDelete: boolean;
  setConfirmingDelete: React.Dispatch<React.SetStateAction<boolean>>;
}): BulkHandlerArgs {
  return {
    onClose: opts.options.onClose,
    toast: opts.toast,
    onDeleted: opts.options.onDeleted,
    root: opts.projectRoot,
    confirmingDelete: opts.confirmingDelete,
    setConfirmingDelete: opts.setConfirmingDelete,
  };
}

export function useContextMenuController({ state, projectRoot, ...options }: UseContextMenuControllerProps): {
  items: ReturnType<typeof buildMenuItems>;
  menuRef: React.RefObject<HTMLDivElement | null>;
} {
  const { toast } = useToastContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useDeleteConfirmation(state.node, state.visible);
  const selectionCount = useFileTreeStore((s) => s.selectedPaths.size);

  useDismissMenu(menuRef, options.onClose, state.visible);

  const handlers = useContextMenuHandlers({ ...options, confirmingDelete, node: state.node, setConfirmingDelete, state, toast });
  const bulkHandlerArgs = buildBulkHandlerArgs({ options, projectRoot, toast, confirmingDelete, setConfirmingDelete });
  const bulkHandlers = useBulkHandlers(bulkHandlerArgs);

  const combinedCount = options.selectedPaths && state.node ? new Set([...options.selectedPaths, state.node.path]).size : 0;
  const isMultiSelect = combinedCount > 1;

  const items = useMenuItems(state.node, {
    confirmingDelete,
    selectedCount: isMultiSelect ? combinedCount : undefined,
    gitStatus: options.gitStatus,
    handlers,
    isBookmarked: options.isBookmarked,
    onBookmarkToggle: options.onBookmarkToggle,
    onStage: options.onStage,
    onUnstage: options.onUnstage,
    selectionCount,
    bulkHandlers,
  });

  return { items, menuRef };
}
