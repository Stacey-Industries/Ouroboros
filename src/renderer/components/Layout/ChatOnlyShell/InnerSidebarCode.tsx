/**
 * InnerSidebarCode — Code tab content for the inner sidebar (Wave 59 Phase D).
 *
 * Reuses the FileTree component scoped to the active project. Click a file
 * fires OPEN_FILE_EVENT — the workbench's artifact pane / file viewer
 * handles the rest, including HTML defaulting to preview (Wave 59 Phase H).
 */

import React, { useCallback } from 'react';

import { OPEN_FILE_EVENT } from '../../../hooks/appEventNames';
import { FileTree } from '../../FileTree/FileTree';

export interface InnerSidebarCodeProps {
  /** Active project root path. Empty/null renders an empty state. */
  activeProject: string | null;
  /** Override file-open dispatch — defaults to the OPEN_FILE_EVENT bus. */
  onFileOpen?: (filePath: string) => void;
}

function CodeEmpty(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center">
      <p className="text-xs text-text-semantic-faint">No project selected.</p>
    </div>
  );
}

export function InnerSidebarCode({
  activeProject,
  onFileOpen,
}: InnerSidebarCodeProps): React.ReactElement {
  const handleFileOpen = useCallback(
    (filePath: string) => {
      if (onFileOpen) {
        onFileOpen(filePath);
        return;
      }
      window.dispatchEvent(new CustomEvent(OPEN_FILE_EVENT, { detail: { filePath } }));
    },
    [onFileOpen],
  );
  if (!activeProject) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="inner-sidebar-code"
      >
        <CodeEmpty />
      </div>
    );
  }
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="inner-sidebar-code"
    >
      <FileTree
        projectRoots={[activeProject]}
        activeFilePath={null}
        onFileSelect={handleFileOpen}
        onFileOpen={handleFileOpen}
      />
    </div>
  );
}
