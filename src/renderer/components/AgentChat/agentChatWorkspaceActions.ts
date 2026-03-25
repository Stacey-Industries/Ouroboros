import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react';

import type { SkillDefinition } from '../../../shared/types/rulesAndSkills';
import { SAVE_ALL_DIRTY_EVENT } from '../../hooks/appEventNames';
import type { AgentChatLinkedDetailsResult, AgentChatMessageRecord, AgentChatOrchestrationLink, AgentChatThreadRecord, CodexModelOption, ImageAttachment, ModelProvider } from '../../types/electron';
import { mergeThreadCollection, useThreadSelectionActions } from './agentChatWorkspaceSupport';
import type { ChatOverrides } from './ChatControlsBar';
import { clearPersistedDraft, isDraftThreadId } from './useAgentChatDraftPersistence';
import type { AgentChatWorkspaceModel, QueuedMessage } from './useAgentChatWorkspace';

export interface SendMessageArgs {
  activeThreadId: string | null; attachments?: ImageAttachment[]; setAttachments?: Dispatch<SetStateAction<ImageAttachment[]>>;
  chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[]; contextFilePaths?: string[];
  draft: string; isSending: boolean; projectRoot: string | null;
  setActiveThreadId: Dispatch<SetStateAction<string | null>>; setDraft: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>; setIsSending: Dispatch<SetStateAction<boolean>>; setPendingUserMessage: Dispatch<SetStateAction<string | null>>;
  setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>;
  skills?: SkillDefinition[];
}

type AgentChatActionArgs = SendMessageArgs & { activeThread: AgentChatThreadRecord | null; setError: Dispatch<SetStateAction<string | null>> };
type AgentChatActionState = { branchFromMessage: (message: AgentChatMessageRecord) => Promise<void>; deleteThread: (threadId: string) => Promise<void>; editAndResend: (message: AgentChatMessageRecord) => Promise<void>; openLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; retryMessage: (message: AgentChatMessageRecord) => Promise<void>; revertMessage: (message: AgentChatMessageRecord) => Promise<void>; selectThread: (threadId: string | null) => void; sendMessage: () => Promise<void>; startNewChat: () => void; stopTask: () => Promise<void>; };
type BuildWorkspaceModelArgs = AgentChatActionState & { activeThread: AgentChatThreadRecord | null; activeThreadId: string | null; attachments: ImageAttachment[]; setAttachments: (attachments: ImageAttachment[]) => void; chatOverrides: ChatOverrides; setChatOverrides: (overrides: ChatOverrides) => void; settingsModel: string; codexSettingsModel: string; defaultProvider: 'claude-code' | 'codex' | 'anthropic-api'; modelProviders: ModelProvider[]; codexModels: CodexModelOption[]; closeDetails: () => void; details: AgentChatLinkedDetailsResult | null; detailsError: string | null; detailsIsLoading: boolean; draft: string; error: string | null; isLoading: boolean; isDetailsOpen: boolean; isSending: boolean; pendingUserMessage: string | null; openConversationDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; openDetailsInOrchestration: () => void; projectRoot: string | null; reloadThreads: () => Promise<void>; setContextFilePaths: (paths: string[]) => void; setDraft: (value: string) => void; threads: AgentChatThreadRecord[]; queuedMessages: QueuedMessage[]; editQueuedMessage: (id: string) => void; deleteQueuedMessage: (id: string) => void; sendQueuedMessageNow: (id: string) => Promise<void>; skills?: SkillDefinition[]; };

function hasElectronAPI(): boolean { return typeof window !== 'undefined' && 'electronAPI' in window; }
function getErrorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function parseSkillArgs(argsStr: string, skill: SkillDefinition): Record<string, string> {
  const argParts = argsStr ? argsStr.split(/\s+/) : [];
  const params: Record<string, string> = {};
  skill.parameters.forEach((p, i) => { if (argParts[i]) params[p.name] = argParts[i]; });
  return params;
}

function findMatchingSkill(cmdName: string, skills: SkillDefinition[]): SkillDefinition | undefined {
  return skills.find((s) => s.id === cmdName || s.name === cmdName || `skill:${s.id}` === cmdName);
}

