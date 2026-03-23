import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import type { ImageAttachment } from '../../agentChat/types';
import { type ClaudeCliSettings, getConfigValue } from '../../config';
import log from '../../logger';
import { resolveModelEnv } from '../../providers';
import { killPty } from '../../pty';
import type { AgentBridgeHandle } from '../../ptyAgentBridge';
import type { ContextPacket, ProviderCapabilities } from '../types';
import { buildInitialPrompt } from './claudeCodeContextBuilder';
import { buildEventHandler } from './claudeCodeEventHandler';
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner';
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderAdapter,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';
import type {
  StreamJsonEvent,
  StreamJsonProcessHandle,
  StreamJsonResultEvent,
} from './streamJsonTypes';

const activeProcesses = new Map<string, StreamJsonProcessHandle>();
const cancelledTasks = new Set<string>();

interface ActiveAgentPtyEntry {
  ptySessionId: string;
  bridge: AgentBridgeHandle;
  result: Promise<StreamJsonResultEvent | null>;
}

const activeAgentPtySessions = new Map<string, ActiveAgentPtyEntry>();

function createCapabilities(): ProviderCapabilities {
  return {
    provider: 'claude-code',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  };
}

async function materializeAttachments(
  attachments: ImageAttachment[],
): Promise<{ goalSuffix: string; tempPaths: string[] }> {
  const tempPaths: string[] = [];
  const lines: string[] = [];
  for (const att of attachments) {
    const ext = att.mimeType.split('/')[1] ?? 'png';
    const tempPath = `${tmpdir()}/${randomUUID()}.${ext}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
    await writeFile(tempPath, Buffer.from(att.base64Data, 'base64'));
    tempPaths.push(tempPath);
    lines.push(`[Attached image: ${tempPath}]`);
  }
  return { goalSuffix: lines.length ? `\n\n${lines.join('\n')}` : '', tempPaths };
}

async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const p of tempPaths) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
      await unlink(p);
    } catch {
      // Ignore cleanup errors; the OS will reclaim temp files eventually.
    }
  }
}

function buildStopReasonMessage(result: StreamJsonResultEvent): string | null {
  if (result.is_error || result.subtype === 'error') {
    const detail = result.result ? `\`\`\`\n${result.result.slice(0, 500)}\n\`\`\`` : '';
    return `**Agent stopped** — Claude Code reported an error${detail ? `\n${detail}` : ''}`;
  }
  if (result.stop_reason === 'max_tokens')
    return '**Agent stopped** — hit output token limit (stop_reason: max_tokens)';
  if (result.stop_reason && result.stop_reason !== 'end_turn')
    return `**Agent stopped** — unexpected stop_reason: \`${result.stop_reason}\``;
  return null;
}

function buildStopDiagnostic(result: StreamJsonResultEvent | null): string | null {
  if (!result)
    return '\n\n---\n**Agent stopped** — no result event received from Claude Code process.';
  const message = buildStopReasonMessage(result);
  return message ? `\n\n---\n${message}` : null;
}

function launchHeadless(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  prompt: string;
  cwd: string;
  settings: ClaudeCliSettings;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resumeSessionId?: string;
  continueSession?: boolean;
  effort?: string;
  providerEnv?: Record<string, string>;
  eventHandler?: (event: StreamJsonEvent) => void;
}): { result: Promise<StreamJsonResultEvent> } {
  const handler = args.eventHandler ?? buildEventHandler(args.sink, args.sessionRef).handler;
  const handle = spawnStreamJsonProcess({
    prompt: args.prompt,
    cwd: args.cwd,
    model: args.settings.model || undefined,
    permissionMode:
      args.settings.permissionMode !== 'default' ? args.settings.permissionMode : undefined,
    dangerouslySkipPermissions: args.settings.dangerouslySkipPermissions || undefined,
    resumeSessionId: args.resumeSessionId || undefined,
    continueSession: args.continueSession || undefined,
    effort: args.effort || undefined,
    env: args.providerEnv,
    onEvent: handler,
  });
  activeProcesses.set(args.context.taskId, handle);
  return { result: handle.result };
}

interface CompletionArgs {
  taskId: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  invocationTempPaths: string[];
  resolvedModel: string | undefined;
  getNextGlobalBlockIndex: () => number;
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number };
}

function cleanupLaunchArtifacts(args: CompletionArgs): void {
  activeProcesses.delete(args.taskId);
  activeAgentPtySessions.delete(args.taskId);
  void cleanupTempFiles(args.invocationTempPaths);
}

function pickLaunchValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) if (value) return value;
  return undefined;
}

