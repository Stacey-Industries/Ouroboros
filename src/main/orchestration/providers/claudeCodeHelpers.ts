/**
 * claudeCodeHelpers.ts — Process helpers for the Claude Code adapter.
 *
 * Extracted from claudeCodeAdapter.ts to keep each file under 300 lines.
 * Sits between claudeCodeState.ts and claudeCodeLaunch.ts in the import chain.
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

import type { ImageAttachment } from '../../agentChat/types';
import type { ClaudeCliSettings } from '../../config';
import log from '../../logger';
import { firePostSpawnRestore } from '../../rulesAndSkills/postSpawnRestore';
import { buildEventHandler } from './claudeCodeEventHandler';
import {
  activeAgentPtySessions,
  activeProcesses,
  cancelledTasks,
  type CompletionArgs,
} from './claudeCodeState';
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner';
import { getOrCreateWarm, sendWarmTurn } from './claudeWarmProcessManager';
import { createProviderSessionReference, type ProviderProgressSink } from './providerAdapter';
import type { StreamJsonEvent, StreamJsonResultEvent } from './streamJsonTypes';

export async function materializeAttachments(
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

export async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const p of tempPaths) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
      await unlink(p);
    } catch {
      // Ignore cleanup errors; the OS will reclaim temp files eventually.
    }
  }
}

export function cliSessionExists(cwd: string, sessionId: string): boolean {
  const projectKey = cwd.replace(/[:\\/\s]/g, '-');
  const sessionPath = join(homedir(), '.claude', 'projects', projectKey, `${sessionId}.jsonl`);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from cwd + UUID, not user input
  return existsSync(sessionPath);
}

function formatErrorDetail(result: StreamJsonResultEvent): string {
  const detail = result.errors?.join('; ') || result.result || '';
  return detail ? `\n\`\`\`\n${detail.slice(0, 500)}\n\`\`\`` : '';
}

function buildStopReasonMessage(result: StreamJsonResultEvent): string | null {
  const isError =
    result.is_error || result.subtype === 'error' || result.subtype === 'error_during_execution';
  if (isError)
    return `**Agent stopped** — Claude Code reported an error${formatErrorDetail(result)}`;
  if (result.stop_reason === 'max_tokens')
    return '**Agent stopped** — hit output token limit (stop_reason: max_tokens)';
  if (result.stop_reason && result.stop_reason !== 'end_turn')
    return `**Agent stopped** — unexpected stop_reason: \`${result.stop_reason}\``;
  return null;
}

export function buildStopDiagnostic(result: StreamJsonResultEvent | null): string | null {
  if (!result)
    return '\n\n---\n**Agent stopped** — no result event received from Claude Code process.';
  const message = buildStopReasonMessage(result);
  return message ? `\n\n---\n${message}` : null;
}

function pickCoreSettingFlags(s: ClaudeCliSettings): {
  model: string | undefined;
  permissionMode: string | undefined;
  dangerouslySkipPermissions: boolean | undefined;
  allowedTools: string | undefined;
  disallowedTools: string | undefined;
} {
  return {
    model: s.model || undefined,
    permissionMode: s.permissionMode !== 'default' ? s.permissionMode : undefined,
    dangerouslySkipPermissions: s.dangerouslySkipPermissions || undefined,
    allowedTools: s.allowedTools || undefined,
    disallowedTools: s.disallowedTools || undefined,
  };
}

function pickExtendedSettingFlags(s: ClaudeCliSettings): {
  appendSystemPrompt: string | undefined;
  addDirs: string[] | undefined;
  maxBudgetUsd: number | undefined;
} {
  const budget = s.maxBudgetUsd;
  return {
    appendSystemPrompt: s.appendSystemPrompt || undefined,
    addDirs: s.addDirs?.length ? s.addDirs : undefined,
    maxBudgetUsd: typeof budget === 'number' && budget > 0 ? budget : undefined,
  };
}

function pickSettingOverrides(settings: ClaudeCliSettings) {
  return { ...pickCoreSettingFlags(settings), ...pickExtendedSettingFlags(settings) };
}

// Warm-process routing key: taskId is stable across turns of the same chat
// thread (assigned once at thread creation by the chat orchestration layer).
// A follow-up can rename the key if the upstream ID model changes.

/**
 * Wraps onEvent to fire a one-shot post-spawn restore on the first
 * `system { subtype: 'init' }` event — the canonical signal that Claude Code
 * has finished constructing its system prompt (rules are now in memory).
 * The boolean guard prevents double-firing on subsequent system events.
 */
