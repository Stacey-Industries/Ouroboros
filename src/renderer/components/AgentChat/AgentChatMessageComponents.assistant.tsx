import React from 'react';

import type {
  AgentChatContentBlock,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
} from '../../types/electron';
import { formatTimestamp, formatTimestampFull } from './agentChatFormatters';
import { AssistantMessageActions } from './AgentChatMessageActions';
import { AssistantBlocksContent } from './AgentChatMessageComponents.messages';
import {
  CostDurationRow,
  ErrorInline,
  MessageActionLink,
  ToolsSummaryRow,
  VerificationSummaryRow,
} from './AgentChatMessageComponents.rows';
import {
  CompletedChangeSummaryBar,
  extractChangeTallyFromBlocks,
  hasFileChanges,
} from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';
import { StreamingStatusMessage } from './streamingUtils';

interface AssistantMsgContentProps {
  message: AgentChatMessageRecord;
  isStreaming: boolean;
  onStop?: () => Promise<void>;
  workspaceRoot?: string;
  snapshotHash?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  showChangeSummary: boolean;
}

function AssistantMessageContent(props: AssistantMsgContentProps): React.ReactElement {
  const {
    message,
    isStreaming,
    onStop,
    workspaceRoot,
    snapshotHash,
    onOpenLinkedDetails,
    showChangeSummary,
  } = props;
  return (
    <div className="pb-1">
      {message.blocks?.length ? (
        <AssistantBlocksContent blocks={message.blocks} isStreaming={isStreaming} onStop={onStop} />
      ) : isStreaming ? (
        <StreamingStatusMessage onStop={onStop} />
      ) : (
        <MessageMarkdown content={message.content || ' '} />
      )}
      {!isStreaming && (
        <>
          <VerificationSummaryRow message={message} />
          <ErrorInline message={message} />
          <ToolsSummaryRow message={message} />
          <CostDurationRow message={message} />
          {showChangeSummary && snapshotHash && workspaceRoot && (
            <CompletedChangeSummaryBar
              snapshotHash={snapshotHash}
              projectRoot={workspaceRoot}
              sessionId={message.id}
              tally={extractChangeTallyFromBlocks(message.blocks!)}
            />
          )}
          <MessageActionLink message={message} onOpenLinkedDetails={onOpenLinkedDetails} />
        </>
      )}
    </div>
  );
}

function AssistantMessageHeader({
  message,
  hidden,
  onBranch,
  onRevert,
}: {
  message: AgentChatMessageRecord;
  hidden: boolean;
  onBranch: (m: AgentChatMessageRecord) => void;
  onRevert?: (m: AgentChatMessageRecord) => void;
}): React.ReactElement | null {
  return hidden ? null : (
    <div className="mb-1 flex items-center gap-1">
      <span
        className="text-[10px] text-text-semantic-faint"
        title={formatTimestampFull(message.createdAt)}
      >
        {formatTimestamp(message.createdAt)}
      </span>
      <AssistantMessageActions message={message} onBranch={onBranch} onRevert={onRevert} />
    </div>
  );
}

function shouldShowChangeSummary(
  isStreaming: boolean,
  snapshotHash?: string,
  workspaceRoot?: string,
  blocks?: AgentChatContentBlock[],
): boolean {
  return Boolean(
    !isStreaming && snapshotHash && workspaceRoot && blocks?.length && hasFileChanges(blocks),
  );
}

type StreamingMsg = AgentChatMessageRecord & {
  _streaming?: boolean;
  _streamingState?: { isStreaming: boolean; onStop?: () => Promise<void> };
};

export const AssistantMessage = React.memo(function AssistantMessage(props: {
  message: AgentChatMessageRecord;
  workspaceRoot?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
}): React.ReactElement {
  const msg = props.message as StreamingMsg;
  const isStreaming = msg._streaming === true && (msg._streamingState?.isStreaming ?? false);
  const onStop = msg._streamingState?.onStop;
  const snapshotHash = props.message.orchestration?.preSnapshotHash;
  const showChangeSummary = shouldShowChangeSummary(
    isStreaming,
    snapshotHash,
    props.workspaceRoot,
    props.message.blocks,
  );
  return (
    <div className="group flex justify-start">
      <div className="w-full max-w-[95%]">
        <AssistantMessageHeader
          message={props.message}
          hidden={msg._streaming === true}
          onBranch={props.onBranch}
          onRevert={props.onRevert}
        />
        <AssistantMessageContent
          message={props.message}
          isStreaming={isStreaming}
          onStop={onStop}
          workspaceRoot={props.workspaceRoot}
          snapshotHash={snapshotHash}
          onOpenLinkedDetails={props.onOpenLinkedDetails}
          showChangeSummary={showChangeSummary}
        />
      </div>
    </div>
  );
});
