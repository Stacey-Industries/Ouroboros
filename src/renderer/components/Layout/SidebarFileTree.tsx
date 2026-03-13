/**
 * SidebarFileTree — wires FileTree to ProjectContext + FileViewerManager.
 *
 * Extracted from App.tsx.
 */

import React, { useCallback } from 'react';
import { useProject } from '../../contexts/ProjectContext';
import { useFileViewerManager } from '../FileViewer';
import { FileTree } from '../FileTree/FileTree';

export function SidebarFileTree(): React.ReactElement {
  const { projectRoots, removeProjectRoot } = useProject();
  const { openFile, activeFile } = useFileViewerManager();

  const handleFileSelect = useCallback(
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
      onRemoveRoot={removeProjectRoot}
    />
  );
}
