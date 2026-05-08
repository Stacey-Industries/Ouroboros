/**
 * src/main/flowTracer/index.ts — Flow Tracer subsystem barrel + IPC handler registrar.
 *
 * Wave 85 Phase 2: flowTracer:trace-flow now calls the real trace engine.
 * Phase 1 walking-skeleton stub replaced; WALKING_SKELETON_FLOWS still used
 * for get-canonical-flows until Phase 5 ships the AI gallery.
 *
 * IPC channels registered here:
 *   flowTracer:get-canonical-flows — returns the canonical CanonicalFlow[]
 *   flowTracer:trace-flow          — traces the entry point via traceEngine
 *   flowTracer:save-flow           — persist a FlowTrace to disk (Phase 7)
 *   flowTracer:list-saved-flows    — list persisted flows (Phase 7)
 *   flowTracer:load-flow           — load a persisted flow (Phase 7)
 *   flowTracer:export-mermaid      — export FlowTrace as Mermaid text (Phase 7)
 *
 * The acceptance test at walkingSkeleton.acceptance.test.ts is the pass criterion.
 */

import { ipcMain } from 'electron';

import type { FlowTrace, SymbolRef } from '../../shared/types/flowTracer';
import { getConfigValue } from '../config';
import log from '../logger';
import { flowTraceToMermaid } from './flowMermaidExport';
import { listSavedFlows, loadFlow, saveFlow } from './flowPersistence';
import { traceFlow } from './traceEngine';
import { WALKING_SKELETON_FLOWS } from './walkingSkeletonStub';

const DEFAULT_MAX_DEPTH = 6;

function readMaxDepth(): number {
  try {
    const cfg = getConfigValue('flowTracer');
    const d = cfg?.maxDepth;
    if (typeof d === 'number' && d >= 3 && d <= 12) return d;
  } catch {
    // config unavailable (e.g. test environment)
  }
  return DEFAULT_MAX_DEPTH;
}

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

function reg(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

function registerPersistenceHandlers(channels: ChannelList): void {
  reg(channels, 'flowTracer:save-flow', async (_event, flow: FlowTrace, title: string) => {
    try {
      const result = await saveFlow(flow, title);
      log.info('[flowTracer] save-flow — saved', result.id);
      return { success: true as const, id: result.id };
    } catch (err) {
      log.error('[flowTracer] save-flow error', err);
      return { success: false as const, error: String(err) };
    }
  });

  reg(channels, 'flowTracer:list-saved-flows', async () => {
    try {
      const summaries = await listSavedFlows();
      return { success: true as const, flows: summaries };
    } catch (err) {
      log.error('[flowTracer] list-saved-flows error', err);
      return { success: false as const, error: String(err) };
    }
  });

  reg(channels, 'flowTracer:load-flow', async (_event, id: string) => {
    try {
      const flow = await loadFlow(id);
      return { success: true as const, flow };
    } catch (err) {
      log.error('[flowTracer] load-flow error', err);
      return { success: false as const, error: String(err) };
    }
  });

  reg(channels, 'flowTracer:export-mermaid', (_event, flow: FlowTrace) => {
    try {
      const mermaid = flowTraceToMermaid(flow);
      return { success: true as const, mermaid };
    } catch (err) {
      log.error('[flowTracer] export-mermaid error', err);
      return { success: false as const, error: String(err) };
    }
  });
}

export function registerFlowTracerHandlers(): string[] {
  const channels: string[] = [];

  reg(channels, 'flowTracer:get-canonical-flows', () => {
    log.info('[flowTracer] get-canonical-flows — returning walking-skeleton stub');
    return { success: true as const, flows: WALKING_SKELETON_FLOWS };
  });

  reg(channels, 'flowTracer:trace-flow', async (_event, entry: unknown) => {
    const ref = entry as SymbolRef;
    log.info('[flowTracer] trace-flow entry:', ref?.symbol);
    try {
      const flow = await traceFlow(ref, { maxDepth: readMaxDepth() });
      return { success: true as const, flow };
    } catch (err) {
      log.error('[flowTracer] trace-flow error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false as const, error: msg };
    }
  });

  registerPersistenceHandlers(channels);

  return channels;
}

export function cleanupFlowTracerHandlers(): void {
  ipcMain.removeHandler('flowTracer:get-canonical-flows');
  ipcMain.removeHandler('flowTracer:trace-flow');
  ipcMain.removeHandler('flowTracer:save-flow');
  ipcMain.removeHandler('flowTracer:list-saved-flows');
  ipcMain.removeHandler('flowTracer:load-flow');
  ipcMain.removeHandler('flowTracer:export-mermaid');
}
