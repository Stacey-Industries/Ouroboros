/**
 * codexAdapterLaunchSupport.ts — Launch orchestration helpers for CodexAdapter.
 *
 * Extracted from codexAdapter.ts to keep that file under the 300-line limit.
 * Owns the shared activeHandles / cancelledTasks state plus all scheduler
 * functions for the two Codex transports (exec and app-server).
 */

import log from '../../logger';
import {
  buildFailureMessage,
  cleanupTempFiles,
  materializeAttachments,
  resolveCodexSettings,
  shouldRetryCodexWithoutResume,
} from './codexAdapterHelpers';
import { runCodexAppServerTurn } from './codexAppServerRunner';
import { buildPrompt } from './codexContextBuilder';
import type { CodexExecEvent } from './codexExecRunner';
import { type CodexExecProcessHandle } from './codexExecRunner';
import { type CodexCompletionArgs, spawnCodexProcess } from './codexLaunch';
import { verifyCodexThreadId } from './codexThreadDiag';
import type {
  ProviderLaunchContext,
  ProviderLaunchResult,
  ProviderProgressSink,
  ProviderResumeContext,
} from './providerAdapter';

export interface ActiveCodexHandle {
  kill: () => void;
  readonly threadId: string | null;
}

export const activeHandles = new Map<string, ActiveCodexHandle>();
export const cancelledTasks = new Set<string>();

function cleanupLaunchArtifacts(taskId: string, invocationTempPaths: string[]): void {
  activeHandles.delete(taskId);
  void cleanupTempFiles(invocationTempPaths);
}

export function emitTransportWarning(
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

interface ExecLaunchArgs {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
}

async function prepareExecAttachments(args: ExecLaunchArgs): Promise<void> {
  if (!args.context.request.goalAttachments?.length) return;
  try {
    const materialized = await materializeAttachments(args.context.request.goalAttachments);
    args.invocationTempPaths.push(...materialized.imagePaths);
  } catch (error) {
    log.error('failed to materialize attachments:', error);
  }
}

async function spawnExecWithResumeFallback(
  args: ExecLaunchArgs,
): Promise<{ durationMs: number; threadId: string | null } | null> {
  const prompt = buildPrompt(args.context, args.model, Boolean(args.resumeThreadId));
  try {
    return await spawnCodexProcess(
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
  } catch (error) {
    if (!args.resumeThreadId || !shouldRetryCodexWithoutResume(error)) throw error;
    args.eventHandler({
      type: 'item.completed',
      item: {
        id: `resume-fallback-${args.context.taskId}`,
        type: 'agent_message',
        text: 'Stored Codex thread could not be resumed. Retrying as a new turn in this chat.',
      },
    });
    return spawnCodexProcess(
      args.context,
      {
        prompt: buildPrompt(args.context, args.model, false),
        cwd: args.cwd,
        cliArgs: args.cliArgs,
        imagePaths: args.invocationTempPaths,
        eventHandler: args.eventHandler,
      },
      activeHandles as Map<string, CodexExecProcessHandle>,
    );
  }
}

async function scheduleCodexExecLaunch(
  args: ExecLaunchArgs,
): Promise<{ durationMs: number; threadId: string | null } | null> {
  await prepareExecAttachments(args);
  if (args.getCancelledBeforeLaunch()) {
    activeHandles.delete(args.context.taskId);
    return null;
  }
  return spawnExecWithResumeFallback(args);
}

export interface ExecLaunchInvocation {
  completionArgs: CodexCompletionArgs;
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  cliArgs: string[];
  model: string;
  resumeThreadId?: string;
  invocationTempPaths: string[];
  getCancelledBeforeLaunch: () => boolean;
  eventHandler: (event: CodexExecEvent) => void;
}

export function scheduleExecLaunch(args: ExecLaunchInvocation): void {
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

export interface AppServerLaunchInvocation {
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
}

function handleAppServerStartupFailure(error: unknown, args: AppServerLaunchInvocation): void {
  if (!buildFailureMessage(error).includes('runtime is unavailable')) {
    handleLaunchError(error, args.completionArgs);
    return;
  }
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
}

export function scheduleCodexAppServerLaunch(args: AppServerLaunchInvocation): void {
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
    (error: unknown) => handleAppServerStartupFailure(error, args),
  );
}
