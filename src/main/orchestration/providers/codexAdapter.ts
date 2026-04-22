import log from '../../logger';
import type { ProviderCapabilities } from '../types';
import {
  buildFailureMessage,
  cleanupTempFiles,
  createCodexCapabilities,
  getCodexTransportDecision,
  materializeAttachments,
  resolveCodexSettings,
} from './codexAdapterHelpers';
import { buildPrompt } from './codexContextBuilder';
import { runCodexAppServerTurn } from './codexAppServerRunner';
import type { CodexExecEvent } from './codexExecRunner';
import { type CodexExecProcessHandle } from './codexExecRunner';
import {
  buildCodexCompletionArgs,
  buildCodexEventComponents,
  buildCodexLaunchResult,
  buildCodexPlaceholderHandle,
  buildCodexSessionRef,
  type CodexCompletionArgs,
  spawnCodexProcess,
} from './codexLaunch';
import { verifyCodexThreadId } from './codexThreadDiag';
import {
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';

export type { CodexCompletionArgs };

interface ActiveCodexHandle {
  kill: () => void;
  readonly threadId: string | null;
}

const activeHandles = new Map<string, ActiveCodexHandle>();
const cancelledTasks = new Set<string>();

function cleanupLaunchArtifacts(taskId: string, invocationTempPaths: string[]): void {
  activeHandles.delete(taskId);
  void cleanupTempFiles(invocationTempPaths);
}

function emitTransportWarning(
  sink: ProviderProgressSink,
  sessionRef: ProviderLaunchResult['session'],
  warning: string | undefined,
): void {
  if (!warning) return;
  sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: warning,
    timestamp: Date.now(),
    session: sessionRef,
    contentBlock: {
      blockIndex: 0,
      blockType: 'text',
      textDelta: `\n\n---\n${warning}`,
    },
  });
}

export function handleLaunchSuccess(
  result: { durationMs: number; threadId: string | null } | null,
  args: CodexCompletionArgs,
): void {
  cleanupLaunchArtifacts(args.taskId, args.invocationTempPaths);
  if (!result) {
    args.sink.emit({
      provider: 'codex',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: args.sessionRef,
    });
    return;
  }
  if (result.threadId) {
    args.sessionRef.sessionId = result.threadId;
    log.info(`[codex-diag] exec completed → persisting threadId=${result.threadId}`);
    void verifyCodexThreadId(result.threadId);
  }
  args.sink.emit({
    provider: 'codex',
    status: 'completed',
    message: 'Response complete',
    timestamp: Date.now(),
    session: args.sessionRef,
    tokenUsage: args.getUsage(),
    durationMs: result.durationMs,
  });
}

export function handleLaunchError(error: unknown, args: CodexCompletionArgs): void {
  const errorMessage = buildFailureMessage(error);
  const wasCancelled = cancelledTasks.delete(args.taskId);
  cleanupLaunchArtifacts(args.taskId, args.invocationTempPaths);
  if (wasCancelled) {
    args.sink.emit({
      provider: 'codex',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: args.sessionRef,
    });
    return;
  }
  args.sink.emit({
    provider: 'codex',
    status: 'streaming',
    message: errorMessage,
    timestamp: Date.now(),
    session: args.sessionRef,
    contentBlock: {
      blockIndex: args.getNextBlockIndex(),
      blockType: 'text',
      textDelta: `\n\n---\n**Codex stopped** - ${errorMessage}`,
    },
  });
  args.sink.emit({
    provider: 'codex',
    status: 'failed',
    message: errorMessage,
    timestamp: Date.now(),
    session: args.sessionRef,
  });
}

async function scheduleCodexExecLaunch(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
}): Promise<{ durationMs: number; threadId: string | null } | null> {
  if (args.context.request.goalAttachments?.length) {
    try {
      const materialized = await materializeAttachments(args.context.request.goalAttachments);
      args.invocationTempPaths.push(...materialized.imagePaths);
    } catch (error) {
      log.error('failed to materialize attachments:', error);
    }
  }
  if (args.getCancelledBeforeLaunch()) {
    activeHandles.delete(args.context.taskId);
    return null;
  }
  const prompt = buildPrompt(args.context, args.model, Boolean(args.resumeThreadId));
  return spawnCodexProcess(
    args.context,
    {
      prompt,
      cwd: args.cwd,
      cliArgs: args.cliArgs,
      imagePaths: args.invocationTempPaths,
      eventHandler: args.eventHandler,
      resumeThreadId: args.resumeThreadId,
    },
    activeHandles as Map<string, CodexExecProcessHandle>,
  );
}

