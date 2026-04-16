import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react';

import type { CommandDefinition } from '../../../shared/types/claudeConfig';
import type { UserSelectedFileRange } from '../../../shared/types/orchestrationDomain';
import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type { AgentChatLinkedDetailsResult, AgentChatMessageRecord, AgentChatOrchestrationLink, AgentChatThreadRecord, CodexModelOption, ImageAttachment, ModelProvider } from '../../types/electron';
import { mergeThreadCollection, useThreadSelectionActions } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { isAnthropicAutoModel } from './ChatControlsBarSupport';
import { clearPersistedDraft, isDraftThreadId } from './useAgentChatDraftPersistence';
import type { AgentChatWorkspaceModel, QueuedMessage } from './useAgentChatWorkspace';

export interface SendMessageArgs {
  activeThreadId: string | null; attachments?: ImageAttachment[]; setAttachments?: Dispatch<SetStateAction<ImageAttachment[]>>;
  chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[]; contextFilePaths?: string[];
  mentionRanges?: UserSelectedFileRange[];
  draft: string; isSending: boolean; pendingUserMessage: string | null; projectRoot: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>; setDraft: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>; setIsSending: Dispatch<SetStateAction<boolean>>; setPendingUserMessage: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
}

type AgentChatActionArgs = SendMessageArgs & { activeThread: AgentChatThreadRecord | null; setError: Dispatch<SetStateAction<string | null>> };
type AgentChatActionState = { branchFromMessage: (message: AgentChatMessageRecord) => Promise<void>; deleteThread: (threadId: string) => Promise<void>; editAndResend: (message: AgentChatMessageRecord) => Promise<void>; openLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; retryMessage: (message: AgentChatMessageRecord) => Promise<void>; revertMessage: (message: AgentChatMessageRecord) => Promise<void>; selectThread: (threadId: string | null) => void; sendMessage: () => Promise<void>; startNewChat: () => void; stopTask: () => Promise<void>; };
type BuildWorkspaceModelArgs = AgentChatActionState & { activeThread: AgentChatThreadRecord | null; activeThreadId: string | null; attachments: ImageAttachment[]; setAttachments: (attachments: ImageAttachment[]) => void; chatOverrides: ChatOverrides; setChatOverrides: (overrides: ChatOverrides) => void; settingsModel: string; codexSettingsModel: string; defaultProvider: 'claude-code' | 'codex' | 'anthropic-api'; modelProviders: ModelProvider[]; codexModels: CodexModelOption[]; closeDetails: () => void; details: AgentChatLinkedDetailsResult | null; detailsError: string | null; detailsIsLoading: boolean; draft: string; error: string | null; isLoading: boolean; isDetailsOpen: boolean; isSending: boolean; pendingUserMessage: string | null; openConversationDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; openDetailsInOrchestration: () => void; projectRoot: string | null; reloadThreads: () => Promise<void>; setContextFilePaths: (paths: string[]) => void; setMentionRanges: (ranges: UserSelectedFileRange[]) => void; setDraft: (value: string) => void; threads: AgentChatThreadRecord[]; queuedMessages: QueuedMessage[]; editQueuedMessage: (id: string) => void; deleteQueuedMessage: (id: string) => void; sendQueuedMessageNow: (id: string) => Promise<void>; commands?: CommandDefinition[]; };

