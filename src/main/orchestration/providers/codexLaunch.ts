/**
 * codexLaunch.ts — Launch coordination helpers for the Codex adapter.
 *
 * Extracted from codexAdapter.ts to keep each file under 300 lines.
 * Contains the placeholder handle builder and session launch orchestration.
 */

import { buildCodexEventHandler } from './codexEventHandler';
import { type CodexExecProcessHandle, spawnCodexExecProcess } from './codexExecRunner';
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';

export interface CodexCompletionArgs {
  taskId: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
  getNextBlockIndex: () => number;
  invocationTempPaths: string[];
}

export function buildCodexEventComponents(
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
) {
  return buildCodexEventHandler(sink, sessionRef);
}

export function buildCodexPlaceholderHandle(
  context: ProviderLaunchContext | ProviderResumeContext,
  activeProcesses: Map<string, CodexExecProcessHandle>,
): { placeholder: CodexExecProcessHandle; getCancelledBeforeLaunch: () => boolean } {
  let cancelledBeforeLaunch = false;
  const placeholder: CodexExecProcessHandle = {
    result: null as unknown as Promise<{ threadId: string | null; durationMs: number }>,
    kill: () => {
      const realHandle = activeProcesses.get(context.taskId);
      if (realHandle && realHandle !== placeholder) {
        realHandle.kill();
        return;
      }
      cancelledBeforeLaunch = true;
    },
    threadId: null,
  };
  return { placeholder, getCancelledBeforeLaunch: () => cancelledBeforeLaunch };
}

export function buildCodexSessionRef(
  context: ProviderLaunchContext | ProviderResumeContext,
  requestId: string,
  resumeThreadId: string | undefined,
): ReturnType<typeof createProviderSessionReference> {
  return createProviderSessionReference('codex', {
    requestId,
    sessionId:
      resumeThreadId ||
      ('providerSession' in context ? context.providerSession?.sessionId : undefined),
    externalTaskId: context.taskId,
  });
}

export function buildCodexLaunchResult(
  sessionRef: ReturnType<typeof createProviderSessionReference>,
  sink: ProviderProgressSink,
): ProviderLaunchResult {
  sink.emit({
    provider: 'codex',
    status: 'queued',
    message: 'Codex session started',
    timestamp: Date.now(),
    session: sessionRef,
  });
  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'codex',
      status: 'streaming',
      session: sessionRef,
      submittedAt: Date.now(),
    }),
  };
}

export interface BuildCodexCompletionArgsOptions {
  context: ProviderLaunchContext | ProviderResumeContext;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  getUsage: () => { inputTokens: number; outputTokens: number } | undefined;
  getNextBlockIndex: () => number;
  invocationTempPaths: string[];
}

export function buildCodexCompletionArgs(
  opts: BuildCodexCompletionArgsOptions,
): CodexCompletionArgs {
  return {
    taskId: opts.context.taskId,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    getUsage: opts.getUsage,
    getNextBlockIndex: opts.getNextBlockIndex,
    invocationTempPaths: opts.invocationTempPaths,
  };
}

export function spawnCodexProcess(
  context: ProviderLaunchContext | ProviderResumeContext,
  args: {
    prompt: string;
    cwd: string;
    cliArgs: string[];
    imagePaths: string[];
    eventHandler: Parameters<typeof spawnCodexExecProcess>[0]['onEvent'];
    resumeThreadId?: string;
  },
  activeProcesses: Map<string, CodexExecProcessHandle>,
): Promise<{ threadId: string | null; durationMs: number }> {
  const handle = spawnCodexExecProcess({
    prompt: args.prompt,
    cwd: args.cwd,
    cliArgs: args.cliArgs,
    imagePaths: args.imagePaths,
    onEvent: args.eventHandler,
    resumeThreadId: args.resumeThreadId,
  });
  activeProcesses.set(context.taskId, handle);
  return handle.result;
}
