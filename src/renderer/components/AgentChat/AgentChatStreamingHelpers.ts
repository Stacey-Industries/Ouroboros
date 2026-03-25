/**
 * AgentChatStreamingHelpers.ts — Streaming completion logic for ConversationBody.
 * Extracted from AgentChatConversationBody.tsx to keep it under the 300-line limit.
 */
import type {
  AgentChatContentBlock,
  AgentChatMessageRecord,
  AgentChatThreadRecord,
} from '../../types/electron';

const FILE_MODIFYING_TOOLS_SET = new Set([
  'Write',
  'Edit',
  'MultiEdit',
  'write_file',
  'edit_file',
  'multi_edit',
  'NotebookEdit',
  'create_file',
]);

export function buildFilteredMessages(
  messages: AgentChatMessageRecord[],
): AgentChatMessageRecord[] {
  return messages.filter((message) => {
    if (message.role !== 'status') return true;
    const kind = (message as { statusKind?: string }).statusKind;
    return kind !== 'progress' && kind !== 'verification';
  });
}

function findLastAssistantMessage(
  thread: AgentChatThreadRecord,
): AgentChatMessageRecord | undefined {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i].role === 'assistant') return thread.messages[i];
  }
  return undefined;
}

export function dispatchDiffReviewEvent(
  thread: AgentChatThreadRecord,
  blocks: AgentChatContentBlock[],
): void {
  const lastAssistant = findLastAssistantMessage(thread);
  const snapshotHash = lastAssistant?.orchestration?.preSnapshotHash;
  if (!snapshotHash || !thread.workspaceRoot) return;
  const fileEditBlocks = blocks.filter(
    (b) => b.kind === 'tool_use' && FILE_MODIFYING_TOOLS_SET.has(b.tool),
  );
  if (fileEditBlocks.length === 0) return;
  const filePaths = [
    ...new Set(fileEditBlocks.filter((b) => b.filePath).map((b) => b.filePath as string)),
  ];
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-diff-review', {
      detail: {
        sessionId: lastAssistant!.id,
        snapshotHash,
        projectRoot: thread.workspaceRoot,
        filePaths,
      },
    }),
  );
}

export interface SyntheticStreamingMessageArgs {
  activeThread: AgentChatThreadRecord;
  streamingBlocks: AgentChatContentBlock[];
  streamingMessageId: string | undefined;
  activeTextContent: string;
  isStreaming: boolean;
  threadIsActive: boolean;
  onStop: (() => Promise<void>) | undefined;
}

export function buildSyntheticStreamingMessage(
  args: SyntheticStreamingMessageArgs,
): AgentChatMessageRecord {
  const {
    activeThread,
    streamingBlocks,
    streamingMessageId,
    activeTextContent,
    isStreaming,
    threadIsActive,
    onStop,
  } = args;
  return {
    id: streamingMessageId || `streaming-${Date.now()}`,
    threadId: activeThread.id,
    role: 'assistant',
    content: activeTextContent || '',
    createdAt: Date.now(),
    blocks: streamingBlocks.length > 0 ? streamingBlocks : undefined,
    _streaming: true,
    _streamingState: { isStreaming: threadIsActive || isStreaming, onStop },
  } as AgentChatMessageRecord & { _streaming: boolean; _streamingState: unknown };
}