function hasElectronAPI(): boolean { return typeof window !== 'undefined' && 'electronAPI' in window; }
function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function saveAllDirtyBuffers(): Promise<void> { const promises: Promise<void>[] = []; window.dispatchEvent(new CustomEvent(SAVE_ALL_DIRTY_EVENT, { detail: { addPromise: (promise: Promise<void>) => promises.push(promise) } })); if (promises.length > 0) await Promise.all(promises); }
function isCodexModel(model: string | undefined, codexModels: CodexModelOption[] | undefined): boolean { return Boolean(model) && (codexModels ?? []).some((entry) => entry.id === model); }
function getThreadIdForSend(threadId: string | null): string | undefined { return isDraftThreadId(threadId) ? undefined : threadId ?? undefined; }
function buildContextSelection(
  contextFilePaths?: string[],
  mentionRanges?: UserSelectedFileRange[],
): { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } | undefined {
  if (!contextFilePaths?.length) return undefined;
  const result: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] } = {
    userSelectedFiles: contextFilePaths,
  };
  if (mentionRanges?.length) result.userSelectedRanges = mentionRanges;
  return result;
}
function applyModelOverride(overrides: Record<string, string>, model: string, codexModels?: CodexModelOption[]): void {
  if (isAnthropicAutoModel(model)) {
    overrides.provider = 'claude-code';
    return;
  }
  overrides.provider = isCodexModel(model, codexModels) ? 'codex' : 'claude-code';
  overrides.model = model;
}
function buildChatOverrides(args: { chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[] }): Record<string, string> | undefined {
  const overrides: Record<string, string> = {};
  const selectedModel = args.chatOverrides?.model;
  if (selectedModel) applyModelOverride(overrides, selectedModel, args.codexModels);
  if (args.chatOverrides?.effort) overrides.effort = args.chatOverrides.effort;
  if (args.chatOverrides?.permissionMode && args.chatOverrides.permissionMode !== 'default') overrides.permissionMode = args.chatOverrides.permissionMode;
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}
function mergeReturnedThread(resultThread: AgentChatThreadRecord | null | undefined, setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>, setActiveThreadId: Dispatch<SetStateAction<string | null>>): void { if (!resultThread) return; setThreads((currentThreads) => mergeThreadCollection(currentThreads, resultThread)); setActiveThreadId(resultThread.id); }
async function sendAgentChatRequest(request: { threadId?: string; workspaceRoot: string; content: string; attachments?: ImageAttachment[]; contextSelection?: { userSelectedFiles: string[]; userSelectedRanges?: UserSelectedFileRange[] }; overrides?: Record<string, string>; metadata: { source: 'composer' | 'edit' | 'retry'; usedAdvancedControls: boolean }; skillExpansion?: string }, failureMessage: string): Promise<{ success: boolean; error?: string; thread?: AgentChatThreadRecord | null }> { const result = await window.electronAPI.agentChat.sendMessage(request); if (!result.success) throw new Error(result.error ?? failureMessage); return result; }
function buildComposerRequest(args: SendMessageArgs, content: string, skillExpansion?: string): Parameters<typeof sendAgentChatRequest>[0] { return { threadId: getThreadIdForSend(args.activeThreadId), workspaceRoot: args.projectRoot as string, content, attachments: args.attachments?.length ? args.attachments : undefined, contextSelection: buildContextSelection(args.contextFilePaths, args.mentionRanges), overrides: buildChatOverrides({ chatOverrides: args.chatOverrides, codexModels: args.codexModels }), metadata: { source: 'composer', usedAdvancedControls: Boolean(args.contextFilePaths?.length) }, skillExpansion }; }
function buildResendRequest(args: AgentChatActionArgs, content: string, source: 'edit' | 'retry'): Parameters<typeof sendAgentChatRequest>[0] { return { threadId: args.activeThreadId ?? undefined, workspaceRoot: args.projectRoot as string, content, metadata: { source, usedAdvancedControls: false } }; }
function applyComposerSuccess(args: SendMessageArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>): void { args.setAttachments?.([]); mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId); args.setPendingUserMessage(null); clearPersistedDraft(result.thread?.id ?? args.activeThreadId); if (isDraftThreadId(args.activeThreadId) && result.thread) clearPersistedDraft(args.activeThreadId); }
function applyComposerFailure(args: SendMessageArgs, content: string, error: unknown): void { args.setError(getErrorMessage(error)); args.setDraft(content); args.setPendingUserMessage(null); }
function applyResendSuccess(args: AgentChatActionArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>, source: 'edit' | 'retry'): void { mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId); if (source === 'edit') { args.setDraft(''); clearPersistedDraft(result.thread?.id ?? args.activeThreadId); } }
function applyResendFailure(args: AgentChatActionArgs, error: unknown): void { args.setError(getErrorMessage(error)); }
interface SkillResolution { displayContent: string; skillExpansion?: string; }
async function resolveSkill(content: string): Promise<SkillResolution> {
  return { displayContent: content };
}
async function sendComposerMessage(args: SendMessageArgs): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const rawContent = args.draft.trim();
  if ((!rawContent && !args.attachments?.length) || args.isSending) return;
  const { displayContent, skillExpansion } = await resolveSkill(rawContent);
  args.setIsSending(true);
  args.setError(null);
  args.setDraft('');
  args.setPendingUserMessage(displayContent);
  try {
    await saveAllDirtyBuffers();
    const result = await sendAgentChatRequest(buildComposerRequest(args, displayContent, skillExpansion), 'Unable to send the chat message.');
    applyComposerSuccess(args, result);
  } catch (sendError) {
    applyComposerFailure(args, displayContent, sendError);
  } finally {
    args.setIsSending(false);
  }
}
async function sendResentMessage(args: AgentChatActionArgs, message: AgentChatMessageRecord, source: 'edit' | 'retry'): Promise<void> { if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.'); const content = message.content.trim(); if (!content || args.isSending) return; const threadStatus = args.activeThread?.status; if (threadStatus === 'running' || threadStatus === 'submitting') return void args.setError('The agent is still working. Wait for it to finish or stop it first.'); args.setIsSending(true); args.setError(null); try { await saveAllDirtyBuffers(); const result = await sendAgentChatRequest(buildResendRequest(args, content, source), source === 'edit' ? 'Unable to send the edited message.' : 'Unable to retry the message.'); applyResendSuccess(args, result, source); } catch (sendError) { applyResendFailure(args, sendError); } finally { args.setIsSending(false); } }
async function resolveLinkedSessionId(link: AgentChatOrchestrationLink): Promise<string | null> { if (link.sessionId) return link.sessionId; const result = await window.electronAPI.agentChat.getLinkedDetails(link) as AgentChatLinkedDetailsResult; if (!result.success) throw new Error(result.error ?? 'Unable to open linked orchestration details.'); return result.session?.id ?? result.link?.sessionId ?? null; }

export function useSendMessageAction(args: SendMessageArgs): () => Promise<void> { const argsRef = useRef(args); argsRef.current = args; return useCallback(async () => { await sendComposerMessage(argsRef.current); }, []); }
export function useOpenLinkedDetailsAction(setError: Dispatch<SetStateAction<string | null>>): (link?: AgentChatOrchestrationLink) => Promise<void> { return useCallback(async (link?: AgentChatOrchestrationLink): Promise<void> => { if (!link || !hasElectronAPI()) return; setError(null); try { const sessionId = await resolveLinkedSessionId(link); if (!sessionId) throw new Error('The linked orchestration session is unavailable.'); } catch (detailsError) { setError(getErrorMessage(detailsError)); } }, [setError]); }
export function useDeleteThreadAction(setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>, setActiveThreadId: Dispatch<SetStateAction<string | null>>, setError: Dispatch<SetStateAction<string | null>>): (threadId: string) => Promise<void> { return useCallback(async (threadId: string): Promise<void> => { if (!hasElectronAPI()) return; try { const result = await window.electronAPI.agentChat.deleteThread(threadId); if (!result.success) throw new Error(result.error ?? 'Unable to delete the chat thread.'); setThreads((currentThreads) => currentThreads.filter((thread) => thread.id !== threadId)); setActiveThreadId((currentId) => (currentId === threadId ? null : currentId)); } catch (deleteError) { setError(getErrorMessage(deleteError)); } }, [setActiveThreadId, setError, setThreads]); }
async function forkAndSendEdit(args: AgentChatActionArgs, message: AgentChatMessageRecord, content: string): Promise<void> {
  const forkResult = await window.electronAPI.agentChat.forkThread({
    sourceThreadId: message.threadId,
    fromMessageId: message.id,
    includeHistory: true,
    isSideChat: false,
  });
  if (!forkResult.success || !forkResult.thread) throw new Error(forkResult.error ?? 'Unable to create branch for edit.');
  mergeReturnedThread(forkResult.thread, args.setThreads, args.setActiveThreadId);
  const branchArgs = { ...args, activeThreadId: forkResult.thread.id };
  await saveAllDirtyBuffers();
  const sendResult = await sendAgentChatRequest(buildResendRequest(branchArgs, content, 'edit'), 'Unable to send the edited message.');
  applyResendSuccess(branchArgs, sendResult, 'edit');
}
async function editAndResendOnBranch(args: AgentChatActionArgs, message: AgentChatMessageRecord): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const content = message.content.trim();
  if (!content || args.isSending) return;
  const threadStatus = args.activeThread?.status;
  if (threadStatus === 'running' || threadStatus === 'submitting') return void args.setError('The agent is still working. Wait for it to finish or stop it first.');
  args.setIsSending(true);
  args.setError(null);
  try { await forkAndSendEdit(args, message, content); }
  catch (editError) { applyResendFailure(args, editError); }
  finally { args.setIsSending(false); }
}
export function useEditAndResendAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> { const argsRef = useRef(args); argsRef.current = args; return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { await editAndResendOnBranch(argsRef.current, message); }, []); }
export function useRetryMessageAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> { const argsRef = useRef(args); argsRef.current = args; return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { await sendResentMessage(argsRef.current, message, 'retry'); }, []); }
export function useBranchFromMessageAction(setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>, setActiveThreadId: Dispatch<SetStateAction<string | null>>, setError: Dispatch<SetStateAction<string | null>>): (message: AgentChatMessageRecord) => Promise<void> { return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { if (!hasElectronAPI()) return; try { const result = await window.electronAPI.agentChat.branchThread(message.threadId, message.id); if (!result.success) throw new Error(result.error ?? 'Unable to branch the conversation.'); mergeReturnedThread(result.thread, setThreads, setActiveThreadId); } catch (branchError) { setError(getErrorMessage(branchError)); } }, [setActiveThreadId, setError, setThreads]); }
function markThreadCancelled(a: AgentChatActionArgs, threadId: string): void {
  a.setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, status: 'cancelled' as const } : t));
}
async function stopByTaskId(a: AgentChatActionArgs, threadId: string | undefined, taskId: string): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  if (threadId) markThreadCancelled(a, threadId);
  try { await window.electronAPI.agentChat.cancelTask(taskId); }
  catch (e) { a.setError(getErrorMessage(e)); }
  return true;
}
async function stopByThreadId(a: AgentChatActionArgs, threadId: string): Promise<void> {
  if (!hasElectronAPI()) return;
  markThreadCancelled(a, threadId);
  try { await window.electronAPI.agentChat.cancelByThreadId(threadId); }
  catch { /* best-effort */ }
}
function stopSendingInFlight(a: AgentChatActionArgs): void {
  if (!a.isSending) return;
  a.setIsSending(false);
  if (a.pendingUserMessage) a.setDraft(a.pendingUserMessage);
  a.setPendingUserMessage(null);
}
async function executeStopTask(a: AgentChatActionArgs): Promise<void> {
  const threadId = a.activeThread?.id;
  const taskId = a.activeThread?.latestOrchestration?.taskId;
  if (taskId) {
    // Optimistic UI — show "Chat was stopped" immediately before awaiting backend
    const stopped = await stopByTaskId(a, threadId, taskId);
    if (stopped) return;
  }
  // No taskId yet — the send is still in flight. Register a pending cancel
  // on the backend so executePendingSend aborts before spawning the process.
  if (threadId) await stopByThreadId(a, threadId);
  stopSendingInFlight(a);
}
export function useStopTaskAction(args: AgentChatActionArgs): () => Promise<void> {
  const argsRef = useRef(args);
  argsRef.current = args;
  return useCallback(async (): Promise<void> => { await executeStopTask(argsRef.current); }, []);
}
export function useRevertMessageAction(setError: Dispatch<SetStateAction<string | null>>, setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>): (message: AgentChatMessageRecord) => Promise<void> { return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { if (!hasElectronAPI()) return; if (!message.orchestration?.preSnapshotHash) return void setError('No snapshot was captured before this agent turn. Revert is unavailable.'); try { const result = await window.electronAPI.agentChat.revertToSnapshot(message.threadId, message.id); if (!result.success) return void setError(result.error ?? 'Revert failed.'); const threadsResult = await window.electronAPI.agentChat.listThreads(); if (threadsResult.success && threadsResult.threads) setThreads(threadsResult.threads); } catch (revertError) { setError(getErrorMessage(revertError)); } }, [setError, setThreads]); }

export function useAgentChatActions(args: AgentChatActionArgs): AgentChatActionState { const selectionActions = useThreadSelectionActions(args.setActiveThreadId, args.setError); const sendMessage = useSendMessageAction(args); const openLinkedDetails = useOpenLinkedDetailsAction(args.setError); const deleteThread = useDeleteThreadAction(args.setThreads, args.setActiveThreadId, args.setError); const editAndResend = useEditAndResendAction(args); const retryMessage = useRetryMessageAction(args); const revertMessage = useRevertMessageAction(args.setError, args.setThreads); const branchFromMessage = useBranchFromMessageAction(args.setThreads, args.setActiveThreadId, args.setError); const stopTask = useStopTaskAction(args); return { branchFromMessage, deleteThread, editAndResend, openLinkedDetails, retryMessage, revertMessage, selectThread: selectionActions.selectThread, sendMessage, startNewChat: selectionActions.startNewChat, stopTask }; }
export function buildAgentChatWorkspaceModel(args: BuildWorkspaceModelArgs): AgentChatWorkspaceModel { return { ...args, commands: args.commands ?? [], canSend: Boolean(args.projectRoot && (args.draft.trim() || args.attachments.length > 0)) && !args.isSending, hasProject: Boolean(args.projectRoot) }; }
