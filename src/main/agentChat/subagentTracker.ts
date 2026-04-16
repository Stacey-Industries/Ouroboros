/**
 * subagentTracker.ts — In-memory lifecycle tracker for subagent sessions.
 *
 * Subagents are Claude Code child sessions spawned by a parent via the Task tool.
 * Hook events from child sessions look identical to regular session events — they
 * are disambiguated by childSessionId on the Task tool input (fast path) or by a
 * 30-second temporal window heuristic (fallback).
 *
 * All mutations are tolerant of out-of-order delivery:
 *   - recordStart is idempotent (re-entry updates fields without losing data).
 *   - recordMessage / recordUsage buffer into a pending map when no record exists.
 *   - recordEnd creates a stub record if none exists, then finalises it.
 */

import { getPricing } from '@shared/pricing';
import type { SubagentCostRollup, SubagentMessage, SubagentRecord } from '@shared/types/subagent';

import type { HookPayload } from '../hooks';
import log from '../logger';

export type { SubagentCostRollup, SubagentMessage, SubagentRecord };

export interface RecordStartParams {
  id: string;
  parentSessionId: string;
  parentThreadId?: string;
  toolCallId?: string;
  taskLabel?: string;
  startedAt?: number;
}

export interface UsageParams {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  usd?: number;
  model?: string;
}

// ─── Internal buffer types ────────────────────────────────────────────────────

interface PendingBuffer {
  messages: SubagentMessage[];
  usages: UsageParams[];
}

// ─── Module-level singleton state ─────────────────────────────────────────────

const records = new Map<string, SubagentRecord>();
const pendingBuffers = new Map<string, PendingBuffer>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateBuffer(subagentId: string): PendingBuffer {
  const existing = pendingBuffers.get(subagentId);
  if (existing) return existing;
  const buf: PendingBuffer = { messages: [], usages: [] };
  pendingBuffers.set(subagentId, buf);
  return buf;
}

function computeUsageCost(params: UsageParams): number {
  if (typeof params.usd === 'number' && params.usd > 0) return params.usd;
  const pricing = getPricing(params.model);
  const inputCost = (params.input / 1_000_000) * pricing.inputPer1M;
  const outputCost = (params.output / 1_000_000) * pricing.outputPer1M;
  const cacheReadCost = ((params.cacheRead ?? 0) / 1_000_000) * pricing.cacheReadPer1M;
  const cacheWriteCost = ((params.cacheWrite ?? 0) / 1_000_000) * pricing.cacheWritePer1M;
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function applyUsageToRecord(rec: SubagentRecord, usage: UsageParams): void {
  rec.inputTokens += usage.input;
  rec.outputTokens += usage.output;
  rec.cacheReadTokens += usage.cacheRead ?? 0;
  rec.cacheWriteTokens += usage.cacheWrite ?? 0;
  rec.usdCost += computeUsageCost(usage);
}

function flushBuffer(rec: SubagentRecord, buf: PendingBuffer): void {
  for (const msg of buf.messages) rec.messages.push(msg);
  for (const usage of buf.usages) applyUsageToRecord(rec, usage);
}

function makeStubRecord(subagentId: string, now: number): SubagentRecord {
  return {
    id: subagentId,
    parentSessionId: '',
    status: 'running',
    startedAt: now,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usdCost: 0,
    messages: [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function recordStart(params: RecordStartParams): void {
  const now = params.startedAt ?? Date.now();
  const existing = records.get(params.id);
  if (existing) {
    // Idempotent re-entry — update fields without losing accumulated data.
    if (params.parentSessionId) existing.parentSessionId = params.parentSessionId;
    if (params.parentThreadId) existing.parentThreadId = params.parentThreadId;
    if (params.toolCallId) existing.toolCallId = params.toolCallId;
    if (params.taskLabel) existing.taskLabel = params.taskLabel;
    existing.status = 'running';
    existing.startedAt = now;
    log.info(`[subagentTracker] re-start id=${params.id} parent=${params.parentSessionId}`);
    return;
  }
  const rec: SubagentRecord = {
    id: params.id,
    parentSessionId: params.parentSessionId,
    parentThreadId: params.parentThreadId,
    toolCallId: params.toolCallId,
    taskLabel: params.taskLabel,
    status: 'running',
    startedAt: now,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usdCost: 0,
    messages: [],
  };
  records.set(params.id, rec);
  const buf = pendingBuffers.get(params.id);
  if (buf) {
    flushBuffer(rec, buf);
    pendingBuffers.delete(params.id);
  }
  log.info(`[subagentTracker] start id=${params.id} parent=${params.parentSessionId}`);
}

export function recordMessage(subagentId: string, message: SubagentMessage): void {
  const rec = records.get(subagentId);
  if (rec) {
    rec.messages.push(message);
    return;
  }
  getOrCreateBuffer(subagentId).messages.push(message);
}

export function recordUsage(subagentId: string, usage: UsageParams): void {
  const rec = records.get(subagentId);
  if (rec) {
    applyUsageToRecord(rec, usage);
    return;
  }
  getOrCreateBuffer(subagentId).usages.push(usage);
}

export function recordEnd(
  subagentId: string,
  status: 'completed' | 'cancelled' | 'failed',
): void {
  const now = Date.now();
  const rec = records.get(subagentId);
  if (!rec) {
    // Arrived before start — create a stub so end doesn't get lost.
    const stub = makeStubRecord(subagentId, now);
    stub.status = status;
    stub.endedAt = now;
    records.set(subagentId, stub);
    const buf = pendingBuffers.get(subagentId);
    if (buf) {
      flushBuffer(stub, buf);
      pendingBuffers.delete(subagentId);
    }
    log.info(`[subagentTracker] end (no start) id=${subagentId} status=${status}`);
    return;
  }
  rec.status = status;
  rec.endedAt = now;
  log.info(`[subagentTracker] end id=${subagentId} status=${status}`);
}

export function get(subagentId: string): SubagentRecord | undefined {
  return records.get(subagentId);
}

export function listForParent(parentSessionId: string): SubagentRecord[] {
  const result: SubagentRecord[] = [];
  for (const rec of records.values()) {
    if (rec.parentSessionId === parentSessionId) result.push(rec);
  }
  return result;
}

export function countLive(parentSessionId: string): number {
  let count = 0;
  for (const rec of records.values()) {
    if (rec.parentSessionId === parentSessionId && rec.status === 'running') count++;
  }
  return count;
}

export function rollupCostForParent(parentSessionId: string): SubagentCostRollup {
  const children = listForParent(parentSessionId);
  const rollup: SubagentCostRollup = {
    inputTokens: 0,
    outputTokens: 0,
    usdCost: 0,
    childCount: children.length,
  };
  for (const rec of children) {
    rollup.inputTokens += rec.inputTokens;
    rollup.outputTokens += rec.outputTokens;
    rollup.usdCost += rec.usdCost;
  }
  return rollup;
}

/** Called from hooks pipeline when a pre_tool_use Task event fires. */
export function onTaskToolPreUse(payload: HookPayload): void {
  const input = payload.input as Record<string, unknown> | undefined;
  const taskLabel = (
    input?.description ?? input?.task ?? input?.prompt
  ) as string | undefined;
  const childSessionId = input?.childSessionId as string | undefined;

  if (!childSessionId) return;
  // Fast path: Task input includes the child session id.
  recordStart({
    id: childSessionId,
    parentSessionId: payload.sessionId,
    toolCallId: payload.toolCallId,
    taskLabel,
  });
}

/** Clear all records — test helper only. */
export function _clearAll(): void {
  records.clear();
  pendingBuffers.clear();
}
