import log from '../../logger';
import type { ProviderCapabilities } from '../types';
import {
  buildFailureMessage,
  cleanupTempFiles,
  createCodexCapabilities,
  materializeAttachments,
  resolveCodexSettings,
} from './codexAdapterHelpers';
import { buildPrompt } from './codexContextBuilder';
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

const activeProcesses = new Map<string, CodexExecProcessHandle>();
const cancelledTasks = new Set<string>();


function cleanupLaunchArtifacts(taskId: string, invocationTempPaths: string[]): void {
  activeProcesses.delete(taskId);
  void cleanupTempFiles(invocationTempPaths);
}

export function handleLaunchSuccess(
  result: { threadId: string | null; durationMs: number } | null,
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

async function scheduleCodexLaunch(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
}): Promise<{ threadId: string | null; durationMs: number } | null> {
  if (args.context.request.goalAttachments?.length) {
    try {
      const materialized = await materializeAttachments(args.context.request.goalAttachments);
      args.invocationTempPaths.push(...materialized.imagePaths);
    } catch (error) {
      log.error('failed to materialize attachments:', error);
    }
  }
  if (args.getCancelledBeforeLaunch()) {
    activeProcesses.delete(args.context.taskId);
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
    activeProcesses,
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
  const {
    handler: eventHandler,
    getNextBlockIndex,
    getUsage,
  } = buildCodexEventComponents(sink, sessionRef);
  const { placeholder, getCancelledBeforeLaunch } = buildCodexPlaceholderHandle(
    context,
    activeProcesses,
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

interface CodexLaunchScheduleArgs {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId: string | undefined;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
  completionArgs: CodexCompletionArgs;
}

function scheduleLaunchAndNotify(args: CodexLaunchScheduleArgs): void {
  const { completionArgs } = args;
  scheduleCodexLaunch({
    context: args.context,
    cwd: args.cwd,
    cliArgs: args.cliArgs,
    model: args.model,
    resumeThreadId: args.resumeThreadId,
    invocationTempPaths: args.invocationTempPaths,
    getCancelledBeforeLaunch: args.getCancelledBeforeLaunch,
    eventHandler: args.eventHandler,
  }).then(
    (result) => handleLaunchSuccess(result, completionArgs),
    (error) => handleLaunchError(error, completionArgs),
  );
}

function launchCodex(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeThreadId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const cwd = context.request.workspaceRoots[0];
  const { cliArgs, model } = resolveCodexSettings(context);
  const {
    sessionRef,
    eventHandler,
    getNextBlockIndex,
    getUsage,
    placeholder,
    getCancelledBeforeLaunch,
  } = setupCodexLaunch(context, sink, requestId, resumeThreadId);
  activeProcesses.set(context.taskId, placeholder);
  const invocationTempPaths: string[] = [];
  const completionArgs = buildCodexCompletionArgs({
    context,
    sessionRef,
    sink,
    getUsage,
    getNextBlockIndex,
    invocationTempPaths,
  });
  scheduleLaunchAndNotify({
    context,
    cwd,
    cliArgs,
    model,
    resumeThreadId,
    invocationTempPaths,
    getCancelledBeforeLaunch,
    eventHandler,
    completionArgs,
  });
  return buildCodexLaunchResult(sessionRef, sink);
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
    const handle = activeProcesses.get(targetId);
    if (handle) {
      cancelledTasks.add(targetId);
      handle.kill();
      activeProcesses.delete(targetId);
      return;
    }
    for (const [taskId, proc] of activeProcesses) {
      if (proc.threadId === targetId || taskId === targetId) {
        cancelledTasks.add(taskId);
        proc.kill();
        activeProcesses.delete(taskId);
        return;
      }
    }
  }
}

export function createCodexAdapter(): CodexAdapter {
  return new CodexAdapter();
}