export async function handleSkillExpansion(
  content: string,
  projectRoot: string,
  skills: SkillDefinition[],
  provider?: string,
): Promise<{ handled: boolean; expandedContent?: string }> {
  if (!content.startsWith('/')) return { handled: false };
  const spaceIdx = content.indexOf(' ');
  const cmdName = spaceIdx > 0 ? content.slice(1, spaceIdx) : content.slice(1);
  const argsStr = spaceIdx > 0 ? content.slice(spaceIdx + 1).trim() : '';
  const skill = findMatchingSkill(cmdName, skills);
  if (!skill) return { handled: false };
  if (!hasElectronAPI() || !window.electronAPI.rulesAndSkills) return { handled: false };
  const params = parseSkillArgs(argsStr, skill);
  const result = await window.electronAPI.rulesAndSkills.expandSkill(projectRoot, skill.id, params, provider);
  if (!result.success || !result.expansion) return { handled: false };
  return { handled: true, expandedContent: result.expansion.expandedBody };
}
async function saveAllDirtyBuffers(): Promise<void> { const promises: Promise<void>[] = []; window.dispatchEvent(new CustomEvent(SAVE_ALL_DIRTY_EVENT, { detail: { addPromise: (promise: Promise<void>) => promises.push(promise) } })); if (promises.length > 0) await Promise.all(promises); }
function isCodexModel(model: string | undefined, codexModels: CodexModelOption[] | undefined): boolean { return Boolean(model) && (codexModels ?? []).some((entry) => entry.id === model); }
function getThreadIdForSend(threadId: string | null): string | undefined { return isDraftThreadId(threadId) ? undefined : threadId ?? undefined; }
function buildContextSelection(contextFilePaths?: string[]): { userSelectedFiles: string[] } | undefined { return contextFilePaths?.length ? { userSelectedFiles: contextFilePaths } : undefined; }
function buildChatOverrides(args: { chatOverrides?: ChatOverrides; codexModels?: CodexModelOption[] }): Record<string, string> | undefined { const overrides: Record<string, string> = {}; const selectedModel = args.chatOverrides?.model; if (selectedModel) { overrides.provider = isCodexModel(selectedModel, args.codexModels) ? 'codex' : 'claude-code'; overrides.model = selectedModel; } if (args.chatOverrides?.effort) overrides.effort = args.chatOverrides.effort; if (args.chatOverrides?.permissionMode && args.chatOverrides.permissionMode !== 'default') overrides.permissionMode = args.chatOverrides.permissionMode; return Object.keys(overrides).length > 0 ? overrides : undefined; }
function mergeReturnedThread(resultThread: AgentChatThreadRecord | null | undefined, setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>, setActiveThreadId: Dispatch<SetStateAction<string | null>>): void { if (!resultThread) return; setThreads((currentThreads) => mergeThreadCollection(currentThreads, resultThread)); setActiveThreadId(resultThread.id); }
async function sendAgentChatRequest(request: { threadId?: string; workspaceRoot: string; content: string; attachments?: ImageAttachment[]; contextSelection?: { userSelectedFiles: string[] }; overrides?: Record<string, string>; metadata: { source: 'composer' | 'edit' | 'retry'; usedAdvancedControls: boolean }; skillExpansion?: string }, failureMessage: string): Promise<{ success: boolean; error?: string; thread?: AgentChatThreadRecord | null }> { const result = await window.electronAPI.agentChat.sendMessage(request); if (!result.success) throw new Error(result.error ?? failureMessage); return result; }
function buildComposerRequest(args: SendMessageArgs, content: string, skillExpansion?: string): Parameters<typeof sendAgentChatRequest>[0] { return { threadId: getThreadIdForSend(args.activeThreadId), workspaceRoot: args.projectRoot as string, content, attachments: args.attachments?.length ? args.attachments : undefined, contextSelection: buildContextSelection(args.contextFilePaths), overrides: buildChatOverrides({ chatOverrides: args.chatOverrides, codexModels: args.codexModels }), metadata: { source: 'composer', usedAdvancedControls: Boolean(args.contextFilePaths?.length) }, skillExpansion }; }
function buildResendRequest(args: AgentChatActionArgs, content: string, source: 'edit' | 'retry'): Parameters<typeof sendAgentChatRequest>[0] { return { threadId: args.activeThreadId ?? undefined, workspaceRoot: args.projectRoot as string, content, metadata: { source, usedAdvancedControls: false } }; }
function applyComposerSuccess(args: SendMessageArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>): void { args.setAttachments?.([]); mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId); args.setPendingUserMessage(null); clearPersistedDraft(result.thread?.id ?? args.activeThreadId); if (isDraftThreadId(args.activeThreadId) && result.thread) clearPersistedDraft(args.activeThreadId); }
function applyComposerFailure(args: SendMessageArgs, content: string, error: unknown): void { args.setError(getErrorMessage(error)); args.setDraft(content); args.setPendingUserMessage(null); }
function applyResendSuccess(args: AgentChatActionArgs, result: Awaited<ReturnType<typeof sendAgentChatRequest>>, source: 'edit' | 'retry'): void { mergeReturnedThread(result.thread, args.setThreads, args.setActiveThreadId); if (source === 'edit') { args.setDraft(''); clearPersistedDraft(result.thread?.id ?? args.activeThreadId); } }
function applyResendFailure(args: AgentChatActionArgs, error: unknown): void { args.setError(getErrorMessage(error)); }
function resolveProvider(args: SendMessageArgs): string {
  const model = args.chatOverrides?.model;
  if (model && isCodexModel(model, args.codexModels)) return 'codex';
  return 'claude-code';
}
interface SkillResolution { displayContent: string; skillExpansion?: string; }
async function resolveSkill(content: string, args: SendMessageArgs): Promise<SkillResolution> {
  if (!content.startsWith('/') || !args.projectRoot) return { displayContent: content };
  const result = await handleSkillExpansion(content, args.projectRoot, args.skills ?? [], resolveProvider(args));
  if (!result.handled || !result.expandedContent) return { displayContent: content };
  const cmdName = content.slice(1).split(/\s/)[0];
  return { displayContent: `⚡ ${cmdName}`, skillExpansion: result.expandedContent };
}
async function sendComposerMessage(args: SendMessageArgs): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI()) return void args.setError('Open a project before chatting with the agent.');
  const rawContent = args.draft.trim();
  if ((!rawContent && !args.attachments?.length) || args.isSending) return;
  const { displayContent, skillExpansion } = await resolveSkill(rawContent, args);
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
export function useEditAndResendAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> { const argsRef = useRef(args); argsRef.current = args; return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { await sendResentMessage(argsRef.current, message, 'edit'); }, []); }
export function useRetryMessageAction(args: AgentChatActionArgs): (message: AgentChatMessageRecord) => Promise<void> { const argsRef = useRef(args); argsRef.current = args; return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { await sendResentMessage(argsRef.current, message, 'retry'); }, []); }
export function useBranchFromMessageAction(setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>, setActiveThreadId: Dispatch<SetStateAction<string | null>>, setError: Dispatch<SetStateAction<string | null>>): (message: AgentChatMessageRecord) => Promise<void> { return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { if (!hasElectronAPI()) return; try { const result = await window.electronAPI.agentChat.branchThread(message.threadId, message.id); if (!result.success) throw new Error(result.error ?? 'Unable to branch the conversation.'); mergeReturnedThread(result.thread, setThreads, setActiveThreadId); } catch (branchError) { setError(getErrorMessage(branchError)); } }, [setActiveThreadId, setError, setThreads]); }
export function useStopTaskAction(activeThread: AgentChatThreadRecord | null, setError: Dispatch<SetStateAction<string | null>>): () => Promise<void> { return useCallback(async (): Promise<void> => { const taskId = activeThread?.latestOrchestration?.taskId; if (!taskId || !hasElectronAPI()) return; try { await window.electronAPI.agentChat.cancelTask(taskId); } catch (stopError) { setError(getErrorMessage(stopError)); } }, [activeThread, setError]); }
export function useRevertMessageAction(setError: Dispatch<SetStateAction<string | null>>, setThreads: Dispatch<SetStateAction<AgentChatThreadRecord[]>>): (message: AgentChatMessageRecord) => Promise<void> { return useCallback(async (message: AgentChatMessageRecord): Promise<void> => { if (!hasElectronAPI()) return; if (!message.orchestration?.preSnapshotHash) return void setError('No snapshot was captured before this agent turn. Revert is unavailable.'); try { const result = await window.electronAPI.agentChat.revertToSnapshot(message.threadId, message.id); if (!result.success) return void setError(result.error ?? 'Revert failed.'); const threadsResult = await window.electronAPI.agentChat.listThreads(); if (threadsResult.success && threadsResult.threads) setThreads(threadsResult.threads); } catch (revertError) { setError(getErrorMessage(revertError)); } }, [setError, setThreads]); }

