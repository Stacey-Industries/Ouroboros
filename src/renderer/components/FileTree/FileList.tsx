import React from 'react';
import { FileListView } from './FileListView';
import { useFileListController } from './useFileListController';

export interface FileListProps {
  projectRoot: string | null;
  activeFilePath: string | null;
  onFileSelect: (filePath: string) => void;
}

export function FileList({
  projectRoot,
  activeFilePath,
  onFileSelect,
}: FileListProps): React.ReactElement {
  const controller = useFileListController({ projectRoot, onFileSelect });

  return (
    <FileListView
      projectRoot={projectRoot}
      activeFilePath={activeFilePath}
      onFileSelect={onFileSelect}
      controller={controller}
    />
  );
}
