/**
 * claudeCodeHelpers.ts — Process helpers for the Claude Code adapter.
 *
 * Extracted from claudeCodeAdapter.ts to keep each file under 300 lines.
 * Sits between claudeCodeState.ts and claudeCodeLaunch.ts in the import chain.
 */

import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

import type { ImageAttachment } from '../../agentChat/types';
import type { ClaudeCliSettings } from '../../config';
import log from '../../logger';
import { buildEventHandler } from './claudeCodeEventHandler';
import {
  activeAgentPtySessions,
  activeProcesses,
  cancelledTasks,
  type CompletionArgs,
} from './claudeCodeState';
import { spawnStreamJsonProcess } from './claudeStreamJsonRunner';
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

export function buildStopDiagnostic(result: StreamJsonResultEvent | null): string | null {
  if (!result)
    return '\n\n---\n**Agent stopped** — no result event received from Claude Code process.';
  const message = buildStopReasonMessage(result);
  return message ? `\n\n---\n${message}` : null;
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
