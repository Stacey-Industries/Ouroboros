/**
 * hooksDiffReview.ts — Hook tap for the diff-review producer.
 *
 * Listens to pre_tool_use / post_tool_use events for write-class tools
 * (Write, Edit, MultiEdit), captures a git snapshot before the write,
 * then emits a synthetic `diff_review_ready` agent-event so the renderer
 * hook `useDiffReviewTrigger` can open the diff-review panel.
 *
 * Registered in hooksTapRunner.ts alongside the other taps.
 * Wave 94 Phase E.
 */

import { getConfigValue } from './config';
import type { HookPayload } from './hooks';
import { dispatchSyntheticHookEvent } from './hooks';
import log from './logger';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const STASH_TTL_MS = 60_000;

interface StashEntry {
  snapshotHash: string;
  projectRoot: string;
  timestamp: number;
}

// correlationKey → StashEntry. Keyed by `${sessionId}:${correlationId}`.
const preSnapshotStash = new Map<string, StashEntry>();

function correlationKey(sessionId: string, correlationId: string): string {
  return `${sessionId}:${correlationId}`;
}

function evictStaleEntries(): void {
  const cutoff = Date.now() - STASH_TTL_MS;
  for (const [key, entry] of preSnapshotStash) {
    if (entry.timestamp < cutoff) preSnapshotStash.delete(key);
  }
}

async function captureSnapshot(cwd: string): Promise<string | null> {
  const { gitTrimmed } = await import('./ipc-handlers/gitOperations');
  try {
    return await gitTrimmed(cwd, ['rev-parse', 'HEAD']);
  } catch (err) {
    log.warn('[diffReview] git snapshot failed:', err);
    return null;
  }
}

function getFilePathsFromPayload(payload: HookPayload): string[] {
  const data = payload.data as Record<string, unknown> | undefined;
  // post_tool_use path forwarded by post_tool_use.mjs
  if (typeof data?.filePath === 'string') return [data.filePath];
  if (Array.isArray(data?.filePaths))
    return (data.filePaths as unknown[]).filter((p): p is string => typeof p === 'string');
  // fallback: read from input (pre_tool_use shape)
  const input = payload.input as Record<string, unknown> | undefined;
  if (typeof input?.file_path === 'string') return [input.file_path];
  if (Array.isArray(input?.edits)) {
    return (input.edits as Array<Record<string, unknown>>)
      .map((e) => e.file_path)
      .filter((p): p is string => typeof p === 'string');
  }
  return [];
}

function handlePreToolUse(payload: HookPayload, sessionCwdMap: Map<string, string>): void {
  if (!payload.correlationId || !payload.sessionId) return;
  const cwd = sessionCwdMap.get(payload.sessionId);
  if (!cwd) return;
  evictStaleEntries();
  const key = correlationKey(payload.sessionId, payload.correlationId);
  if (preSnapshotStash.has(key)) return; // idempotent — already stashed
  setImmediate(() => {
    void captureSnapshot(cwd).then((hash) => {
      if (!hash) return;
      preSnapshotStash.set(key, { snapshotHash: hash, projectRoot: cwd, timestamp: Date.now() });
    });
  });
}

function handlePostToolUse(payload: HookPayload): void {
  if (!payload.correlationId || !payload.sessionId) return;
  const key = correlationKey(payload.sessionId, payload.correlationId);
  const entry = preSnapshotStash.get(key);
  preSnapshotStash.delete(key); // always clean up
  if (!entry) return;

  const filePaths = getFilePathsFromPayload(payload);
  const event = {
    type: 'diff_review_ready' as const,
    sessionId: payload.sessionId,
    snapshotHash: entry.snapshotHash,
    projectRoot: entry.projectRoot,
    filePaths,
    timestamp: Date.now(),
  };
  log.info(
    `[diffReview] emitting diff_review_ready session=${payload.sessionId} hash=${entry.snapshotHash} files=${filePaths.length}`,
  );
  dispatchSyntheticHookEvent(event as unknown as HookPayload);
}

export function tapDiffReview(payload: HookPayload, sessionCwdMap: Map<string, string>): void {
  if (!payload.toolName || !WRITE_TOOLS.has(payload.toolName)) return;
  const enabled = getConfigValue('claudeCliSettings')?.enableTerminalDiffReview ?? true;
  if (!enabled) return;

  if (payload.type === 'pre_tool_use') {
    handlePreToolUse(payload, sessionCwdMap);
  } else if (payload.type === 'post_tool_use') {
    handlePostToolUse(payload);
  }
}