export function useAgentChatActions(args: AgentChatActionArgs): AgentChatActionState { const selectionActions = useThreadSelectionActions(args.setActiveThreadId, args.setError); const sendMessage = useSendMessageAction(args); const openLinkedDetails = useOpenLinkedDetailsAction(args.setError); const deleteThread = useDeleteThreadAction(args.setThreads, args.setActiveThreadId, args.setError); const editAndResend = useEditAndResendAction(args); const retryMessage = useRetryMessageAction(args); const revertMessage = useRevertMessageAction(args.setError, args.setThreads); const branchFromMessage = useBranchFromMessageAction(args.setThreads, args.setActiveThreadId, args.setError); const stopTask = useStopTaskAction(args.activeThread, args.setError); return { branchFromMessage, deleteThread, editAndResend, openLinkedDetails, retryMessage, revertMessage, selectThread: selectionActions.selectThread, sendMessage, startNewChat: selectionActions.startNewChat, stopTask }; }
export function buildAgentChatWorkspaceModel(args: BuildWorkspaceModelArgs): AgentChatWorkspaceModel { return { ...args, skills: args.skills ?? [], canSend: Boolean(args.projectRoot && (args.draft.trim() || args.attachments.length > 0)) && !args.isSending, hasProject: Boolean(args.projectRoot) }; }
