/**
 * agentChatWorkspaceActionHelpers.ts — Pure helpers and async request functions
 * extracted from agentChatWorkspaceActions.ts to keep it under the 300-line limit.
 */
import { type Dispatch, type SetStateAction } from 'react';

import type { UserSelectedFileRange } from '../../../shared/types/orchestrationDomain';
import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatSendMessageOverrides,
  AgentChatThreadRecord,
  CodexModelOption,
  ImageAttachment,
} from '../../types/electron';
import { mergeThreadCollection } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { isAnthropicAutoModel } from './ChatControlsBarSupport';
import { clearPersistedDraft, isDraftThreadId } from './useAgentChatDraftPersistence';

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
  window.dispatchEvent(new CustomEvent(SAVE_ALL_DIRTY_EVENT, {
    detail: { addPromise: (promise: Promise<void>) => promises.push(promise) },
  }));
  if (promises.length > 0) await Promise.all(promises);
}
function isCodexModel(model: string | undefined, codexModels: CodexModelOption[] | undefined): boolean {
  return Boolean(model) && (codexModels ?? []).some((entry) => entry.id === model);
}
export function getThreadIdForSend(threadId: string | null): string | undefined {
  return isDraftThreadId(threadId) ? undefined : (threadId ?? undefined);
}
export function buildContextSelection(
  contextFilePaths?: string[],
  mentionRanges?: UserSelectedFileRange[],
): { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } | undefined {
  if (!contextFilePaths?.length) return undefined;
  const result: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } = { userSelectedFiles: contextFilePaths };
  if (mentionRanges?.length) result.userSelectedRanges = mentionRanges;
  return result;
}
function applyModelOverride(overrides: Record<string, string>, model: string, codexModels?: CodexModelOption[]): void {
  if (isAnthropicAutoModel(model)) { overrides.provider = 'claude-code'; return; }
  overrides.provider = isCodexModel(model, codexModels) ? 'codex' : 'claude-code';
  overrides.model = model;
}
function applyScalarOverrides(overrides: AgentChatSendMessageOverrides, chatOverrides: ChatOverrides): void {
  if (chatOverrides.effort) overrides.effort = chatOverrides.effort;
  if (chatOverrides.permissionMode && chatOverrides.permissionMode !== 'default') overrides.permissionMode = chatOverrides.permissionMode;
  if (chatOverrides.profileId) overrides.profileId = chatOverrides.profileId;
  if (chatOverrides.toolOverrides !== undefined) overrides.toolOverrides = chatOverrides.toolOverrides;
}
export function buildChatOverrides(args: { chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[] }): AgentChatSendMessageOverrides | undefined {
  if (!args.chatOverrides) return undefined;
  const overrides: AgentChatSendMessageOverrides = {};
  if (args.chatOverrides.model) applyModelOverride(overrides as Record<string, string>, args.chatOverrides.model, args.codexModels);
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

type SendRequest = {
  threadId?: string; workspaceRoot: string; content: string; attachments?: ImageAttachment[];
  contextSelection?: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] };
  overrides?: AgentChatSendMessageOverrides;
  metadata: { source: 'composer' | 'edit' | 'retry'; usedAdvancedControls: boolean };
  skillExpansion?: string;
};
export async function sendAgentChatRequest(
  request: SendRequest,
  failureMessage: string,
): Promise<{ success: boolean; error?: string; thread?: AgentChatThreadRecord | null }> {
  const result = await window.electronAPI.agentChat.sendMessage(request);
  if (!result.success) throw new Error(result.error ?? failureMessage);
  return result;
}
export function buildComposerRequest(args: SendMessageArgs, content: string, skillExpansion?: string): SendRequest {
  return {
    threadId: getThreadIdForSend(args.activeThreadId),
    workspaceRoot: args.projectRoot as string,
    content,
    attachments: args.attachments?.length ? args.attachments : undefined,
    contextSelection: buildContextSelection(args.contextFilePaths, args.mentionRanges),
    overrides: buildChatOverrides({ chatOverrides: args.chatOverrides, codexModels: args.codexModels }),
    metadata: { source: 'composer', usedAdvancedControls: Boolean(args.contextFilePaths?.length) },
    skillExpansion,
  };
}
export function buildResendRequest(args: AgentChatActionArgs, content: string, source: 'edit' | 'retry'): SendRequest {
  return { threadId: args.activeThreadId ?? undefined, workspaceRoot: args.projectRoot as string, content, metadata: { source, usedAdvancedControls: false } };
}
export function applyComposerSuccess(args: SendMessageArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>): void {
  args.setAttachments?.([]);
  mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId);
  /* pendingUserMessage stays set until the persisted user message appears — see usePendingUserMessageClearEffect. */ clearPersistedDraft(result.thread?.id ?? args.activeThreadId);
  if (isDraftThreadId(args.activeThreadId) && result.thread) clearPersistedDraft(args.activeThreadId);
}
export function applyComposerFailure(args: SendMessageArgs, content: string, error: unknown): void {
  args.setError(getErrorMessage(error));
  args.setDraft(content);
  args.setPendingUserMessage(null);
}
export function applyResendSuccess(args: AgentChatActionArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>, source: 'edit' | 'retry'): void {
  mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId);
  if (source === 'edit') { args.setDraft(''); clearPersistedDraft(result.thread?.id ?? args.activeThreadId); }
}
export function applyResendFailure(args: AgentChatActionArgs, error: unknown): void {
  args.setError(getErrorMessage(error));
}

// ── Send flows ────────────────────────────────────────────────────────────────

