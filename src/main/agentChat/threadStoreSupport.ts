import { createHash, randomUUID } from 'crypto';

import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from './types';
import { isNonEmptyString } from './utils';
export { isNonEmptyString } from './utils';

export const DEFAULT_THREAD_TITLE = 'New Chat';

function normalizeTimestamp(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function copyNonEmptyString<T extends Record<string, unknown>>(
  target: T,
  key: keyof T & string,
  value: unknown,
): void {
  if (isNonEmptyString(value)) {
    // eslint-disable-next-line security/detect-object-injection -- key is a known literal property name
    target[key] = value as T[typeof key];
  }
}

const LINK_STRING_FIELDS: Array<keyof AgentChatOrchestrationLink> = [
  'taskId',
  'sessionId',
  'attemptId',
  'provider',
  'claudeSessionId',
  'codexThreadId',
  'model',
  'effort',
  'linkedTerminalId',
  'preSnapshotHash',
];

export function normalizeLink(
  link: AgentChatOrchestrationLink | undefined,
): AgentChatOrchestrationLink | undefined {
  if (!link) return undefined;

  const normalized: AgentChatOrchestrationLink = {};
  for (const field of LINK_STRING_FIELDS) {
    // eslint-disable-next-line security/detect-object-injection -- field from static LINK_STRING_FIELDS array
    copyNonEmptyString(normalized as Record<string, unknown>, field, link[field]);
  }

  return normalized.taskId || normalized.sessionId || normalized.attemptId ? normalized : undefined;
}

function sortMessages(messages: AgentChatMessageRecord[]): AgentChatMessageRecord[] {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
    return left.id.localeCompare(right.id);
  });
}

function normalizeContextSummary(
  summary: AgentChatMessageRecord['contextSummary'],
): AgentChatMessageRecord['contextSummary'] {
  if (!summary) return undefined;

  return {
    selectedFileCount: Number.isFinite(summary.selectedFileCount)
      ? Number(summary.selectedFileCount)
      : 0,
    omittedFileCount: Number.isFinite(summary.omittedFileCount)
      ? Number(summary.omittedFileCount)
      : 0,
    usedAdvancedControls: Boolean(summary.usedAdvancedControls),
  };
}

function normalizeVerificationPreview(
  preview: AgentChatMessageRecord['verificationPreview'],
): AgentChatMessageRecord['verificationPreview'] {
  if (!preview) return undefined;

  return {
    profile: preview.profile,
    status: preview.status,
    summary: isNonEmptyString(preview.summary) ? preview.summary : '',
  };
}

function normalizeErrorPayload(
  error: AgentChatMessageRecord['error'],
): AgentChatMessageRecord['error'] {
  if (!error) return undefined;

  return {
    code: error.code,
    message: isNonEmptyString(error.message) ? error.message : '',
    recoverable: Boolean(error.recoverable),
  };
}

function normalizeMessage(
  message: AgentChatMessageRecord,
  now: () => number,
  threadId = message.threadId,
): AgentChatMessageRecord {
  const createdAt = normalizeTimestamp(message.createdAt, now());

  return {
    ...message,
    id: isNonEmptyString(message.id) ? message.id : randomUUID(),
    threadId: isNonEmptyString(threadId) ? threadId : '',
    content: isNonEmptyString(message.content) ? message.content : '',
    createdAt,
    orchestration: normalizeLink(message.orchestration),
    contextSummary: normalizeContextSummary(message.contextSummary),
    verificationPreview: normalizeVerificationPreview(message.verificationPreview),
    error: normalizeErrorPayload(message.error),
  };
}

export function normalizeMessages(
  messages: AgentChatMessageRecord[] | undefined,
  now: () => number,
  threadId?: string,
): AgentChatMessageRecord[] {
  if (!Array.isArray(messages)) return [];
  const normalized = messages.map((message) => normalizeMessage(message, now, threadId));
  return sortMessages(normalized);
}

export function hashThreadId(threadId: string): string {
  return createHash('sha1').update(threadId).digest('hex');
}

function findLatestLink(
  messages: AgentChatMessageRecord[],
): AgentChatOrchestrationLink | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const msg = messages.at(index);
    if (!msg) continue;
    const link = normalizeLink(msg.orchestration);
    if (link) return link;
  }

  return undefined;
}

export function normalizeThreadRecord(
  thread: AgentChatThreadRecord,
  now: () => number,
): AgentChatThreadRecord {
  const createdAt = normalizeTimestamp(thread.createdAt, now());
  const updatedAt = normalizeTimestamp(thread.updatedAt, createdAt);
  const threadId = isNonEmptyString(thread.id) ? thread.id : randomUUID();
  const messages = normalizeMessages(thread.messages, now, threadId);

  const normalized: AgentChatThreadRecord = {
    version: 1,
    id: threadId,
    workspaceRoot: isNonEmptyString(thread.workspaceRoot) ? thread.workspaceRoot : '',
    createdAt,
    updatedAt,
    title: isNonEmptyString(thread.title) ? thread.title.trim() : DEFAULT_THREAD_TITLE,
    status: thread.status ?? 'idle',
    messages,
    latestOrchestration: normalizeLink(thread.latestOrchestration) ?? findLatestLink(messages),
  };

  if (thread.branchInfo) normalized.branchInfo = thread.branchInfo;
  if (thread.compactionCount !== undefined) normalized.compactionCount = thread.compactionCount;
  if (thread.turnCount !== undefined) normalized.turnCount = thread.turnCount;
  if (thread.tags !== undefined) normalized.tags = thread.tags;

  return normalized;
}

export function upsertMessage(options: {
  message: AgentChatMessageRecord;
  messages: AgentChatMessageRecord[];
  now: () => number;
  threadId: string;
}): AgentChatMessageRecord[] {
  const nextMessage = normalizeMessage(options.message, options.now, options.threadId);
  const existingIndex = options.messages.findIndex((entry) => entry.id === nextMessage.id);

  if (existingIndex === -1) return sortMessages([...options.messages, nextMessage]);

  const nextMessages = [...options.messages];
  // eslint-disable-next-line security/detect-object-injection -- existingIndex from findIndex on same array
  nextMessages[existingIndex] = nextMessage;
  return sortMessages(nextMessages);
}
