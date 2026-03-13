/**
 * FilePickerConnected — wraps FilePicker with openFile from FileViewerManager context.
 *
 * Extracted from App.tsx.
 */

import React, { useCallback } from 'react';
import { useFileViewerManager } from '../FileViewer';
import { FilePicker } from '../CommandPalette/FilePicker';

export function FilePickerConnected({
  isOpen,
  onClose,
  projectRoot,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectRoot: string | null;
}): React.ReactElement {
  const { openFile } = useFileViewerManager();

  const handleOpenFile = useCallback(
    (filePath: string): void => {
      void openFile(filePath);
    },
    [openFile],
  );

  return (
    <FilePicker
      isOpen={isOpen}
      onClose={onClose}
      projectRoot={projectRoot}
      onOpenFile={handleOpenFile}
    />
  );
}
