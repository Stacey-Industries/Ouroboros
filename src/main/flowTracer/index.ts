/**
 * src/main/flowTracer/index.ts — Flow Tracer subsystem barrel + IPC handler registrar.
 *
 * Wave 85 Phase 1 (walking skeleton): hardcoded one canonical flow ("send a chat message")
 * with stubbed FlowTrace + placeholder narration. No real Tree-sitter scanning yet, no
 * real narration generation, no NL search. Phases 2-7 generalize each layer.
 *
 * IPC channels registered here:
 *   flowTracer:get-canonical-flows — returns the hardcoded CanonicalFlow[]
 *   flowTracer:trace-flow          — returns a stubbed FlowTrace for the entry point
 *
 * The acceptance test at walkingSkeleton.acceptance.test.ts is the pass criterion.
 */

import { ipcMain } from 'electron';

import type { SymbolRef } from '../../shared/types/flowTracer';
import log from '../logger';
import { getWalkingSkeletonTrace, WALKING_SKELETON_FLOWS } from './walkingSkeletonStub';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

function reg(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

export function registerFlowTracerHandlers(): string[] {
  const channels: string[] = [];

  reg(channels, 'flowTracer:get-canonical-flows', () => {
    log.info('[flowTracer] get-canonical-flows — returning walking-skeleton stub');
    return { success: true as const, flows: WALKING_SKELETON_FLOWS };
  });

  reg(channels, 'flowTracer:trace-flow', (_event, entry: unknown) => {
    const ref = entry as SymbolRef;
    log.info('[flowTracer] trace-flow — returning stub trace for', ref?.symbol);
    return { success: true as const, flow: getWalkingSkeletonTrace() };
  });

  return channels;
}

export function cleanupFlowTracerHandlers(): void {
  ipcMain.removeHandler('flowTracer:get-canonical-flows');
  ipcMain.removeHandler('flowTracer:trace-flow');
}
