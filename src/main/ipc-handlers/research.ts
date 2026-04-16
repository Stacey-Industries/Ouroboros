/**
 * ipc-handlers/research.ts — IPC handler registrar for the research subagent
 * (Wave 25 Phase B).
 *
 * Channel:
 *   research:invoke  { topic, library?, version? } → { success, artifact? }
 */

import type { ResearchArtifact } from '@shared/types/research';
import { ipcMain } from 'electron';

import log from '../logger';
import { runResearch } from '../research/researchSubagent';

// ─── Response helpers ─────────────────────────────────────────────────────────

type OkResult<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };

function ok<T extends object>(data: T): OkResult<T> {
  return { success: true, ...data };
}

function fail(err: unknown): FailResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

interface InvokeArgs {
  topic?: string;
  library?: string;
  version?: string;
}

async function handleInvoke(
  args: unknown,
): Promise<OkResult<{ artifact: ResearchArtifact }> | FailResult> {
  const { topic, library, version } = (args ?? {}) as InvokeArgs;
  if (typeof topic !== 'string' || !topic.trim()) {
    return fail('topic is required');
  }
  const artifact = await runResearch({
    topic: topic.trim(),
    library: typeof library === 'string' ? library : undefined,
    version: typeof version === 'string' ? version : undefined,
  });
  return ok({ artifact });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerResearchHandlers(): string[] {
  const channels: string[] = [];

  function reg(
    channel: string,
    handler: (args: unknown) => Promise<OkResult<object> | FailResult>,
  ): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...handlerArgs) => {
      try {
        return await handler(handlerArgs[0]);
      } catch (err) {
        log.error(`[research ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('research:invoke', (args) => handleInvoke(args));

  registeredChannels = channels;
  return channels;
}

export function cleanupResearchHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
