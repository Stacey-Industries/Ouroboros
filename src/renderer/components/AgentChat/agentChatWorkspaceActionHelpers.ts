/**
 * agentChatWorkspaceActionHelpers.ts — Pure helpers and async request functions
 * extracted from agentChatWorkspaceActions.ts to keep it under the 300-line limit.
 */
import { type Dispatch, type SetStateAction } from 'react';

import type { UserSelectedFileRange } from '../../../shared/types/orchestrationDomain';
import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type {
  AgentChatMessageRecord,
  AgentChatSendMessageOverrides,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
} from '../../types/electron';
import { mergeThreadCollection } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { isAnthropicAutoModel } from './ChatControlsBarSupport';
import { clearPersistedDraft, isDraftThreadId } from './useAgentChatDraftPersistence';
import { sendChatCommandMessage } from './useAgentChatStreaming';

// ── Shared types ──────────────────────────────────────────────────────────────

export type QueuedResend = { message: AgentChatMessageRecord; source: 'edit' | 'retry' };

export interface SendMessageArgs {
  activeThreadId: string | null;
  attachments?: ImageAttachment[];
  setAttachments?: Dispatch<SetStateAction<ImageAttachment[]>>;
  chatOverrides?: ChatOverrides;
  codexModels?: CodexModelOption[];
  contextFilePaths?: string[];
  mentionRanges?: UserSelectedFileRange[];
  draft: string;
  isSending: boolean;
  pendingUserMessage: string | null;
  projectRoot: string | null;
  pendingResendRef?: React.MutableRefObject<QueuedResend | null>;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setPendingUserMessage: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
  /** Wave 71 — popover-local disabled IDs (file:<path>, mention:<i>:<label>) */
  disabledLocalIds?: ReadonlySet<string>;
  /** Wave 71 — clear local-disabled set after a successful send */
  setDisabledLocalIds?: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

export type AgentChatActionArgs = SendMessageArgs & {
  activeThread: AgentChatThreadRecord | null;
  setError: Dispatch<SetStateAction<string | null>>;
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export async function saveAllDirtyBuffers(): Promise<void> {
  const promises: Promise<void>[] = [];
  window.dispatchEvent(
    new CustomEvent(SAVE_ALL_DIRTY_EVENT, {
      detail: { addPromise: (promise: Promise<void>) => promises.push(promise) },
    }),
  );
  if (promises.length > 0) await Promise.all(promises);
}
function isCodexModel(
  model: string | undefined,
  codexModels: CodexModelOption[] | undefined,
): boolean {
  return Boolean(model) && (codexModels ?? []).some((entry) => entry.id === model);
}
export function getThreadIdForSend(threadId: string | null): string | undefined {
  return isDraftThreadId(threadId) ? undefined : (threadId ?? undefined);
}
function disabledFilePaths(disabled: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  disabled.forEach((id) => {
    if (id.startsWith('file:')) out.add(id.slice('file:'.length));
  });
  return out;
}

function disabledMentionIndexes(disabled: ReadonlySet<string>): Set<number> {
  const out = new Set<number>();
  disabled.forEach((id) => {
    if (!id.startsWith('mention:')) return;
    const rest = id.slice('mention:'.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return;
    const idx = Number(rest.slice(0, sep));
    if (Number.isInteger(idx)) out.add(idx);
  });
  return out;
}

export function buildContextSelection(
  contextFilePaths?: string[],
  mentionRanges?: UserSelectedFileRange[],
  disabledLocalIds?: ReadonlySet<string>,
): { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } | undefined {
  if (!contextFilePaths?.length) return undefined;
  const disabled = disabledLocalIds ?? new Set<string>();
  const droppedPaths = disabledFilePaths(disabled);
  const filteredFiles = droppedPaths.size
    ? contextFilePaths.filter((p) => !droppedPaths.has(p))
    : contextFilePaths;
  if (!filteredFiles.length) return undefined;
  const result: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } = {
    userSelectedFiles: filteredFiles,
  };
  if (mentionRanges?.length) {
    const droppedIdx = disabledMentionIndexes(disabled);
    const filteredMentions = droppedIdx.size
      ? mentionRanges.filter((_, i) => !droppedIdx.has(i))
      : mentionRanges;
    if (filteredMentions.length) result.userSelectedRanges = filteredMentions;
  }
  return result;
}
function applyModelOverride(
  overrides: Record<string, string>,
  model: string,
  codexModels?: CodexModelOption[],
): void {
  if (isAnthropicAutoModel(model)) {
    overrides.provider = 'claude-code';
    return;
  }
  overrides.provider = isCodexModel(model, codexModels) ? 'codex' : 'claude-code';
  overrides.model = model;
}
function applyScalarOverrides(
  overrides: AgentChatSendMessageOverrides,
  chatOverrides: ChatOverrides,
): void {
  if (chatOverrides.effort) overrides.effort = chatOverrides.effort;
  if (chatOverrides.permissionMode && chatOverrides.permissionMode !== 'default')
    overrides.permissionMode = chatOverrides.permissionMode;
  if (chatOverrides.profileId) overrides.profileId = chatOverrides.profileId;
  if (chatOverrides.toolOverrides !== undefined)
    overrides.toolOverrides = chatOverrides.toolOverrides;
}
export function buildChatOverrides(args: {
  chatOverrides?: ChatOverrides;
  codexModels?: CodexModelOption[];
}): AgentChatSendMessageOverrides | undefined {
  if (!args.chatOverrides) return undefined;
  const overrides: AgentChatSendMessageOverrides = {};
  if (args.chatOverrides.model)
    applyModelOverride(
      overrides as Record<string, string>,
      args.chatOverrides.model,
      args.codexModels,
    );
  applyScalarOverrides(overrides, args.chatOverrides);
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
export function mergeReturnedThread(
  resultThread: AgentChatThreadRecord | null | undefined,
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>,
  setActiveThreadId: Dispatch<SetStateAction<string | null>>,
): void {
  if (!resultThread) return;
  setThreads((currentThreads) => mergeThreadCollection(currentThreads, resultThread));
  setActiveThreadId(resultThread.id);
}

// ── Send request helpers ──────────────────────────────────────────────────────

export type SendRequest = {
  threadId?: string;
  workspaceRoot: string;
  content: string;
  attachments?: ImageAttachment[];
  contextSelection?: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] };
  overrides?: AgentChatSendMessageOverrides;
  metadata: { source: 'composer' | 'edit' | 'retry'; usedAdvancedControls: boolean };
  skillExpansion?: string;
};

export async function sendAgentChatRequest(
  request: SendRequest,
  failureMessage: string,
): Promise<{ success: boolean; error?: string; threadId?: string }> {
  const result = await sendChatCommandMessage(request);
  if (!result.success) throw new Error(result.error ?? failureMessage);
  return result;
}
export function buildComposerRequest(
  args: SendMessageArgs,
  content: string,
  skillExpansion?: string,
): SendRequest {
  return {
    threadId: getThreadIdForSend(args.activeThreadId),
    workspaceRoot: args.projectRoot as string,
    content,
    attachments: args.attachments?.length ? args.attachments : undefined,
    contextSelection: buildContextSelection(
      args.contextFilePaths,
      args.mentionRanges,
      args.disabledLocalIds,
    ),
    overrides: buildChatOverrides({
      chatOverrides: args.chatOverrides,
      codexModels: args.codexModels,
    }),
    metadata: { source: 'composer', usedAdvancedControls: Boolean(args.contextFilePaths?.length) },
    skillExpansion,
  };
}
export function buildResendRequest(
  args: AgentChatActionArgs,
  content: string,
  source: 'edit' | 'retry',
): SendRequest {
  return {
    threadId: args.activeThreadId ?? undefined,
    workspaceRoot: args.projectRoot as string,
    content,
    metadata: { source, usedAdvancedControls: false },
  };
}
export async function applyComposerSuccess(
  args: SendMessageArgs,
  result: Awaited<ReturnType<typeof sendAgentChatRequest>>,
): Promise<void> {
  args.setAttachments?.([]);
  args.setDisabledLocalIds?.(new Set());
  // New path returns threadId (not a full thread object). Refresh thread list
  // from main so the new thread appears in the tab bar, then activate it.
  const returnedThreadId = result.threadId;
  if (returnedThreadId) {
    const listed = await window.electronAPI.agentChat.listThreads();
    if (listed.success && listed.threads) {
      args.setThreads(listed.threads);
    }
    args.setActiveThreadId(returnedThreadId);
  }
  /* pendingUserMessage stays set until the persisted user message appears — see usePendingUserMessageClearEffect. */
  clearPersistedDraft(returnedThreadId ?? args.activeThreadId);
  if (isDraftThreadId(args.activeThreadId) && returnedThreadId)
    clearPersistedDraft(args.activeThreadId);
}
export function applyComposerFailure(args: SendMessageArgs, content: string, error: unknown): void {
  args.setError(getErrorMessage(error));
  args.setDraft(content);
  args.setPendingUserMessage(null);
}
export function applyResendSuccess(
  args: AgentChatActionArgs,
  result: Awaited<ReturnType<typeof sendAgentChatRequest>>,
  source: 'edit' | 'retry',
): void {
  // New path returns threadId, not a full thread object. Activate the thread
  // directly; the thread record arrives via chatState:diff / listThreads refresh.
  if (result.threadId) args.setActiveThreadId(result.threadId);
  if (source === 'edit') {
    args.setDraft('');
    clearPersistedDraft(result.threadId ?? args.activeThreadId);
  }
}
export function applyResendFailure(args: AgentChatActionArgs, error: unknown): void {
  args.setError(getErrorMessage(error));
}

// Send flows + stop helpers extracted to ./agentChatWorkspaceSendFlows.ts to
// keep this file under the 300-line ESLint cap.