function scheduleCodexAppServerLaunch(args: {
  completionArgs: CodexCompletionArgs;
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  eventHandler: (event: CodexExecEvent) => void;
  execCliArgs: string[];
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
  model: string;
  resumeThreadId?: string;
  settings: ReturnType<typeof resolveCodexSettings>['settings'];
}): void {
  runCodexAppServerTurn({
    context: args.context,
    cwd: args.cwd,
    model: args.model,
    resumeThreadId: args.resumeThreadId,
    sessionRef: args.completionArgs.sessionRef,
    settings: args.settings,
    sink: args.completionArgs.sink,
  }).then(
    ({ handle, result }) => {
      if (args.getCancelledBeforeLaunch()) {
        handle.kill();
        handleLaunchSuccess(null, args.completionArgs);
        return;
      }
      activeHandles.set(args.context.taskId, handle);
      return result.then(
        (completed) => handleLaunchSuccess(completed, args.completionArgs),
        (error) => handleLaunchError(error, args.completionArgs),
      );
    },
    (error: unknown) => {
      if (buildFailureMessage(error).includes('runtime is unavailable')) {
        emitTransportWarning(
          args.completionArgs.sink,
          args.completionArgs.sessionRef,
          'Codex app-server runtime modules are not present yet; falling back to exec transport.',
        );
        scheduleExecLaunch({
          completionArgs: args.completionArgs,
          context: args.context,
          cwd: args.cwd,
          cliArgs: args.execCliArgs,
          model: args.model,
          resumeThreadId: args.resumeThreadId,
          invocationTempPaths: args.invocationTempPaths,
          getCancelledBeforeLaunch: args.getCancelledBeforeLaunch,
          eventHandler: args.eventHandler,
        });
        return;
      }
      handleLaunchError(error, args.completionArgs);
    },
  );
}

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
  const { handler: eventHandler, getNextBlockIndex, getUsage } = buildCodexEventComponents(sink, sessionRef);
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

function scheduleExecLaunch(args: {
  completionArgs: CodexCompletionArgs;
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
}): void {
  scheduleCodexExecLaunch({
    context: args.context,
    cwd: args.cwd,
    cliArgs: args.cliArgs,
    model: args.model,
    resumeThreadId: args.resumeThreadId,
    invocationTempPaths: args.invocationTempPaths,
    getCancelledBeforeLaunch: args.getCancelledBeforeLaunch,
    eventHandler: args.eventHandler,
  }).then(
    (result) => handleLaunchSuccess(result, args.completionArgs),
    (error) => handleLaunchError(error, args.completionArgs),
  );
}

function launchCodex(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeThreadId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const cwd = context.request.workspaceRoots[0];
  const { transport, warning } = getCodexTransportDecision(context);
  const {
    sessionRef,
    eventHandler,
    getNextBlockIndex,
    getUsage,
    placeholder,
    getCancelledBeforeLaunch,
  } = setupCodexLaunch(context, sink, requestId, resumeThreadId);
  activeHandles.set(context.taskId, placeholder);
  const launchResult = buildCodexLaunchResult(sessionRef, sink);
  emitTransportWarning(sink, launchResult.session, warning);
  const invocationTempPaths: string[] = [];
  const completionArgs = buildCodexCompletionArgs({
    context,
    sessionRef,
    sink,
    getUsage,
    getNextBlockIndex,
    invocationTempPaths,
  });
  const resolved = resolveCodexSettings(context, transport);
  if (transport === 'app-server') {
    scheduleCodexAppServerLaunch({
      completionArgs,
      context,
      cwd,
      eventHandler,
      execCliArgs: resolved.cliArgs,
      getCancelledBeforeLaunch,
      invocationTempPaths,
      model: resolved.model,
      resumeThreadId,
      settings: resolved.settings,
    });
    return launchResult;
  }
  scheduleExecLaunch({
    completionArgs,
    context,
    cwd,
    cliArgs: resolved.cliArgs,
    model: resolved.model,
    resumeThreadId,
    invocationTempPaths,
    getCancelledBeforeLaunch,
    eventHandler,
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
    if (resumeThreadId) log.info(`[codex-diag] submitTask resuming with threadId=${resumeThreadId}`);
    return launchCodex(context, sink, resumeThreadId);
  }

  async resumeTask(
    context: ProviderResumeContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const resumeThreadId =
      context.providerSession?.sessionId || context.request.resumeFromSessionId || undefined;
    if (resumeThreadId) log.info(`[codex-diag] resumeTask resuming with threadId=${resumeThreadId}`);
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
