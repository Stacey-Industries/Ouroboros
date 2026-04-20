/**
 * ChatOnlyShellWrapper — provider stack for the chat-only shell (Wave 42).
 *
 * Mounts the same providers that InnerAppLayout's LayoutProviders wrap:
 *   FileViewerManager > MultiBufferManager > DiffReviewProvider > children
 *
 * Provider nesting order MUST match InnerAppLayout.tsx (LayoutProviders fn).
 *
 * IdeToolBridge not mounted — IDE-context tool queries return empty in
 * chat-only mode (Wave 42 design).
 */

import React from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import { DiffReviewProvider } from '../../DiffReview';
import { FileViewerManager, MultiBufferManager } from '../../FileViewer';
import { ChatOnlyShell } from './ChatOnlyShell';

export function ChatOnlyShellWrapper(): React.ReactElement {
  const { projectRoot } = useProject();
  return (
    <FileViewerManager projectRoot={projectRoot}>
      <MultiBufferManager>
        <DiffReviewProvider>
          <ChatOnlyShell />
        </DiffReviewProvider>
      </MultiBufferManager>
    </FileViewerManager>
  );
}
