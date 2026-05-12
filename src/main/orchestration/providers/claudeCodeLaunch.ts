// claudeCodeLaunch.ts — Launch coordination for the Claude Code adapter.

import type { TurnId } from '@shared/types/canonicalChatEvent';

import { getShadowTap } from '../../agentChat/shadowTap';
import { type ClaudeCliSettings, getConfigValue } from '../../config';

function wrapWithShadowTap(
  inner: (event: StreamJsonEvent) => void,
  turnId: TurnId,
): (event: StreamJsonEvent) => void {
  const tap = getShadowTap();
  if (!tap) return inner;
  return (event: StreamJsonEvent) => {
    inner(event);
    tap.onStreamJsonEvent(event, turnId);
  };
}
import { resolveModelEnv } from '../../providers';
import { getSessionStore } from '../../session/sessionStore';
import { buildEventHandler } from './claudeCodeEventHandler';
import { handleLaunchError, handleLaunchSuccess } from './claudeCodeHelpers';
import { buildLaunchInputs, runLaunch } from './claudeCodeLaunchInputs';
import {
  acquireCodeModeForLaunch,
  type CodeModeLaunchHandle,
  releaseCodeModeForLaunch,
} from './claudeCodeMode';
import { activeProcesses, buildPlaceholderHandle, type CompletionArgs } from './claudeCodeState';
import {
  createProviderArtifact,
  createProviderSessionReference,
  type ProviderLaunchContext,
  type ProviderLaunchResult,
  type ProviderProgressSink,
  type ProviderResumeContext,
} from './providerAdapter';
import type { StreamJsonEvent, StreamJsonResultEvent } from './streamJsonTypes';

export function pickLaunchValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) if (value) return value;
  return undefined;
}

/** Returns worktreePath when the task's session has an active worktree, else root. */
function resolveTaskCwd(root: string, sessionId: string | undefined): string {
  if (!sessionId) return root;
  try {
    const wt = getSessionStore()?.getById(sessionId);
    return wt?.worktree && wt.worktreePath ? wt.worktreePath : root;
  } catch {
    return root;
  }
}

export type ResolvedSettings = {
  resolvedModel: string | undefined;
  effort: string | undefined;
  effectiveSettings: ClaudeCliSettings;
  providerEnv: Record<string, string>;
  isProviderRouted: boolean;
};

export function resolveEffectiveSettings(
  context: ProviderLaunchContext | ProviderResumeContext,
  settings: ClaudeCliSettings,
): ResolvedSettings {
  const resolvedModel = pickLaunchValue(context.request.model, settings.model);
  const effort = pickLaunchValue(context.request.effort, settings.effort);
  const permissionMode =
    pickLaunchValue(context.request.permissionMode, settings.permissionMode) ?? 'default';
  const providerEnv =
    resolvedModel && resolvedModel.includes(':') ? resolveModelEnv(resolvedModel) : {};
  const isProviderRouted = Object.keys(providerEnv).length > 0;
  // Wave 26 Phase D: per-session/profile tool whitelist overrides the global setting.
  const allowedTools =
    context.request.allowedTools !== undefined
      ? context.request.allowedTools
      : settings.allowedTools;
  return {
    resolvedModel,
    effort,
    effectiveSettings: {
      ...settings,
      model: isProviderRouted ? '' : (resolvedModel ?? ''),
      permissionMode,
      allowedTools,
    },
    providerEnv,
    isProviderRouted,
  };
}

export interface ScheduleClaudeLaunchArgs {
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
}

interface ScheduleClaudeLaunchOutcome {
  result: StreamJsonResultEvent | null;
  error?: unknown;
  codemodeHandle: CodeModeLaunchHandle;
}

export function scheduleClaudeLaunch(
  args: ScheduleClaudeLaunchArgs,
): Promise<ScheduleClaudeLaunchOutcome> {
  return (async () => {
    // Wave 51 Phase C: acquire CodeMode BEFORE building the per-spawn MCP
    // config so the routing policy in scopedMcpConfig can downgrade to
    // direct-inject when the codemode acquire fails. The acquire helper is
    // best-effort and never throws — `ownsLifecycle:false` covers both "not
    // requested" and "requested but failed". We treat any non-ownership
    // outcome as a potential failure and let the routing policy decide
    // whether the downgrade applies (it only applies when the policy was
    // actually going to route through codemode).
    const codemodeHandle = await acquireCodeModeForLaunch(args.cwd);
    const acquireFailed = !codemodeHandle.ownsLifecycle && shouldHaveAcquired();
    const inputs = await buildLaunchInputs(args, { codemodeAcquireFailed: acquireFailed });
    if (!inputs) return { result: null, codemodeHandle };
    try {
      const result = await runLaunch(args, inputs);
      return { result, codemodeHandle };
    } catch (error) {
      // Capture for the caller; ensures codemodeHandle survives cleanup.
      return { result: null, error, codemodeHandle };
    }
  })();
}

/**
 * True when CodeMode launch wiring is enabled by config — used to distinguish
 * "didn't try to acquire" (not enabled) from "tried but failed".
 */
function shouldHaveAcquired(): boolean {
  const cfg = getConfigValue('codemode') as { enabled?: boolean } | undefined;
  return cfg?.enabled === true;
}