function wrapEventWithRestore(
  onEvent: (event: StreamJsonEvent) => void,
  projectRoot: string | undefined,
): (event: StreamJsonEvent) => void {
  let fired = false;
  return (event: StreamJsonEvent) => {
    onEvent(event);
    if (!fired && event.type === 'system' && 'subtype' in event && event.subtype === 'init') {
      fired = true;
      void firePostSpawnRestore(projectRoot);
    }
  };
}

function launchWarm(args: {
  context: { taskId: string };
  prompt: string;
  cwd: string;
  settings: ClaudeCliSettings;
  sink: ProviderProgressSink;
  sessionRef: ReturnType<typeof createProviderSessionReference>;
  providerEnv?: Record<string, string>;
  effort?: string;
  eventHandler?: (event: StreamJsonEvent) => void;
  projectRoot?: string;
}): { result: Promise<StreamJsonResultEvent> } {
  const key = args.context.taskId;
  const spawnOpts = {
    cwd: args.cwd,
    ...pickSettingOverrides(args.settings),
    effort: args.effort || undefined,
    env: { ...args.providerEnv, OUROBOROS_CHAT_SESSION: '1' },
  };
  const handler = args.eventHandler ?? buildEventHandler(args.sink, args.sessionRef).handler;
  getOrCreateWarm(key, spawnOpts);
  log.info(`[warm:${key}] routing turn via warm process`);
  // Warm process already has rules in its system prompt from boot. Fire restore
  // immediately after the turn message is written (before awaiting the result).
  const result = sendWarmTurn(key, args.prompt, handler);
  void firePostSpawnRestore(args.projectRoot);
  return { result };
}

export function launchHeadless(args: {
  context: { taskId: string };
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
  mcpConfigPath?: string;
  /** Wave 62 — project root for post-spawn rules restore. */
  projectRoot?: string;
}): { result: Promise<StreamJsonResultEvent> } {
  if (args.settings.useWarmProcess && !args.resumeSessionId && !args.continueSession) {
    return launchWarm(args);
  }
  const baseHandler = args.eventHandler ?? buildEventHandler(args.sink, args.sessionRef).handler;
  const handler = wrapEventWithRestore(baseHandler, args.projectRoot);
  const handle = spawnStreamJsonProcess({
    prompt: args.prompt,
    cwd: args.cwd,
    ...pickSettingOverrides(args.settings),
    resumeSessionId: args.resumeSessionId || undefined,
    continueSession: args.continueSession || undefined,
    effort: args.effort || undefined,
    env: { ...args.providerEnv, OUROBOROS_CHAT_SESSION: '1' },
    onEvent: handler,
    mcpConfigPath: args.mcpConfigPath,
  });
  activeProcesses.set(args.context.taskId, handle);
  return { result: handle.result };
}

export function cleanupLaunchArtifacts(args: CompletionArgs): void {
  activeProcesses.delete(args.taskId);
  activeAgentPtySessions.delete(args.taskId);
  void cleanupTempFiles(args.invocationTempPaths);
}

export function resolveTokenUsage(
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

export function handleLaunchSuccess(
  result: StreamJsonResultEvent | null,
  args: CompletionArgs,
): void {
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

export function handleLaunchError(error: unknown, args: CompletionArgs): void {
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
