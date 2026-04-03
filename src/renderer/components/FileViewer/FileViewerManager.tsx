import React, { createContext, useContext } from 'react';

import type { FileViewerManagerProps, FileViewerState } from './FileViewerManager.internal';
import { useFileViewerManagerState } from './FileViewerManager.internal';

export type { FileViewerManagerProps, OpenFile, SplitState } from './FileViewerManager.internal';

const FileViewerContext = createContext<FileViewerState | null>(null);

export function FileViewerManager({ projectRoot, children }: FileViewerManagerProps): React.ReactElement {
  const value = useFileViewerManagerState(projectRoot);
  return <FileViewerContext.Provider value={value}>{children}</FileViewerContext.Provider>;
}

export function useFileViewerManager(): FileViewerState {
  const context = useContext(FileViewerContext);
  if (!context) {
    throw new Error('useFileViewerManager must be used inside <FileViewerManager>');
  }
  return context;
}
