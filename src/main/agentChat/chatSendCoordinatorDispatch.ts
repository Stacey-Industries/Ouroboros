import { createMinimalOrchestration } from '../ipc-handlers/agentChatOrchestration';
import log from '../logger';
import type { ProviderProgressEvent } from '../orchestration/types';
import type {
  ActiveSendRecord,
  DispatchProviderArgs,
  DispatchProviderResult,
  TerminalKind,
} from './chatSendCoordinatorSupport';

const defaultOrchestration = createMinimalOrchestration();

function dispatchToolStart(record: ActiveSendRecord, progress: ProviderProgressEvent): boolean {
  const tool = progress.contentBlock?.toolActivity;
  if (!tool?.toolUseId || !tool.name) return false;
  if (tool.status !== 'running' || record.startedTools.has(tool.toolUseId)) return false;
  record.startedTools.add(tool.toolUseId);
  record.dispatch({
    type: 'tool_call_started',
    threadId: record.threadId,
    turnId: record.turnId,
    toolUseId: tool.toolUseId as never,
    name: tool.name,
    ts: progress.timestamp,
    seq: 0,
  });
  return true;
}

function dispatchToolCompletion(record: ActiveSendRecord, progress: ProviderProgressEvent): void {
  const tool = progress.contentBlock?.toolActivity;
  if (!tool?.toolUseId || !tool.name) return;
  if (tool.status === 'complete' && record.startedTools.delete(tool.toolUseId)) {
    record.dispatch({
      type: 'tool_call_completed',
      threadId: record.threadId,
      turnId: record.turnId,
      toolUseId: tool.toolUseId as never,
      finalInput: tool.inputSummary ?? '',
      ts: progress.timestamp,
      seq: 0,
    });
  }
  if (!tool.output) return;
  record.dispatch({
    type: 'tool_result_observed',
    threadId: record.threadId,
    turnId: record.turnId,
    toolUseId: tool.toolUseId as never,
    content: tool.output,
    ts: progress.timestamp,
    seq: 0,
  });
}

function assignProviderSession(record: ActiveSendRecord, progress: ProviderProgressEvent): void {
  const psid = progress.session?.sessionId;
  if (!psid || record.providerSessionAssigned) return;
  record.providerSessionAssigned = true;
  record.registry.assignProviderSession(record.turnId, psid as never);
  record.persistence.assignProviderSessionToAlias(record.turnId, psid as never);
  record.persistence.setLastProviderSession(record.threadId, psid as never);
  record.dispatch({
    type: 'provider_session_assigned',
    threadId: record.threadId,
    turnId: record.turnId,
    providerSessionId: psid as never,
    ts: progress.timestamp,
    seq: 0,
  });
}

function dispatchTextDelta(record: ActiveSendRecord, progress: ProviderProgressEvent): void {
  const delta =
    progress.contentBlock?.blockType === 'text'
      ? (progress.contentBlock.textDelta ?? '')
      : (progress.message ?? '');
  if (!delta) return;
  record.dispatch({
    type: 'text_delta',
    threadId: record.threadId,
    turnId: record.turnId,
    delta,
    ts: progress.timestamp,
    seq: 0,
  });
}

export function handleCoordinatorProgress(
  record: ActiveSendRecord,
  progress: ProviderProgressEvent,
): void {
  if (record.finalized) return;
  assignProviderSession(record, progress);
  if (progress.status !== 'streaming') return;
  if (dispatchToolStart(record, progress)) return;
  if (progress.contentBlock?.blockType === 'tool_use') {
    dispatchToolCompletion(record, progress);
    return;
  }
  dispatchTextDelta(record, progress);
}

function hasStreamingEvent(record: ActiveSendRecord): boolean {
  return record.eventLog.some(
    (event) =>
      event.type === 'text_delta' ||
      event.type === 'tool_call_started' ||
      event.type === 'tool_result_observed',
  );
}