async function resolveSkill(content: string): Promise<{ displayContent: string; skillExpansion?: string }> {
  return { displayContent: content };
}
export async function sendComposerMessage(args: SendMessageArgs): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const rawContent = args.draft.trim();
  if ((!rawContent && !args.attachments?.length) || args.isSending) return;
  const { displayContent, skillExpansion } = await resolveSkill(rawContent);
  args.setIsSending(true); args.setError(null); args.setDraft(''); args.setPendingUserMessage(displayContent);
  try {
    await saveAllDirtyBuffers();
    applyComposerSuccess(args, await sendAgentChatRequest(buildComposerRequest(args, displayContent, skillExpansion), 'Unable to send the chat message.'));
  } catch (sendError) {
    applyComposerFailure(args, displayContent, sendError);
  } finally { args.setIsSending(false); }
}
export function queueOrFail(args: AgentChatActionArgs, message: AgentChatMessageRecord, source: 'edit' | 'retry'): boolean {
  if (!args.pendingResendRef) { args.setError('The agent is still working. Wait for it to finish or stop it first.'); return false; }
  args.pendingResendRef.current = { message, source };
  args.setError('Queued — this will send once the agent finishes. Press Stop to run it now.');
  return true;
}
export async function sendResentMessage(args: AgentChatActionArgs, message: AgentChatMessageRecord, source: 'edit' | 'retry'): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const content = message.content.trim();
  if (!content || args.isSending) return;
  const threadStatus = args.activeThread?.status;
  if (threadStatus === 'running' || threadStatus === 'submitting') { queueOrFail(args, message, source); return; }
  args.setIsSending(true); args.setError(null);
  try {
    await saveAllDirtyBuffers();
    applyResendSuccess(args, await sendAgentChatRequest(buildResendRequest(args, content, source), source === 'edit' ? 'Unable to send the edited message.' : 'Unable to retry the message.'), source);
  } catch (sendError) { applyResendFailure(args, sendError); }
  finally { args.setIsSending(false); }
}
export async function resolveLinkedSessionId(link: AgentChatOrchestrationLink): Promise<string | null> {
  if (link.sessionId) return link.sessionId;
  const result = (await window.electronAPI.agentChat.getLinkedDetails(link)) as AgentChatLinkedDetailsResult;
  if (!result.success) throw new Error(result.error ?? 'Unable to open linked orchestration details.');
  return result.session?.id ?? result.link?.sessionId ?? null;
}
export async function forkAndSendEdit(args: AgentChatActionArgs, message: AgentChatMessageRecord, content: string): Promise<void> {
  const forkResult = await window.electronAPI.agentChat.forkThread({ sourceThreadId: message.threadId, fromMessageId: message.id, includeHistory: true, isSideChat: false });
  if (!forkResult.success || !forkResult.thread) throw new Error(forkResult.error ?? 'Unable to create branch for edit.');
  mergeReturnedThread(forkResult.thread, args.setThreads, args.setActiveThreadId);
  const branchArgs = { ...args, activeThreadId: forkResult.thread.id };
  await saveAllDirtyBuffers();
  applyResendSuccess(branchArgs, await sendAgentChatRequest(buildResendRequest(branchArgs, content, 'edit'), 'Unable to send the edited message.'), 'edit');
}
export async function editAndResendOnBranch(args: AgentChatActionArgs, message: AgentChatMessageRecord): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const content = message.content.trim();
  if (!content || args.isSending) return;
  const threadStatus = args.activeThread?.status;
  if (threadStatus === 'running' || threadStatus === 'submitting') { queueOrFail(args, message, 'edit'); return; }
  args.setIsSending(true); args.setError(null);
  try { await forkAndSendEdit(args, message, content); }
  catch (editError) { applyResendFailure(args, editError); }
  finally { args.setIsSending(false); }
}

// ── Stop task helpers ─────────────────────────────────────────────────────────

function markThreadCancelled(a: AgentChatActionArgs, threadId: string): void {
  a.setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, status: 'cancelled' as const } : t)));
}
async function stopByTaskId(a: AgentChatActionArgs, threadId: string | undefined, taskId: string): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  if (threadId) markThreadCancelled(a, threadId);
  try { await window.electronAPI.agentChat.cancelTask(taskId); } catch (e) { a.setError(getErrorMessage(e)); }
  return true;
}
async function stopByThreadId(a: AgentChatActionArgs, threadId: string): Promise<void> {
  if (!hasElectronAPI()) return;
  markThreadCancelled(a, threadId);
  try { await window.electronAPI.agentChat.cancelByThreadId(threadId); } catch { /* best-effort */ }
}
function stopSendingInFlight(a: AgentChatActionArgs): void {
  if (!a.isSending) return;
  a.setIsSending(false);
  if (a.pendingUserMessage) a.setDraft(a.pendingUserMessage);
  a.setPendingUserMessage(null);
}
export async function executeStopTask(a: AgentChatActionArgs): Promise<void> {
  const threadId = a.activeThread?.id;
  const taskId = a.activeThread?.latestOrchestration?.taskId;
  if (taskId) { const stopped = await stopByTaskId(a, threadId, taskId); if (stopped) return; }
  if (threadId) await stopByThreadId(a, threadId);
  stopSendingInFlight(a);
}

/**
 * Fire any resend request that was queued while the thread was busy. Called
 * by useFlushPendingResend when the thread transitions from busy → idle.
 */
export async function flushPendingResend(args: AgentChatActionArgs): Promise<void> {
  const pending = args.pendingResendRef?.current;
  if (!pending) return;
  args.pendingResendRef!.current = null;
  if (pending.source === 'edit') await editAndResendOnBranch(args, pending.message);
  else await sendResentMessage(args, pending.message, pending.source);
}