function setupLaunchSession(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  requestId: string,
) {
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
  return { sessionRef, eventHandler, getNextGlobalBlockIndex, getCumulativeUsage };
}

interface BuildLaunchScheduleArgsOpts {
  context: ProviderLaunchContext | ProviderResumeContext;
  cwd: string;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  resolved: ResolvedSettings;
  effectiveResumeSessionId: string | undefined;
  eventHandler: (event: StreamJsonEvent) => void;
  getCancelledBeforeLaunch: () => boolean;
  invocationTempPaths: string[];
}

function buildLaunchScheduleArgs(opts: BuildLaunchScheduleArgsOpts): ScheduleClaudeLaunchArgs {
  return {
    context: opts.context,
    cwd: opts.cwd,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    invocationTempPaths: opts.invocationTempPaths,
    resolvedModel: opts.resolved.resolvedModel,
    effectiveResumeSessionId: opts.effectiveResumeSessionId,
    effectiveSettings: opts.resolved.effectiveSettings,
    eventHandler: opts.eventHandler,
    effort: opts.resolved.effort,
    providerEnv: opts.resolved.providerEnv,
    isProviderRouted: opts.resolved.isProviderRouted,
    getCancelledBeforeLaunch: opts.getCancelledBeforeLaunch,
  };
}

function emitLaunchQueued(sink: ProviderProgressSink): void {
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Launching Claude Code session',
    timestamp: Date.now(),
  });
}

function buildLaunchResult(
  sessionRef: ReturnType<typeof createProviderSessionReference>,
): ProviderLaunchResult {
  return {
    session: sessionRef,
    artifact: createProviderArtifact({
      provider: 'claude-code',
      status: 'streaming',
      session: sessionRef,
      submittedAt: Date.now(),
    }),
  };
}

function emitLaunchStarted(
  sink: ProviderProgressSink,
  sessionRef: ReturnType<typeof createProviderSessionReference>,
): void {
  sink.emit({
    provider: 'claude-code',
    status: 'queued',
    message: 'Claude Code session started',
    timestamp: Date.now(),
    session: sessionRef,
  });
}

interface ScheduleLaunchOpts {
  context: ProviderLaunchContext | ProviderResumeContext;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  sink: ProviderProgressSink;
  cwd: string;
  resolved: ResolvedSettings;
  effectiveResumeSessionId: string | undefined;
  eventHandler: (event: StreamJsonEvent) => void;
  getCancelledBeforeLaunch: () => boolean;
  getNextGlobalBlockIndex: () => number;
  getCumulativeUsage: () => { inputTokens: number; outputTokens: number };
}

function scheduleLaunch(opts: ScheduleLaunchOpts): void {
  const invocationTempPaths: string[] = [];
  const completionArgs: CompletionArgs = {
    taskId: opts.context.taskId,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    invocationTempPaths,
    resolvedModel: opts.resolved.resolvedModel,
    getNextGlobalBlockIndex: opts.getNextGlobalBlockIndex,
    getCumulativeUsage: opts.getCumulativeUsage,
  };
  const turnId = opts.context.taskId as TurnId;
  const eventHandler = wrapWithShadowTap(opts.eventHandler, turnId);
  const launchArgs = buildLaunchScheduleArgs({
    context: opts.context,
    cwd: opts.cwd,
    sessionRef: opts.sessionRef,
    sink: opts.sink,
    resolved: opts.resolved,
    effectiveResumeSessionId: opts.effectiveResumeSessionId,
    eventHandler,
    getCancelledBeforeLaunch: opts.getCancelledBeforeLaunch,
    invocationTempPaths,
  });
  scheduleClaudeLaunch(launchArgs).then(
    (outcome) => {
      void releaseCodeModeForLaunch(outcome.codemodeHandle);
      handleLaunchSuccess(outcome.result, completionArgs);
    },
    (error) => {
      // codemode handle is unreachable on the rejection path — best-effort
      // cleanup happens in the next launch's `acquire` (which detects an
      // already-enabled state and recovers); intentionally not blocking here.
      handleLaunchError(error, completionArgs);
    },
  );
}

export function launchClaude(
  context: ProviderLaunchContext | ProviderResumeContext,
  sink: ProviderProgressSink,
  resumeSessionId?: string,
): ProviderLaunchResult {
  const requestId = `orchestration-${context.attemptId}`;
  const settings = getConfigValue('claudeCliSettings') as ClaudeCliSettings;
  const cwd = resolveTaskCwd(context.request.workspaceRoots[0], context.request.sessionId);
  const resolved = resolveEffectiveSettings(context, settings);
  const effectiveResumeSessionId =
    resumeSessionId || context.request.resumeFromSessionId || undefined;
  emitLaunchQueued(sink);
  const { sessionRef, eventHandler, getNextGlobalBlockIndex, getCumulativeUsage } =
    setupLaunchSession(context, sink, requestId);
  const { placeholder, getCancelledBeforeLaunch } = buildPlaceholderHandle(context.taskId);
  activeProcesses.set(context.taskId, placeholder);
  scheduleLaunch({
    context,
    sessionRef,
    sink,
    cwd,
    resolved,
    effectiveResumeSessionId,
    eventHandler,
    getCancelledBeforeLaunch,
    getNextGlobalBlockIndex,
    getCumulativeUsage,
  });
  emitLaunchStarted(sink, sessionRef);
  return buildLaunchResult(sessionRef);
}
