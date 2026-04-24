import log from '../../logger';
import type { ProviderCapabilities } from '../types';
import {
  createCodexCapabilities,
  getCodexTransportDecision,
  resolveCodexSettings,
} from './codexAdapterHelpers';
import {
  activeHandles,
  cancelledTasks,
  emitTransportWarning,
  scheduleCodexAppServerLaunch,
  scheduleExecLaunch,
} from './codexAdapterLaunchSupport';
import { type CodexExecProcessHandle } from './codexExecRunner';
import {
  buildCodexCompletionArgs,
  buildCodexEventComponents,
  buildCodexLaunchResult,
  buildCodexPlaceholderHandle,
  buildCodexSessionRef,
  type CodexCompletionArgs,
} from './codexLaunch';
import {
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';

export type { CodexCompletionArgs };

export { handleLaunchError, handleLaunchSuccess } from './codexAdapterLaunchSupport';

function setupCodexLaunch(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  requestId: string,
  resumeThreadId?: string,
) {
  const sessionRef = buildCodexSessionRef(context, requestId, resumeThreadId);
  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Launching Codex session',
    timestamp: Date.now(),
    session: sessionRef,
  });
  const {
    handler: eventHandler,
    getNextBlockIndex,
    getUsage,
  } = buildCodexEventComponents(sink, sessionRef);
  const { placeholder, getCancelledBeforeLaunch } = buildCodexPlaceholderHandle(
    context,
    activeHandles as Map<string, CodexExecProcessHandle>,
  );
  return {
    sessionRef,
    eventHandler,
    getNextBlockIndex,
    getUsage,
    placeholder,
    getCancelledBeforeLaunch,
  };
}

function dispatchTransport(params: {
  transport: 'app-server' | 'exec';
  completionArgs: CodexCompletionArgs;
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  eventHandler: (event: import('./codexExecRunner').CodexExecEvent) => void;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
  resolved: ReturnType<typeof resolveCodexSettings>;
  resumeThreadId?: string;
}): void {
  const common = {
    completionArgs: params.completionArgs,
    context: params.context,
    cwd: params.cwd,
    model: params.resolved.model,
    resumeThreadId: params.resumeThreadId,
    invocationTempPaths: params.invocationTempPaths,
    getCancelledBeforeLaunch: params.getCancelledBeforeLaunch,
    eventHandler: params.eventHandler,
  };
  if (params.transport === 'app-server') {
    scheduleCodexAppServerLaunch({
      ...common,
      execCliArgs: params.resolved.cliArgs,
      settings: params.resolved.settings,
    });
    return;
  }
  scheduleExecLaunch({ ...common, cliArgs: params.resolved.cliArgs });
}

function launchCodex(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeThreadId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const cwd = context.request.workspaceRoots[0];
  const { transport, warning } = getCodexTransportDecision(context);
  const setup = setupCodexLaunch(context, sink, requestId, resumeThreadId);
  activeHandles.set(context.taskId, setup.placeholder);
  const launchResult = buildCodexLaunchResult(setup.sessionRef, sink);
  emitTransportWarning(sink, launchResult.session, warning);
  const invocationTempPaths: string[] = [];
  const completionArgs = buildCodexCompletionArgs({
    context,
    sessionRef: setup.sessionRef,
    sink,
    getUsage: setup.getUsage,
    getNextBlockIndex: setup.getNextBlockIndex,
    invocationTempPaths,
  });
  const resolved = resolveCodexSettings(context, transport);
  dispatchTransport({
    transport,
    completionArgs,
    context,
    cwd,
    eventHandler: setup.eventHandler,
    getCancelledBeforeLaunch: setup.getCancelledBeforeLaunch,
    invocationTempPaths,
    resolved,
    resumeThreadId,
  });
  return launchResult;
}

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex' as const;

  getCapabilities(): ProviderCapabilities {
    return createCodexCapabilities();
  }

  async submitTask(
    context: ProviderLaunchContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const resumeThreadId = context.request.resumeFromSessionId || undefined;
    if (resumeThreadId)
      log.info(`[codex-diag] submitTask resuming with threadId=${resumeThreadId}`);
    return launchCodex(context, sink, resumeThreadId);
  }

  async resumeTask(
    context: ProviderResumeContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const resumeThreadId =
      context.providerSession?.sessionId || context.request.resumeFromSessionId || undefined;
    if (resumeThreadId)
      log.info(`[codex-diag] resumeTask resuming with threadId=${resumeThreadId}`);
    return launchCodex(context, sink, resumeThreadId);
  }

  async cancelTask(session: {
    requestId?: string;
    sessionId?: string;
    externalTaskId?: string;
  }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId;
    if (!targetId) return;
    const handle = activeHandles.get(targetId);
    if (handle) {
      cancelledTasks.add(targetId);
      handle.kill();
      activeHandles.delete(targetId);
      return;
    }
    for (const [taskId, proc] of activeHandles) {
      if (proc.threadId === targetId || taskId === targetId) {
        cancelledTasks.add(taskId);
        proc.kill();
        activeHandles.delete(taskId);
        return;
      }
    }
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter();
}
