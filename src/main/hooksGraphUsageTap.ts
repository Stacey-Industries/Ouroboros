/**
 * hooksGraphUsageTap.ts — Wave 48 Phase E
 *
 * Logs Grep/Read PreToolUse calls to a JSONL file so we can observe
 * how often agents reach for filesystem-shaped tools when graph tools
 * (search_graph / get_symbol / trace_call_path) would have served the
 * same query. Pure data collection — never blocks or modifies the
 * tool call.
 *
 * Output: ~/.ouroboros/telemetry/graph-usage.jsonl
 *   one line per pre_tool_use event for Grep / Read.
 */

import fs from 'fs';
import path from 'path';

import type { HookPayload } from './hooks';
import log from './logger';

const TARGET_TOOLS = new Set(['Grep', 'Read']);

const REGEX_META = /[{}[\]^$|()*+?]/;
const QUOTED_LITERAL = /^["'`].*["'`]$/;
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]{2,}$/;

function classifyGrepPattern(pattern: string): 'symbol' | 'literal' | 'unknown' {
  if (!pattern) return 'unknown';
  if (QUOTED_LITERAL.test(pattern)) return 'literal';
  if (REGEX_META.test(pattern)) return 'literal';
  if (BARE_IDENTIFIER.test(pattern)) return 'symbol';
  return 'literal';
}

export function classifyShape(
  toolName: string,
  input: Record<string, unknown> | undefined,
): 'symbol' | 'literal' | 'unknown' {
  if (!input) return 'unknown';
  if (toolName === 'Grep') {
    return classifyGrepPattern(typeof input.pattern === 'string' ? input.pattern : '');
  }
  if (toolName === 'Read') {
    return typeof input.file_path === 'string' && input.file_path ? 'literal' : 'unknown';
  }
  return 'unknown';
}

function telemetryDir(): string {
  return path.join(process.env.USERPROFILE || process.env.HOME || '.', '.ouroboros', 'telemetry');
}

function ensureDir(dir: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry dir
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (err) {
    log.warn('[graph-usage] mkdir failed:', err);
    return false;
  }
}

function summarizeInput(toolName: string, input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  if (toolName === 'Grep') {
    return {
      pattern: typeof input.pattern === 'string' ? input.pattern.slice(0, 200) : undefined,
      glob: typeof input.glob === 'string' ? input.glob.slice(0, 100) : undefined,
    };
  }
  if (toolName === 'Read') {
    return { file_path: typeof input.file_path === 'string' ? input.file_path.slice(0, 200) : undefined };
  }
  return {};
}

export function tapGraphUsage(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use') return;
  const toolName = payload.toolName ?? '';
  if (!TARGET_TOOLS.has(toolName)) return;
  const input = (payload.input ?? {}) as Record<string, unknown>;
  const shape = classifyShape(toolName, input);
  const entry = {
    ts: payload.timestamp,
    sessionId: payload.sessionId,
    tool: toolName,
    shape,
    args: summarizeInput(toolName, input),
    ideSpawned: payload.ideSpawned ?? false,
    correlationId: payload.correlationId ?? null,
  };
  const dir = telemetryDir();
  if (!ensureDir(dir)) return;
  const filePath = path.join(dir, 'graph-usage.jsonl');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known telemetry path under USERPROFILE
    fs.appendFile(filePath, JSON.stringify(entry) + '\n', (err) => {
      if (err) log.warn('[graph-usage] append failed:', err);
    });
  } catch (err) {
    log.warn('[graph-usage] write failed:', err);
  }
}
