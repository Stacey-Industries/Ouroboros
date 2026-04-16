import React, { useCallback, useState } from 'react';

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
import { useDensity } from './DensityContext';
import { MessageActions } from './MessageActions';
import { MessageMarkdown } from './MessageMarkdown';
import { StreamingStatusMessage } from './streamingUtils';

// ── Collapse threshold ────────────────────────────────────────────────────────

const COLLAPSE_THRESHOLD = 4000;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

interface ContentProps {
  message: AgentChatMessageRecord;
  isStreaming: boolean;
  showRaw: boolean;
  onStop?: () => Promise<void>;
  workspaceRoot?: string;
  snapshotHash?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  showChangeSummary: boolean;
}

function AssistantBody(
  { message, isStreaming, showRaw, onStop }: Pick<ContentProps, 'message' | 'isStreaming' | 'showRaw' | 'onStop'>,
): React.ReactElement {
  if (showRaw) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-inset px-3 py-2 font-mono text-xs text-text-semantic-primary">
        {message.content || ' '}
      </pre>
    );
  }
  if (message.blocks?.length) {
    return <AssistantBlocksContent blocks={message.blocks} isStreaming={isStreaming} onStop={onStop} />;
  }
  if (isStreaming) return <StreamingStatusMessage onStop={onStop} />;
  return <MessageMarkdown content={message.content || ' '} />;
}

function AssistantMessageFooter(props: ContentProps): React.ReactElement {
  const { message, workspaceRoot, snapshotHash } = props;
  return (
    <>
      <VerificationSummaryRow message={message} />
      <ErrorInline message={message} />
      <ToolsSummaryRow message={message} />
      <CostDurationRow message={message} />
      {props.showChangeSummary && snapshotHash && workspaceRoot && (
        <CompletedChangeSummaryBar
          snapshotHash={snapshotHash}
          projectRoot={workspaceRoot}
          sessionId={message.id}
          tally={extractChangeTallyFromBlocks(message.blocks!)}
        />
      )}
      <MessageActionLink message={message} onOpenLinkedDetails={props.onOpenLinkedDetails} />
    </>
  );
}

function AssistantMessageContent(props: ContentProps): React.ReactElement {
  return (
    <div className="pb-1">
      <AssistantBody
        message={props.message}
        isStreaming={props.isStreaming}
        showRaw={props.showRaw}
        onStop={props.onStop}
      />
      {!props.isStreaming && <AssistantMessageFooter {...props} />}
    </div>
  );
}

interface CollapseButtonProps {
  collapsed: boolean;
  onToggle: () => void;
}

function CollapseButton({ collapsed, onToggle }: CollapseButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 text-[11px] text-interactive-accent hover:underline"
    >
      {collapsed ? 'Show content' : 'Collapse'}
    </button>
  );
}

interface HeaderProps {
  message: AgentChatMessageRecord;
  hidden: boolean;
  showRaw: boolean;
  onToggleRaw: () => void;
  onBranch: (m: AgentChatMessageRecord) => void;
  onRevert?: (m: AgentChatMessageRecord) => void;
}

function AssistantMessageHeader(props: HeaderProps): React.ReactElement | null {
  if (props.hidden) return null;
  return (
    <div className="mb-1 flex items-center gap-1">
      <span
        className="text-[10px] text-text-semantic-faint"
        title={formatTimestampFull(props.message.createdAt)}
      >
        {formatTimestamp(props.message.createdAt)}
      </span>
      <AssistantMessageActions
        message={props.message}
        onBranch={props.onBranch}
        onRevert={props.onRevert}
      />
      <MessageActions
        content={props.message.content ?? ''}
        showRaw={props.showRaw}
        onToggleRaw={props.onToggleRaw}
      />
    </div>
  );
}

// ── Collapse state ────────────────────────────────────────────────────────────

function useCollapseState(message: AgentChatMessageRecord): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(message.collapsedByDefault ?? false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      void window.electronAPI.agentChat.setMessageCollapsed(message.id, next);
      return next;
    });
  }, [message.id]);

  return [collapsed, toggle];
}

// ── AssistantMessage ──────────────────────────────────────────────────────────

interface AssistantStreamingState {
  isStreaming: boolean;
  onStop?: () => Promise<void>;
  hiddenHeader: boolean;
}

function useAssistantStreamingState(message: AgentChatMessageRecord): AssistantStreamingState {
  const msg = message as StreamingMsg;
  const isStreaming = msg._streaming === true && (msg._streamingState?.isStreaming ?? false);
  return { isStreaming, onStop: msg._streamingState?.onStop, hiddenHeader: msg._streaming === true };
}

interface AssistantMessageProps {
  message: AgentChatMessageRecord;
  workspaceRoot?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
}

export const AssistantMessage = React.memo(function AssistantMessage(
  props: AssistantMessageProps,
): React.ReactElement {
  const streaming = useAssistantStreamingState(props.message);
  const snapshotHash = props.message.orchestration?.preSnapshotHash;
  const showChangeSummary = shouldShowChangeSummary(
    streaming.isStreaming, snapshotHash, props.workspaceRoot, props.message.blocks,
  );

  const [showRaw, setShowRaw] = useState(false);
  const onToggleRaw = useCallback(() => setShowRaw((v) => !v), []);
  const [collapsed, toggleCollapsed] = useCollapseState(props.message);

  const { density } = useDensity();
  const paddingClass = density === 'compact' ? 'py-0.5' : 'py-1';
  const isLong = !streaming.isStreaming && (props.message.content?.length ?? 0) >= COLLAPSE_THRESHOLD;

  return (
    <div className={`group flex justify-start ${paddingClass}`}>
      <div className="w-full max-w-[95%]">
        <AssistantMessageHeader
          message={props.message} hidden={streaming.hiddenHeader}
          showRaw={showRaw} onToggleRaw={onToggleRaw}
          onBranch={props.onBranch} onRevert={props.onRevert}
        />
        {!collapsed && (
          <AssistantMessageContent
            message={props.message} isStreaming={streaming.isStreaming} showRaw={showRaw}
            onStop={streaming.onStop} workspaceRoot={props.workspaceRoot}
            snapshotHash={snapshotHash} onOpenLinkedDetails={props.onOpenLinkedDetails}
            showChangeSummary={showChangeSummary}
          />
        )}
        {isLong && <CollapseButton collapsed={collapsed} onToggle={toggleCollapsed} />}
      </div>
    </div>
  );
});