function resolveEffectiveSettings(
  context: ProviderLaunchContext | ProviderResumeContext,
  settings: ClaudeCliSettings,
): {
  resolvedModel: string | undefined;
  effort: string | undefined;
  effectiveSettings: ClaudeCliSettings;
  providerEnv: Record<string, string>;
  isProviderRouted: boolean;
} {
  const resolvedModel = pickLaunchValue(context.request.model, settings.model);
  const effort = pickLaunchValue(context.request.effort, settings.effort);
  const permissionMode =
    pickLaunchValue(context.request.permissionMode, settings.permissionMode) ?? 'default';
  const providerEnv =
    resolvedModel && resolvedModel.includes(':') ? resolveModelEnv(resolvedModel) : {};
  const isProviderRouted = Object.keys(providerEnv).length > 0;
  return {
    resolvedModel,
    effort,
    effectiveSettings: {
      ...settings,
      model: isProviderRouted ? '' : (resolvedModel ?? ''),
      permissionMode,
    },
    providerEnv,
    isProviderRouted,
  };
}

function buildPlaceholderHandle(taskId: string): {
  placeholder: StreamJsonProcessHandle;
  getCancelledBeforeLaunch: () => boolean;
} {
  let cancelledBeforeLaunch = false;
  const placeholder: StreamJsonProcessHandle = {
    result: null as unknown as Promise<StreamJsonResultEvent>,
    kill: () => {
      const realHandle = activeProcesses.get(taskId);
      if (realHandle && realHandle !== placeholder) {
        realHandle.kill();
        return;
      }
      cancelledBeforeLaunch = true;
    },
    pid: undefined,
    sessionId: null,
  };
  return { placeholder, getCancelledBeforeLaunch: () => cancelledBeforeLaunch };
}

function resolveTokenUsage(
  result: StreamJsonResultEvent | null,
  tracked: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } | undefined {
  if (tracked.inputTokens > 0 || tracked.outputTokens > 0) return tracked;
  const usage = result?.usage as Record<string, number | undefined> | undefined;
  return usage
    ? {
        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens ?? 0,
      }
    : undefined;
}

function handleLaunchSuccess(result: StreamJsonResultEvent | null, args: CompletionArgs): void {
  cleanupLaunchArtifacts(args);
  const tokenUsage = resolveTokenUsage(result, args.getCumulativeUsage());
  const diagnostic = buildStopDiagnostic(result);
  if (diagnostic) {
    log.warn('stop diagnostic:', diagnostic);
    args.sink.emit({
      provider: 'claude-code',
      status: 'streaming',
      message: diagnostic,
      timestamp: Date.now(),
      session: args.sessionRef,
      contentBlock: {
        blockIndex: args.getNextGlobalBlockIndex(),
        blockType: 'text',
        textDelta: diagnostic,
      },
    });
  }
  args.sink.emit({
    provider: 'claude-code',
    status: 'completed',
    message: diagnostic ?? 'Response complete',
    timestamp: Date.now(),
    session: args.sessionRef,
    tokenUsage,
    costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : undefined,
    durationMs: typeof result?.duration_ms === 'number' ? result.duration_ms : undefined,
  });
}

function handleLaunchError(error: unknown, args: CompletionArgs): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const wasCancelled = cancelledTasks.delete(args.taskId);
  cleanupLaunchArtifacts(args);
  if (wasCancelled) {
    log.info('process stopped by user');
    args.sink.emit({
      provider: 'claude-code',
      status: 'cancelled',
      message: 'Task cancelled by user',
      timestamp: Date.now(),
      session: args.sessionRef,
    });
    return;
  }
  log.error('process failed:', errorMsg);
  if (error instanceof Error && error.stack) log.error('stack:', error.stack);
  const errorDiagnostic = `\n\n---\n**Agent stopped** — process error: ${errorMsg}`;
  args.sink.emit({
    provider: 'claude-code',
    status: 'streaming',
    message: errorDiagnostic,
    timestamp: Date.now(),
    session: args.sessionRef,
    contentBlock: {
      blockIndex: args.getNextGlobalBlockIndex(),
      blockType: 'text',
      textDelta: errorDiagnostic,
    },
  });
  args.sink.emit({
    provider: 'claude-code',
    status: 'failed',
    message: errorMsg,
    timestamp: Date.now(),
    session: args.sessionRef,
  });
}

