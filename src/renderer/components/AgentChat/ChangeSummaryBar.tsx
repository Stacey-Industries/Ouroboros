import React, { useCallback, useMemo, useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron';
import { CompletedChangeFileList, CompletedChangeHeader, FileIcon } from './ChangeSummaryBarParts';

const FILE_MODIFYING_TOOLS = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'write_file',
  'edit_file',
  'multi_edit',
  'NotebookEdit',
  'create_file',
]);

export interface ChangeTally {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
}

function tallyFromBlocks(blocks: AgentChatContentBlock[]): ChangeTally {
  const files = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const block of blocks) {
    if (block.kind !== 'tool_use' || !FILE_MODIFYING_TOOLS.has(block.tool)) continue;
    if (block.filePath) files.add(block.filePath);
    if (block.editSummary) {
      linesAdded += block.editSummary.newLines;
      linesRemoved += block.editSummary.oldLines;
    }
  }
  return { filesChanged: [...files], linesAdded, linesRemoved };
}

export const extractChangeTally = tallyFromBlocks;
export const extractChangeTallyFromBlocks = tallyFromBlocks;
export const hasFileChanges = (blocks: AgentChatContentBlock[]): boolean =>
  blocks.some(
    (block) =>
      block.kind === 'tool_use' && FILE_MODIFYING_TOOLS.has(block.tool) && Boolean(block.filePath),
  );

export interface StreamingChangeSummaryBarProps {
  blocks: AgentChatContentBlock[];
  isStreaming: boolean;
}

export function StreamingChangeSummaryBar({
  blocks,
  isStreaming,
}: StreamingChangeSummaryBarProps): React.ReactElement | null {
  const tally = useMemo(() => tallyFromBlocks(blocks), [blocks]);
  if (tally.filesChanged.length === 0) return null;
  return (
    <div className="mt-2 ml-7 flex items-center gap-3 rounded border border-border-semantic bg-surface-raised px-3 py-1.5 text-[11px] text-text-semantic-muted">
      {isStreaming && (
        <span
          className="inline-block h-2 w-2 rounded-full bg-interactive-accent"
          style={{ animation: 'agent-chat-tally-pulse 1.5s ease-in-out infinite' }}
        />
      )}
      <span className="flex items-center gap-1">
        <FileIcon />
        {tally.filesChanged.length} file{tally.filesChanged.length !== 1 ? 's' : ''} changed
      </span>
      {(tally.linesAdded > 0 || tally.linesRemoved > 0) && (
        <span className="flex items-center gap-1.5">
          {tally.linesAdded > 0 && <span className="text-status-success">+{tally.linesAdded}</span>}
          {tally.linesRemoved > 0 && (
            <span className="text-status-error">-{tally.linesRemoved}</span>
          )}
        </span>
      )}
    </div>
  );
}

export interface CompletedChangeSummaryBarProps {
  snapshotHash: string;
  projectRoot: string;
  sessionId: string;
  tally?: ChangeTally;
}

export function CompletedChangeSummaryBar({
  snapshotHash,
  projectRoot,
  sessionId,
  tally,
}: CompletedChangeSummaryBarProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const fileCount = tally?.filesChanged.length ?? 0;
  const openFullReview = useCallback(
    () =>
      window.dispatchEvent(
        new CustomEvent('agent-ide:open-diff-review', {
          detail: { sessionId, snapshotHash, projectRoot, filePaths: tally?.filesChanged },
        }),
      ),
    [projectRoot, sessionId, snapshotHash, tally?.filesChanged],
  );
  return (
    <div className="mt-2 overflow-hidden rounded border border-border-semantic bg-surface-raised">
      <CompletedChangeHeader
        fileCount={fileCount}
        expanded={expanded}
        tally={tally}
        onToggleExpanded={() => {
          setExpanded((value) => !value);
          if (expanded) setSelectedFile(null);
        }}
        onOpenFullReview={openFullReview}
      />
      <CompletedChangeFileList
        expanded={expanded}
        tally={tally}
        projectRoot={projectRoot}
        selectedFile={selectedFile}
        onSelectFile={(file) => setSelectedFile(selectedFile === file ? null : file)}
      />
    </div>
  );
}
