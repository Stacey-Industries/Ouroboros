/**
 * SidebarFileTree — wires FileTree to ProjectContext + FileViewerManager.
 *
 * Single-click opens a preview tab. Double-click opens a permanent tab.
 * Extracted from App.tsx.
 */

import React, { useCallback } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { FileTree } from '../FileTree/FileTree';
import { useFileViewerManager } from '../FileViewer';

export function SidebarFileTree(): React.ReactElement {
  const { projectRoots, removeProjectRoot } = useProject();
  const { openFile, openFilePreview, activeFile } = useFileViewerManager();

  // Single-click in tree -> preview tab
  const handleFileSelect = useCallback(
    (filePath: string): void => {
      void openFilePreview(filePath);
    },
    [openFilePreview],
  );

  // Double-click in tree -> permanent tab
  const handleFileOpen = useCallback(
    (filePath: string): void => {
      void openFile(filePath);
    },
    [openFile],
  );

  return (
    <FileTree
      projectRoots={projectRoots}
      activeFilePath={activeFile?.path ?? null}
      onFileSelect={handleFileSelect}
      onFileOpen={handleFileOpen}
      onRemoveRoot={removeProjectRoot}
    />
  );
}
