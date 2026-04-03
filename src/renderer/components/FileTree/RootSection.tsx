import React, { useCallback } from 'react';

import type { FileHeatData } from '../../hooks/useFileHeatMap';
import { FileTreeSkeleton } from '../shared';
import { ContextMenu } from './ContextMenu';
import type { TreeNode } from './FileTreeItem';
import { basename, getNodeGitStatus } from './fileTreeUtils';
import { RootSectionHeader } from './RootSectionHeader';
import { useRootSectionModel } from './useRootSectionModel';
import { VirtualTreeList } from './VirtualTreeList';

export interface RootSectionProps {
  root: string;
  isExpanded: boolean;
  onToggle: () => void;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
  /** Called on double-click (opens permanent tab). Falls back to onFileSelect if not provided. */
  onFileOpen?: (filePath: string) => void;
  onRemove?: () => void;
  bookmarks: string[];
  extraIgnorePatterns: string[];
  getHeatLevel?: (filePath: string) => FileHeatData | undefined;
}

type RootSectionModel = ReturnType<typeof useRootSectionModel>;

interface RootContextMenuProps {
  root: string;
  bookmarks: string[];
  model: RootSectionModel;
  handlers: ReturnType<typeof useRootSectionHandlers>;
}

function buildRootNode(root: string): TreeNode {
  return {
    name: basename(root),
    path: root,
    relativePath: '',
    isDirectory: true,
    depth: 0,
    isExpanded: false,
    isLoading: false,
  };
}

function RootSectionError({ error }: { error: string }): React.ReactElement {
  return (
    <div className="text-status-error" style={{ padding: '12px', fontSize: '0.8125rem' }}>
      {error}
    </div>
  );
}

function RootSectionEmpty(): React.ReactElement {
  return (
    <div
      className="text-text-semantic-faint"
      style={{ padding: '16px 12px', fontSize: '0.8125rem', textAlign: 'center' }}
    >
      No files found in this directory.
    </div>
  );
}

function RootSectionBody({
  root,
  activeFilePath,
  bookmarks,
  getHeatLevel,
  model,
}: {
  root: string;
  activeFilePath: string | null;
  bookmarks: string[];
  getHeatLevel?: (filePath: string) => FileHeatData | undefined;
  model: RootSectionModel;
}): React.ReactElement {
  if (model.isLoading) return <FileTreeSkeleton />;
  if (model.error) return <RootSectionError error={model.error} />;
  if (model.displayItems.length === 0) return <RootSectionEmpty />;

  return (
    <VirtualTreeList
      root={root}
      displayItems={model.displayItems}
      activeFilePath={activeFilePath}
      focusIndex={model.focusIndex}
      selectedPaths={model.selectedPaths}
      bookmarks={bookmarks}
      editState={model.editState}
      gitStatus={model.gitStatus}
      getHeatLevel={getHeatLevel}
      handleItemClick={model.handleItemClick}
      handleDoubleClick={model.handleDoubleClick}
      handleContextMenu={model.handleContextMenu}
      handleEditConfirm={model.handleEditConfirm}
      handleEditCancel={model.handleEditCancel}
      handleDrop={model.handleDrop}
      handleRootDrop={model.handleRootDrop}
    />
  );
}

function ExpandedRootSection({
  root,
  activeFilePath,
  bookmarks,
  getHeatLevel,
  model,
}: {
  root: string;
  activeFilePath: string | null;
  bookmarks: string[];
  getHeatLevel?: (filePath: string) => FileHeatData | undefined;
  model: RootSectionModel;
}): React.ReactElement {
  return (
    <div onKeyDown={model.onKeyDown}>
      <RootSectionBody
        root={root}
        activeFilePath={activeFilePath}
        bookmarks={bookmarks}
        getHeatLevel={getHeatLevel}
        model={model}
      />
    </div>
  );
}

function useRootSectionHandlers(
  props: RootSectionProps,
  model: ReturnType<typeof useRootSectionModel>,
) {
  const { handleContextMenu } = model;
  const handleHeaderContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      handleContextMenu(event, buildRootNode(props.root));
    },
    [handleContextMenu, props.root],
  );

  const handleContextMenuNewFile = useCallback(
    (parentDir: string) => {
      if (!props.isExpanded) props.onToggle();
      model.handleNewFile(parentDir);
    },
    [model, props],
  );

  const handleContextMenuNewFolder = useCallback(
    (parentDir: string) => {
      if (!props.isExpanded) props.onToggle();
      model.handleNewFolder(parentDir);
    },
    [model, props],
  );

  return { handleHeaderContextMenu, handleContextMenuNewFile, handleContextMenuNewFolder };
}

function RootContextMenu({
  root,
  bookmarks,
  model,
  handlers,
}: RootContextMenuProps): React.ReactElement {
  const menuNode = model.contextMenu.node;
  return (
    <ContextMenu
      state={model.contextMenu}
      projectRoot={root}
      onClose={model.closeContextMenu}
      onRename={model.handleRename}
      onNewFile={handlers.handleContextMenuNewFile}
      onNewFolder={handlers.handleContextMenuNewFolder}
      onDeleted={model.handleDeleted}
      onMultiDeleted={model.handleMultiDeleted}
      onPushUndo={model.pushUndo}
      selectedPaths={model.selectedPaths}
      isBookmarked={menuNode ? bookmarks.includes(menuNode.path) : false}
      onBookmarkToggle={(node) => void model.handleBookmarkToggle(node)}
      gitStatus={menuNode ? getNodeGitStatus(menuNode, model.gitStatus) : undefined}
      onStage={(node) => void model.handleStage(node)}
      onUnstage={(node) => void model.handleUnstage(node)}
    />
  );
}

export function RootSection(props: RootSectionProps): React.ReactElement {
  const model = useRootSectionModel({
    root: props.root,
    onFileSelect: props.onFileSelect,
    onFileOpen: props.onFileOpen,
    extraIgnorePatterns: props.extraIgnorePatterns,
    enabled: props.isExpanded,
  });
  const handlers = useRootSectionHandlers(props, model);
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <RootSectionHeader
        root={props.root}
        isExpanded={props.isExpanded}
        onToggle={props.onToggle}
        onRemove={props.onRemove}
        onContextMenu={handlers.handleHeaderContextMenu}
      />
      {props.isExpanded ? (
        <ExpandedRootSection
          root={props.root}
          activeFilePath={props.activeFilePath}
          bookmarks={props.bookmarks}
          getHeatLevel={props.getHeatLevel}
          model={model}
        />
      ) : null}
      <RootContextMenu
        root={props.root}
        bookmarks={props.bookmarks}
        model={model}
        handlers={handlers}
      />
    </div>
  );
}
