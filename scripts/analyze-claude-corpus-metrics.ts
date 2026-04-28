/**
 * analyze-claude-corpus-metrics.ts — Wave 53c Phase B
 *
 * Per-session NDJSON parser and metric accumulator.
 * Pure functions + streaming line handler; no I/O of its own.
 */

import {
  EDIT_MISMATCH_RE,
  FILE_TOOLS,
  NON_SEARCH_TOOLS,
  SEARCH_TOOLS,
  type SessionAcc,
  type SessionSummary,
} from './analyze-claude-corpus-types';
import type { IntentBucket } from './intent-classifier';
import { classifyIntent } from './intent-classifier';

// ─── Accumulator factory ──────────────────────────────────────────────────────

export function makeAcc(sessionId: string): SessionAcc {
  return {
    sessionId,
    firstTs: '',
    lastTs: '',
    toolCounts: {},
    toolUseIdToName: {},
    editAttempts: 0,
    editFirstTryFailures: 0,
    currentGrepRun: 0,
    maxGrepRun: 0,
    userPrompts: [],
    filesTouched: new Set(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    hasTokens: false,
    parseErrors: 0,
  };
}

// ─── Content extraction helpers ───────────────────────────────────────────────

type RawBlock = Record<string, unknown>;

function getStringText(block: RawBlock): string {
  if (typeof block.text === 'string') return block.text;
  return '';
}

function getToolResultText(block: RawBlock): string {
  const c = block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return (c as RawBlock[]).map((x) => (typeof x.text === 'string' ? x.text : '')).join('');
  }
  return '';
}

// ─── Tool use helpers (split to keep complexity ≤ 10) ────────────────────────

function updateGrepRun(acc: SessionAcc, name: string): void {
  if (SEARCH_TOOLS.has(name)) {
    acc.currentGrepRun++;
    if (acc.currentGrepRun > acc.maxGrepRun) acc.maxGrepRun = acc.currentGrepRun;
  } else if (NON_SEARCH_TOOLS.has(name)) {
    acc.currentGrepRun = 0;
  }
}

function recordFilePath(acc: SessionAcc, name: string, block: RawBlock): void {
  if (!FILE_TOOLS.has(name)) return;
  const input = block.input as RawBlock | undefined;
  if (!input) return;
  const fp = input.file_path ?? input.path;
  if (typeof fp === 'string' && fp) acc.filesTouched.add(fp);
}

function handleToolUse(acc: SessionAcc, block: RawBlock): void {
  const name = typeof block.name === 'string' ? block.name : 'unknown';
  const id = typeof block.id === 'string' ? block.id : '';
  acc.toolCounts[name] = (acc.toolCounts[name] ?? 0) + 1;
  if (id) acc.toolUseIdToName[id] = name;
  if (name === 'Edit') acc.editAttempts++;
  updateGrepRun(acc, name);
  recordFilePath(acc, name, block);
}

function handleToolResult(acc: SessionAcc, block: RawBlock): void {
  if (block.is_error !== true) return;
  const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
  const parentName = acc.toolUseIdToName[id];
  if (parentName !== 'Edit') return;
  if (EDIT_MISMATCH_RE.test(getToolResultText(block))) acc.editFirstTryFailures++;
}

// ─── User message handler ─────────────────────────────────────────────────────

const META_PREFIXES = ['<local-command-caveat>', '<command-name>', '<local-command-stdout>'];

function isMetaString(s: string): boolean {
  return META_PREFIXES.some((p) => s.startsWith(p));
}

function extractUserPromptFromArray(content: RawBlock[]): string | null {
  for (const block of content) {
    if (block.type !== 'text') continue;
    const t = getStringText(block).trim();
    if (t && !t.startsWith('<')) return t;
  }
  return null;
}

function extractUserPrompt(content: unknown): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (isMetaString(trimmed)) return null;
    return trimmed || null;
  }
  if (!Array.isArray(content)) return null;
  return extractUserPromptFromArray(content as RawBlock[]);
}

