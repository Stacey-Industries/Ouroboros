/**
 * agentChatWorkspaceSendFlows.ts — Send / resend / edit-and-resend / stop flows
 * extracted from agentChatWorkspaceActionHelpers.ts to keep that file under the
 * 300-line ESLint limit. Pure helpers and request builders remain in the
 * helpers file; this one owns the orchestration of the async send/stop paths.
 */
import type {
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
} from '../../types/electron';
import {
  type AgentChatActionArgs,
  applyComposerFailure,
  applyComposerSuccess,
  applyResendFailure,
  applyResendSuccess,
  buildComposerRequest,
  buildResendRequest,
  getErrorMessage,
  hasElectronAPI,
  mergeReturnedThread,
  saveAllDirtyBuffers,
  sendAgentChatRequest,
  type SendMessageArgs,
} from './agentChatWorkspaceActionHelpers';

async function resolveSkill(
  content: string,
): Promise<{ displayContent: string; skillExpansion?: string }> {
  return { displayContent: content };
}

export async function sendComposerMessage(args: SendMessageArgs): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI())
    return void args.setError('Open a project before chatting with the agent.');
  const rawContent = args.draft.trim();
  if ((!rawContent && !args.attachments?.length) || args.isSending) return;
  const { displayContent, skillExpansion } = await resolveSkill(rawContent);
  args.setIsSending(true);
  args.setError(null);
  args.setDraft('');
  args.setPendingUserMessage(displayContent);
  try {
    await saveAllDirtyBuffers();
    applyComposerSuccess(
      args,
      await sendAgentChatRequest(
        buildComposerRequest(args, displayContent, skillExpansion),
        'Unable to send the chat message.',
      ),
    );
  } catch (sendError) {
    applyComposerFailure(args, displayContent, sendError);
  } finally {
    args.setIsSending(false);
  }
}

export function queueOrFail(
  args: AgentChatActionArgs,
  message: AgentChatMessageRecord,
  source: 'edit' | 'retry',
): boolean {
  if (!args.pendingResendRef) {
    args.setError('The agent is still working. Wait for it to finish or stop it first.');
    return false;
  }
  args.pendingResendRef.current = { message, source };
  args.setError('Queued — this will send once the agent finishes. Press Stop to run it now.');
  return true;
}

export async function sendResentMessage(
  args: AgentChatActionArgs,
  message: AgentChatMessageRecord,
  source: 'edit' | 'retry',
): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI())
    return void args.setError('Open a project before chatting with the agent.');
  const content = message.content.trim();
  if (!content || args.isSending) return;
  const threadStatus = args.activeThread?.status;
  if (threadStatus === 'running' || threadStatus === 'submitting') {
    queueOrFail(args, message, source);
    return;
  }
  args.setIsSending(true);
  args.setError(null);
  try {
    await saveAllDirtyBuffers();
    applyResendSuccess(
      args,
      await sendAgentChatRequest(
        buildResendRequest(args, content, source),
        source === 'edit' ? 'Unable to send the edited message.' : 'Unable to retry the message.',
      ),
      source,
    );
  } catch (sendError) {
    applyResendFailure(args, sendError);
  } finally {
    args.setIsSending(false);
  }
}

export async function resolveLinkedSessionId(
  link: AgentChatOrchestrationLink,
): Promise<string | null> {
  if (link.sessionId) return link.sessionId;
  const result = (await window.electronAPI.agentChat.getLinkedDetails(
    link,
  )) as AgentChatLinkedDetailsResult;
  if (!result.success)
    throw new Error(result.error ?? 'Unable to open linked orchestration details.');
  return result.session?.id ?? result.link?.sessionId ?? null;
}

export async function forkAndSendEdit(
  args: AgentChatActionArgs,
  message: AgentChatMessageRecord,
  content: string,
): Promise<void> {
  const forkResult = await window.electronAPI.agentChat.forkThread({
    sourceThreadId: message.threadId,
    fromMessageId: message.id,
    includeHistory: true,
    isSideChat: false,
  });
  if (!forkResult.success || !forkResult.thread)
    throw new Error(forkResult.error ?? 'Unable to create branch for edit.');
  mergeReturnedThread(forkResult.thread, args.setThreads, args.setActiveThreadId);
  const branchArgs = { ...args, activeThreadId: forkResult.thread.id };
  await saveAllDirtyBuffers();
  applyResendSuccess(
    branchArgs,
    await sendAgentChatRequest(
      buildResendRequest(branchArgs, content, 'edit'),
      'Unable to send the edited message.',
    ),
    'edit',
  );
}

export async function editAndResendOnBranch(
  args: AgentChatActionArgs,
  message: AgentChatMessageRecord,
): Promise<void> {
  if (!args.projectRoot || !hasElectronAPI())
    return void args.setError('Open a project before chatting with the agent.');
  const content = message.content.trim();
  if (!content || args.isSending) return;
  const threadStatus = args.activeThread?.status;
  if (threadStatus === 'running' || threadStatus === 'submitting') {
    queueOrFail(args, message, 'edit');
    return;
  }
  args.setIsSending(true);
  args.setError(null);
  try {
    await forkAndSendEdit(args, message, content);
  } catch (editError) {
    applyResendFailure(args, editError);
  } finally {
    args.setIsSending(false);
  }
}

function markThreadCancelled(a: AgentChatActionArgs, threadId: string): void {
  a.setThreads((prev) =>
    prev.map((t) => (t.id === threadId ? { ...t, status: 'cancelled' as const } : t)),
  );
}

async function stopByTaskId(
  a: AgentChatActionArgs,
  threadId: string | undefined,
  taskId: string,
): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  if (threadId) markThreadCancelled(a, threadId);
  try {
    await window.electronAPI.agentChat.cancelTask(taskId);
  } catch (e) {
    a.setError(getErrorMessage(e));
  }
  return true;
}

async function stopByThreadId(a: AgentChatActionArgs, threadId: string): Promise<void> {
  if (!hasElectronAPI()) return;
  markThreadCancelled(a, threadId);
  try {
    await window.electronAPI.agentChat.cancelByThreadId(threadId);
  } catch {
    /* best-effort */
  }
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
  if (taskId) {
    const stopped = await stopByTaskId(a, threadId, taskId);
    if (stopped) return;
  }
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