function dispatchCompleted(record: ActiveSendRecord, message: string): void {
  if (!hasStreamingEvent(record)) {
    record.dispatch({
      type: 'text_delta',
      threadId: record.threadId,
      turnId: record.turnId,
      delta: message,
      ts: Date.now(),
      seq: 0,
    });
  }
  record.dispatch({
    type: 'turn_completed',
    threadId: record.threadId,
    turnId: record.turnId,
    finalText: message,
    ts: Date.now(),
    seq: 0,
  });
}

function dispatchTerminal(record: ActiveSendRecord, kind: TerminalKind, message: string): void {
  if (kind === 'completed') {
    dispatchCompleted(record, message);
    return;
  }
  record.dispatch(
    kind === 'failed'
      ? {
          type: 'turn_failed',
          threadId: record.threadId,
          turnId: record.turnId,
          errorMessage: message || 'Provider task failed.',
          subtype: 'error',
          ts: Date.now(),
          seq: 0,
        }
      : {
          type: 'turn_cancelled',
          threadId: record.threadId,
          turnId: record.turnId,
          ts: Date.now(),
          seq: 0,
        },
  );
}

export function finalizeActiveSend(
  record: ActiveSendRecord,
  kind: TerminalKind,
  message = '',
): void {
  if (record.finalized) return;
  record.finalized = true;
  dispatchTerminal(record, kind, message);
  record.dispatch({
    type: 'message_committed',
    threadId: record.threadId,
    turnId: record.turnId,
    messageId: record.messageId,
    ts: Date.now(),
    seq: 0,
  });
  record.persistence.appendCanonicalEventLog(record.messageId, record.eventLog);
  record.registry.retireTurn(record.turnId);
  record.persistence.retireAlias(record.turnId, Date.now());
}

function isTerminalStatus(status: ProviderProgressEvent['status']): status is TerminalKind {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function matchesProgress(
  taskId: string,
  sessionId: string | undefined,
  progress: ProviderProgressEvent,
): boolean {
  return progress.session?.externalTaskId === taskId || progress.session?.sessionId === sessionId;
}

function createProgressListener(args: {
  onProgress: DispatchProviderArgs['onProgress'];
  onTerminal: DispatchProviderArgs['onTerminal'];
  sessionIdRef: { current: string | undefined };
  taskId: string;
  unsubscribe: () => void;
}) {
  return (progress: ProviderProgressEvent) => {
    if (!matchesProgress(args.taskId, args.sessionIdRef.current, progress)) return;
    args.onProgress(progress);
    if (!isTerminalStatus(progress.status)) return;
    args.unsubscribe();
    args.onTerminal(progress.status, progress.message ?? '');
  };
}

export async function defaultDispatchProvider(
  args: DispatchProviderArgs,
): Promise<DispatchProviderResult> {
  const taskId = await createTaskId(args.taskRequest);
  const sessionIdRef: { current: string | undefined } = { current: undefined };
  let unsubscribe = () => undefined;
  unsubscribe = defaultOrchestration.onProviderEvent(
    createProgressListener({
      onProgress: args.onProgress,
      onTerminal: args.onTerminal,
      sessionIdRef,
      taskId,
      unsubscribe: () => unsubscribe(),
    }),
  );
  try {
    const started = await defaultOrchestration.startTask(taskId);
    if (!started.success)
      throw new Error(started.error ?? 'Failed to start the orchestration task.');
    sessionIdRef.current = started.session?.providerSession?.sessionId ?? started.session?.id;
    return {
      kill: () => {
        unsubscribe();
        void defaultOrchestration.cancelTask(taskId).catch((error) => {
          log.warn('[chatSendCoordinator] cancelTask failed', { error, taskId });
        });
      },
    };
  } catch (error) {
    unsubscribe();
    throw error;
  }
}

async function createTaskId(taskRequest: DispatchProviderArgs['taskRequest']): Promise<string> {
  const created = await defaultOrchestration.createTask(taskRequest);
  if (created.success && created.taskId) return created.taskId;
  throw new Error(created.error ?? 'Failed to create the orchestration task.');
}