function handleUserMessage(acc: SessionAcc, obj: RawBlock): void {
  if (obj.isMeta === true) return;
  const msg = obj.message as RawBlock | undefined;
  if (!msg) return;
  const content = msg.content;
  const prompt = extractUserPrompt(content);
  if (prompt) acc.userPrompts.push(prompt);
  if (!Array.isArray(content)) return;
  for (const block of content as RawBlock[]) {
    if (block.type === 'tool_result') handleToolResult(acc, block);
  }
}

// ─── Assistant message handler ────────────────────────────────────────────────

function handleUsage(acc: SessionAcc, usage: RawBlock): void {
  if (typeof usage.input_tokens === 'number') {
    acc.totalInputTokens += usage.input_tokens;
    acc.hasTokens = true;
  }
  if (typeof usage.output_tokens === 'number') acc.totalOutputTokens += usage.output_tokens;
  const cc = usage.cache_creation_input_tokens;
  if (typeof cc === 'number') acc.totalCacheCreation += cc;
  const cr = usage.cache_read_input_tokens;
  if (typeof cr === 'number') acc.totalCacheRead += cr;
}

function handleAssistantMessage(acc: SessionAcc, obj: RawBlock): void {
  const msg = obj.message as RawBlock | undefined;
  if (!msg) return;
  const content = msg.content;
  if (Array.isArray(content)) {
    for (const block of content as RawBlock[]) {
      if (block.type === 'tool_use') handleToolUse(acc, block);
    }
  }
  const usage = msg.usage as RawBlock | undefined;
  if (usage) handleUsage(acc, usage);
}

// ─── Timestamp tracking ───────────────────────────────────────────────────────

function updateTimestamps(acc: SessionAcc, ts: string): void {
  if (!acc.firstTs || ts < acc.firstTs) acc.firstTs = ts;
  if (!acc.lastTs || ts > acc.lastTs) acc.lastTs = ts;
}

// ─── Public: process one NDJSON line ─────────────────────────────────────────

function dispatchLine(acc: SessionAcc, obj: RawBlock): void {
  const t = obj.type;
  if (t === 'user') handleUserMessage(acc, obj);
  else if (t === 'assistant') handleAssistantMessage(acc, obj);
}

export function processLine(acc: SessionAcc, line: string): void {
  if (!line.trim()) return;
  let obj: RawBlock;
  try {
    obj = JSON.parse(line) as RawBlock;
  } catch {
    acc.parseErrors++;
    return;
  }
  const ts = typeof obj.timestamp === 'string' ? obj.timestamp : '';
  if (ts) updateTimestamps(acc, ts);
  dispatchLine(acc, obj);
}

// ─── Intent resolution ────────────────────────────────────────────────────────

function resolveIntent(prompts: string[]): { bucket: IntentBucket; confidence: number } {
  if (prompts.length === 0) return { bucket: 'other', confidence: 0 };
  for (const p of prompts) {
    const r = classifyIntent(p);
    if (r.bucket !== 'continuation') return { bucket: r.bucket, confidence: r.confidence };
  }
  return { bucket: 'continuation', confidence: 1 };
}

// ─── Public: finalize accumulator into SessionSummary ─────────────────────────

export function finalizeSession(acc: SessionAcc): SessionSummary {
  const { bucket, confidence } = resolveIntent(acc.userPrompts);
  const startTs = acc.firstTs;
  const endTs = acc.lastTs;
  const durationMs = startTs && endTs ? new Date(endTs).getTime() - new Date(startTs).getTime() : 0;
  const editFirstTryFailureRate =
    acc.editAttempts > 0 ? acc.editFirstTryFailures / acc.editAttempts : 0;

  return {
    sessionId: acc.sessionId,
    startTs,
    endTs,
    durationMs,
    toolCounts: { ...acc.toolCounts },
    editAttempts: acc.editAttempts,
    editFirstTryFailures: acc.editFirstTryFailures,
    editFirstTryFailureRate,
    maxGrepLoopDepth: acc.maxGrepRun,
    intentBucket: bucket,
    intentConfidence: confidence,
    userPromptCount: acc.userPrompts.length,
    filesTouched: [...acc.filesTouched],
    tokenUsage: acc.hasTokens
      ? {
          inputTokens: acc.totalInputTokens,
          outputTokens: acc.totalOutputTokens,
          cacheCreationTokens: acc.totalCacheCreation,
          cacheReadTokens: acc.totalCacheRead,
        }
      : null,
  };
}
