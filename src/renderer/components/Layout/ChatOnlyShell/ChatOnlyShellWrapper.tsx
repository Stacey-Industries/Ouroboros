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
 *
 * Wave 46 Phase C: accepts optional `terminal` prop so the workbench
 * variant can mount the shared terminal dock without a second PTY stack.
 */

import React from 'react';

import { useProject } from '../../../contexts/ProjectContext';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import { DiffReviewProvider } from '../../DiffReview';
import { FileViewerManager, MultiBufferManager } from '../../FileViewer';
import { ChatOnlyShell } from './ChatOnlyShell';

export interface ChatOnlyShellWrapperProps {
  terminal?: UseTerminalSessionsReturn;
}

export function ChatOnlyShellWrapper({ terminal }: ChatOnlyShellWrapperProps = {}): React.ReactElement {
  const { projectRoot } = useProject();
  return (
    <FileViewerManager projectRoot={projectRoot}>
      <MultiBufferManager>
        <DiffReviewProvider>
          <ChatOnlyShell terminal={terminal} />
        </DiffReviewProvider>
      </MultiBufferManager>
    </FileViewerManager>
  );
}
