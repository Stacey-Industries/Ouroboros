/**
 * IdeToolBridge — connects IDE tool responder to FileViewerManager context.
 *
 * Extracted from App.tsx.
 */

import React from 'react';

import { useFileTreeDirtySync } from '../../hooks/useFileTreeDirtySync';
import { useIdeToolResponder } from '../../hooks/useIdeToolResponder';
import { useFileViewerManager } from '../FileViewer';
import { getEditorContent, getEditorSelection } from '../FileViewer/editorRegistry';
import { getTerminalLines } from '../Terminal/terminalRegistry';

export function IdeToolBridge(): React.ReactElement | null {
  const { openFiles, activeFile } = useFileViewerManager();

  useIdeToolResponder({
    getOpenFiles: () => openFiles.map((f) => ({ path: f.path, dirty: f.isDirty })),
    getActiveFile: () => (activeFile ? { path: activeFile.path } : null),
    getUnsavedContent: (filePath) => getEditorContent(filePath) ?? null,
    getSelection: () => getEditorSelection(),
    getTerminalOutput: (sessionId, lines) => getTerminalLines(sessionId, lines),
  });

  // Sync dirty file state from FileViewerManager into file tree store (4C)
  useFileTreeDirtySync();

  return null;
}
