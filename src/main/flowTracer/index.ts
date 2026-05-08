/**
 * src/main/flowTracer/index.ts — Flow Tracer subsystem barrel + IPC handler registrar.
 *
 * Wave 85 Phase 5: flowTracer:get-canonical-flows now calls canonicalFlows.getCanonicalFlows();
 *   flowTracer:regenerate-gallery added.
 *
 * IPC channels registered here:
 *   flowTracer:get-canonical-flows        — returns the canonical CanonicalFlow[] (AI gallery or fallback)
 *   flowTracer:regenerate-gallery         — force-regenerates the gallery via Haiku CLI (Phase 5)
 *   flowTracer:trace-flow                 — traces the entry point via traceEngine
 *   flowTracer:get-narration              — per-symbol What+How narration cache (Phase 3)
 *   flowTracer:get-flow-why               — per-flow chain-aware Why narration (Phase 4)
 *   flowTracer:save-flow                  — persist a FlowTrace to disk (Phase 7)
 *   flowTracer:list-saved-flows           — list persisted flows (Phase 7)
 *   flowTracer:load-flow                  — load a persisted flow (Phase 7)
 *   flowTracer:export-mermaid             — export FlowTrace as Mermaid text (Phase 7)
 *   flowTracer:resolve-natural-language   — NL query → ranked EntryPointCandidates (Phase 6)
 *
 * The acceptance test at walkingSkeleton.acceptance.test.ts is the pass criterion.
 */

import { ipcMain } from 'electron';

import type { FlowTrace, SymbolRef } from '../../shared/types/flowTracer';
import { getConfigValue } from '../config';
import log from '../logger';
import { generateCanonicalFlows, getCanonicalFlows } from './canonicalFlows';
import { flowTraceToMermaid } from './flowMermaidExport';
import { listSavedFlows, loadFlow, saveFlow } from './flowPersistence';
import { generateFlowWhy, getFlowWhy } from './flowWhyCache';
import { generateNarration, getNarration } from './narrationCache';
import { resolveNaturalLanguage } from './nlResolver';
import { traceFlow } from './traceEngine';

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

function registerNarrationHandlers(channels: ChannelList): void {
  reg(channels, 'flowTracer:get-narration', async (_event, symbolRef: unknown) => {
    const ref = symbolRef as SymbolRef;
    log.info('[flowTracer] get-narration — symbol:', ref?.symbol);
    try {
      const cached = await getNarration(ref);
      if (cached !== null) return { success: true as const, narration: cached };
      // Cache miss — kick off background generation, return null so renderer shows placeholder
      generateNarration(ref).catch((err) =>
        log.info('[flowTracer] background narration error for', ref?.symbol, err),
      );
      return { success: true as const, narration: null };
    } catch (err) {
      log.error('[flowTracer] get-narration error:', err);
      return { success: false as const, error: String(err) };
    }
  });

  reg(channels, 'flowTracer:get-flow-why', async (_event, flow: unknown) => {
    const f = flow as FlowTrace;
    log.info('[flowTracer] get-flow-why — flow:', f?.id, '(', f?.steps?.length, 'steps)');
    try {
      const cached = await getFlowWhy(f.id);
      if (cached !== null) {
        log.info('[flowTracer] get-flow-why — cache hit for', f.id);
        return { success: true as const, entries: cached };
      }
      const entries = await generateFlowWhy(f);
      return { success: true as const, entries };
    } catch (err) {
      log.error('[flowTracer] get-flow-why error:', err);
      return { success: false as const, error: String(err) };
    }
  });
}

function registerNLResolverHandler(channels: ChannelList): void {
  reg(channels, 'flowTracer:resolve-natural-language', async (_event, query: unknown) => {
    const q = typeof query === 'string' ? query : '';
    log.info('[flowTracer] resolve-natural-language — query:', q.slice(0, 60));
    try {
      const result = await resolveNaturalLanguage(q);
      return { success: true as const, result };
    } catch (err) {
      log.error('[flowTracer] resolve-natural-language error:', err);
      return { success: false as const, error: String(err) };
    }
  });
}

export function registerFlowTracerHandlers(): string[] {
  const channels: string[] = [];

  reg(channels, 'flowTracer:get-canonical-flows', async () => {
    log.info('[flowTracer] get-canonical-flows');
    try {
      const flows = await getCanonicalFlows();
      return { success: true as const, flows };
    } catch (err) {
      log.error('[flowTracer] get-canonical-flows error:', err);
      return { success: false as const, error: String(err) };
    }
  });

  reg(channels, 'flowTracer:regenerate-gallery', async () => {
    log.info('[flowTracer] regenerate-gallery — forced regeneration requested');
    try {
      const flows = await generateCanonicalFlows();
      return { success: true as const, flows };
    } catch (err) {
      log.error('[flowTracer] regenerate-gallery error:', err);
      return { success: false as const, error: String(err) };
    }
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
  registerNarrationHandlers(channels);
  registerNLResolverHandler(channels);

  return channels;
}

export function cleanupFlowTracerHandlers(): void {
  ipcMain.removeHandler('flowTracer:get-canonical-flows');
  ipcMain.removeHandler('flowTracer:regenerate-gallery');
  ipcMain.removeHandler('flowTracer:trace-flow');
  ipcMain.removeHandler('flowTracer:save-flow');
  ipcMain.removeHandler('flowTracer:list-saved-flows');
  ipcMain.removeHandler('flowTracer:load-flow');
  ipcMain.removeHandler('flowTracer:export-mermaid');
  ipcMain.removeHandler('flowTracer:get-narration');
  ipcMain.removeHandler('flowTracer:get-flow-why');
  ipcMain.removeHandler('flowTracer:resolve-natural-language');
}
