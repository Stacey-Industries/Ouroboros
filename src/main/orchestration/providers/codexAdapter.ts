import { readFile, readdir } from 'fs/promises';
import os from 'os';
import path from 'path';

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
import { type CodexEvent } from './codexEventHandler';
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

// ---------------------------------------------------------------------------
// Diagnostic: cross-check captured thread_id against Codex session file
// ---------------------------------------------------------------------------

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

async function verifyCodexThreadId(capturedThreadId: string): Promise<void> {
  try {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const dir = path.join(os.homedir(), '.codex', 'sessions', yyyy, mm, dd);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir() + fixed suffix
    const entries = await readdir(dir);
    const latest = entries
      .filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))
      .sort()
      .pop();
    if (!latest) return;
    const filenameUuid = UUID_RE.exec(latest)?.[1] ?? null;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir() + fixed suffix
    const raw = await readFile(path.join(dir, latest), 'utf-8');
    const firstLine = raw.slice(0, raw.indexOf('\n'));
    const meta = JSON.parse(firstLine) as { payload?: { id?: string } };
    const payloadId = meta.payload?.id ?? null;
    log.info('[codex-diag] THREAD ID COMPARISON:');
    log.info(`[codex-diag]   stream thread_id:         ${capturedThreadId}`);
    log.info(`[codex-diag]   session_meta.payload.id:  ${payloadId ?? 'N/A'}`);
    log.info(`[codex-diag]   rollout filename UUID:    ${filenameUuid ?? 'N/A'}`);
    log.info(`[codex-diag]   match stream↔payload:     ${capturedThreadId === payloadId}`);
    log.info(`[codex-diag]   match stream↔filename:    ${capturedThreadId === filenameUuid}`);
  } catch {
    log.info('[codex-diag] session file cross-check skipped (no session files found)');
  }
}

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
  eventHandler: (event: CodexEvent) => void;
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
  eventHandler: (event: CodexEvent) => void;
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
