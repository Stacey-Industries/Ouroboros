/**
 * IdeToolBridge — connects IDE tool responder to FileViewerManager context.
 *
 * Extracted from App.tsx.
 */

import React from 'react';
import { useFileViewerManager } from '../FileViewer';
import { useIdeToolResponder } from '../../hooks/useIdeToolResponder';
import { getTerminalLines } from '../Terminal/terminalRegistry';
import { getEditorContent, getEditorSelection } from '../FileViewer/editorRegistry';

export function IdeToolBridge(): React.ReactElement | null {
  const { openFiles, activeFile } = useFileViewerManager();

  useIdeToolResponder({
    getOpenFiles: () => openFiles.map((f) => ({ path: f.path, dirty: f.isDirty })),
    getActiveFile: () => (activeFile ? { path: activeFile.path } : null),
    getUnsavedContent: (filePath) => getEditorContent(filePath) ?? null,
    getSelection: () => getEditorSelection(),
    getTerminalOutput: (sessionId, lines) => getTerminalLines(sessionId, lines),
  });

  return null;
}