function scheduleClaudeLaunch(args: {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resolvedModel: string | undefined;
  effectiveResumeSessionId: string | undefined;
  effectiveSettings: ClaudeCliSettings;
  eventHandler: (event: StreamJsonEvent) => void;
  effort: string | undefined;
  providerEnv: Record<string, string>;
  isProviderRouted: boolean;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
}): Promise<StreamJsonResultEvent | null> {
  return (async () => {
    let goalSuffix = '';
    if (args.context.request.goalAttachments?.length) {
      try {
        const materialized = await materializeAttachments(args.context.request.goalAttachments);
        goalSuffix = materialized.goalSuffix;
        args.invocationTempPaths.push(...materialized.tempPaths);
      } catch (err) {
        log.error('failed to materialize attachments — images will be omitted:', err);
      }
    }
    if (args.getCancelledBeforeLaunch()) {
      activeProcesses.delete(args.context.taskId);
      return null;
    }
    return launchHeadless({
      context: args.context,
      prompt: buildInitialPrompt(
        args.context,
        goalSuffix,
        Boolean(args.effectiveResumeSessionId),
        args.resolvedModel ?? '',
      ),
      cwd: args.cwd,
      settings: args.effectiveSettings,
      sessionRef: args.sessionRef,
      sink: args.sink,
      resumeSessionId: args.effectiveResumeSessionId,
      continueSession:
        'providerSession' in args.context && !args.effectiveResumeSessionId ? true : undefined,
      effort: args.effort,
      providerEnv: args.isProviderRouted ? args.providerEnv : undefined,
      eventHandler: args.eventHandler,
    }).result;
  })();
}

function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings;
  const cwd = context.request.workspaceRoots[0];
  const { resolvedModel, effort, effectiveSettings, providerEnv, isProviderRouted } =
    resolveEffectiveSettings(context, settings);
  const effectiveResumeSessionId =
    resumeSessionId || context.request.resumeFromSessionId || undefined;
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  });
  const sessionRef = createProviderSessionReference('claude-code', {
    requestId,
    sessionId: 'providerSession' in context ? context.providerSession?.sessionId : undefined,
    externalTaskId: context.taskId,
  });
  const {
    handler: eventHandler,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  } = buildEventHandler(sink, sessionRef);
  const { placeholder, getCancelledBeforeLaunch } = buildPlaceholderHandle(context.taskId);
  activeProcesses.set(context.taskId, placeholder);
  const invocationTempPaths: string[] = [];
  const completionArgs: CompletionArgs = {
    taskId: context.taskId,
    sessionRef,
    sink,
    invocationTempPaths,
    resolvedModel,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  };
  scheduleClaudeLaunch({
    context,
    cwd,
    sessionRef,
    sink,
    resolvedModel,
    effectiveResumeSessionId,
    effectiveSettings,
    eventHandler,
    effort,
    providerEnv,
    isProviderRouted,
    getCancelledBeforeLaunch,
    invocationTempPaths,
  }).then(
    (result) => handleLaunchSuccess(result, completionArgs),
    (error) => handleLaunchError(error, completionArgs),
  );
  const submittedAt = Date.now();
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Claude Code session started',
    timestamp: submittedAt,
    session: sessionRef,
  });
  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'claude-code',
      status: 'streaming',
      session: sessionRef,
      submittedAt,
    }),
  };
}

function cancelPtySession(targetId: string): boolean {
  const agentPty = activeAgentPtySessions.get(targetId);
  if (agentPty) {
    agentPty.bridge.dispose();
    killPty(agentPty.ptySessionId);
    activeAgentPtySessions.delete(targetId);
    return true;
  }
  for (const [key, entry] of activeAgentPtySessions) {
    if (entry.ptySessionId === targetId || key === targetId) {
      entry.bridge.dispose();
      killPty(entry.ptySessionId);
      activeAgentPtySessions.delete(key);
      return true;
    }
  }
  return false;
}

function cancelHeadlessProcess(targetId: string): boolean {
  const handle = activeProcesses.get(targetId);
  if (handle) {
    cancelledTasks.add(targetId);
    handle.kill();
    activeProcesses.delete(targetId);
    return true;
  }
  for (const [key, proc] of activeProcesses) {
    if (proc.sessionId === targetId || key === targetId) {
      cancelledTasks.add(key);
      proc.kill();
      activeProcesses.delete(key);
      return true;
    }
  }
  return false;
}

export class ClaudeCodeAdapter implements ProviderAdapter {
  readonly provider = 'claude-code' as const;

  getCapabilities(): ProviderCapabilities {
    return createCapabilities();
  }

  async submitTask(
    context: ProviderLaunchContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    return launchClaude(context, sink);
  }

  async resumeTask(
    context: ProviderResumeContext,
    sink: ProviderProgressSink,
  ): Promise<ProviderLaunchResult> {
    const hasSessionId = !!context.providerSession?.sessionId;
    return launchClaude(
      context,
      sink,
      hasSessionId ? context.providerSession!.sessionId : undefined,
    );
  }

  async cancelTask(session: {
    requestId?: string;
    sessionId?: string;
    externalTaskId?: string;
  }): Promise<void> {
    const targetId = session.externalTaskId ?? session.requestId ?? session.sessionId;
    if (!targetId) return;
    if (cancelPtySession(targetId)) return;
    cancelHeadlessProcess(targetId);
  }
}

export function createClaudeCodeAdapter(): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter();
}

export type { ContextPacket };
export { path };
