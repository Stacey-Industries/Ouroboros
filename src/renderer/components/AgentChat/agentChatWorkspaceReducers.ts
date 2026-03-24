/**
 * agentChatWorkspaceReducers.ts — Pure thread merge/sort helpers for agentChatWorkspaceSupport.
 * Extracted to keep agentChatWorkspaceSupport.ts under the 300-line limit.
 */
import type {
  AgentChatMessageRecord,
  AgentChatThreadRecord,
  AgentChatThreadStatusSnapshot,
} from '../../types/electron';

function sortThreads(threads: AgentChatThreadRecord[]): AgentChatThreadRecord[] {
  return [...threads].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    return left.id.localeCompare(right.id);
  });
}

function sortMessages(messages: AgentChatMessageRecord[]): AgentChatMessageRecord[] {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
    return left.id.localeCompare(right.id);
  });
}

export function mergeThreadCollection(
  threads: AgentChatThreadRecord[],
  nextThread: AgentChatThreadRecord,
): AgentChatThreadRecord[] {
  const existing = threads.find((thread) => thread.id === nextThread.id);
  const remainingThreads = threads.filter((thread) => thread.id !== nextThread.id);

  // Defensive merge: if the incoming thread has fewer messages than the
  // existing one (possible due to race conditions or stale snapshots),
  // merge message arrays by ID to avoid losing messages.
  let merged = nextThread;
  if (
    existing &&
    existing.messages.length > 0 &&
    nextThread.messages.length < existing.messages.length
  ) {
    const messageMap = new Map<string, AgentChatMessageRecord>();
    for (const msg of existing.messages) messageMap.set(msg.id, msg);
    // Incoming messages take priority (they may have updated fields)
    for (const msg of nextThread.messages) messageMap.set(msg.id, msg);
    const mergedMessages = sortMessages(Array.from(messageMap.values()));
    merged = { ...nextThread, messages: mergedMessages };
  }

  return sortThreads([...remainingThreads, merged]);
}

export function mergeThreadMessage(
  threads: AgentChatThreadRecord[],
  message: AgentChatMessageRecord,
): AgentChatThreadRecord[] {
  const targetThread = threads.find((thread) => thread.id === message.threadId);
  if (!targetThread) return threads;

  const nextMessages = sortMessages([
    ...targetThread.messages.filter((entry) => entry.id !== message.id),
    message,
  ]);

  return mergeThreadCollection(threads, {
    ...targetThread,
    messages: nextMessages,
    updatedAt: Math.max(targetThread.updatedAt, message.createdAt),
  });
}

function mergeOrchestrationFields(
  incoming: AgentChatThreadRecord['latestOrchestration'],
  existing: AgentChatThreadRecord['latestOrchestration'],
): AgentChatThreadRecord['latestOrchestration'] {
  if (!incoming) return existing;
  return {
    ...incoming,
    provider: incoming.provider ?? existing?.provider,
    claudeSessionId: incoming.claudeSessionId ?? existing?.claudeSessionId,
    codexThreadId: incoming.codexThreadId ?? existing?.codexThreadId,
    linkedTerminalId: incoming.linkedTerminalId ?? existing?.linkedTerminalId,
  };
}

export function mergeThreadStatus(
  threads: AgentChatThreadRecord[],
  status: AgentChatThreadStatusSnapshot,
): AgentChatThreadRecord[] {
  const targetThread = threads.find((thread) => thread.id === status.threadId);
  if (!targetThread) return threads;

  // Preserve linkedTerminalId from the existing thread when the incoming
  // status update doesn't carry one. Early session updates fire before
  // the adapter has populated it, so we treat it as a "sticky" field.
  const mergedOrchestration = mergeOrchestrationFields(
    status.latestOrchestration,
    targetThread.latestOrchestration,
  );

  return mergeThreadCollection(threads, {
    ...targetThread,
    status: status.status,
    latestOrchestration: mergedOrchestration,
    updatedAt: status.updatedAt,
  });
}
