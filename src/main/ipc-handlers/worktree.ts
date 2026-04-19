/**
 * ipc-handlers/worktree.ts — IPC handler registrar for git worktree channels.
 *
 * Channels registered:
 *   git:worktreeAdd    — create a new worktree for a session
 *   git:worktreeRemove — remove an existing worktree
 *   git:worktreeList   — list all worktrees for a project root
 *
 * All channels are gated by the `sessions.worktreePerSession` feature flag.
 * The manager itself is pure — feature-flag logic lives here at the boundary.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import { getWorktreeManager } from '../session/worktreeManager';
import { assertPathAllowed } from './pathSecurity';

// ─── Local types ──────────────────────────────────────────────────────────────

type HandlerOk<T> = { success: true } & T;
type HandlerFail = { success: false; error: string };
type HandlerResult<T> = HandlerOk<T> | HandlerFail;

function ok<T extends object>(data: T): HandlerOk<T> {
  return { success: true, ...data };
}

function fail(err: unknown): HandlerFail {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ─── Feature-flag guard ───────────────────────────────────────────────────────

function isFeatureEnabled(): boolean {
  const sessions = getConfigValue('sessions') as { worktreePerSession?: boolean } | undefined;
  return sessions?.worktreePerSession === true;
}

// ─── Registration helper ──────────────────────────────────────────────────────

type EventHandler = (event: IpcMainInvokeEvent, args: unknown) => Promise<unknown>;

function register(channels: string[], channel: string, handler: EventHandler): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, args: unknown) => {
    try {
      return await handler(event, args);
    } catch (err) {
      log.error(`[worktree ipc] ${channel} error:`, err);
      return fail(err);
    }
  });
  channels.push(channel);
}

// ─── Handler implementations ──────────────────────────────────────────────────

interface AddArgs {
  projectRoot: string;
  sessionId: string;
}

async function handleWorktreeAdd(
  event: IpcMainInvokeEvent,
  args: unknown,
): Promise<HandlerResult<{ path: string }>> {
  if (!isFeatureEnabled()) return { success: false, error: 'feature-flag-off' };
  const { projectRoot, sessionId } = (args ?? {}) as AddArgs;
  if (!projectRoot || !sessionId) return fail('projectRoot and sessionId are required');
  if (!isValidUuid(sessionId)) return { success: false, error: 'invalid-session-id' };
  const denied = assertPathAllowed(event, projectRoot);
  if (denied) return denied;
  const result = await getWorktreeManager().add(projectRoot, sessionId);
  return ok({ path: result.path });
}

interface RemoveArgs {
  worktreePath: string;
}

async function handleWorktreeRemove(
  _event: IpcMainInvokeEvent,
  args: unknown,
): Promise<HandlerResult<Record<never, never>>> {
  if (!isFeatureEnabled()) return { success: false, error: 'feature-flag-off' };
  const { worktreePath } = (args ?? {}) as RemoveArgs;
  if (!worktreePath) return fail('worktreePath is required');
  await getWorktreeManager().remove(worktreePath);
  return ok({});
}

interface ListArgs {
  projectRoot: string;
}

async function handleWorktreeList(
  event: IpcMainInvokeEvent,
  args: unknown,
): Promise<HandlerResult<{ worktrees: unknown[] }>> {
  if (!isFeatureEnabled()) return { success: false, error: 'feature-flag-off' };
  const { projectRoot } = (args ?? {}) as ListArgs;
  if (!projectRoot) return fail('projectRoot is required');
  const denied = assertPathAllowed(event, projectRoot);
  if (denied) return denied;
  const worktrees = await getWorktreeManager().list(projectRoot);
  return ok({ worktrees });
}

// ─── Registration entry point ─────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerWorktreeHandlers(): string[] {
  const channels: string[] = [];
  register(channels, 'git:worktreeAdd', handleWorktreeAdd);
  register(channels, 'git:worktreeRemove', handleWorktreeRemove);
  register(channels, 'git:worktreeList', handleWorktreeList);
  registeredChannels = channels;
  return channels;
}

export function cleanupWorktreeHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
