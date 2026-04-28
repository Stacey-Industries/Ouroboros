/**
 * hooksGraphUsageTap.ts — Wave 48 Phase E / Wave 50 Phase D (arg-capture fix)
 *
 * Logs Grep/Read PreToolUse calls to a JSONL file so we can observe
 * how often agents reach for filesystem-shaped tools when graph tools
 * (search_graph / get_symbol / trace_call_path) would have served the
 * same query. Pure data collection — never blocks or modifies the
 * tool call.
 *
 * Arg-capture fix (Wave 50 Phase D): pre_tool_use.mjs forwards the full
 * stdin JSON as payload.input. The tool's own args live at
 * payload.input.tool_input (not payload.input directly). Matches the
 * pattern used in src/main/hooks/blockSecretWrites.ts.
 *
 * Output: ~/.ouroboros/telemetry/graph-usage.jsonl
 *   one line per pre_tool_use event for Grep / Read.
 */

import fs from 'fs';
import path from 'path';

import type { HookPayload } from './hooks';
// Imported for internal use; also re-exported so hooksGraphUsageTap.test.ts import path is stable.
import { classifyShape } from './hooks/graphUsageClassifier';
import log from './logger';

export { classifyShape } from './hooks/graphUsageClassifier';

const TARGET_TOOLS = new Set(['Grep', 'Read']);

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

/**
 * Extracts tool args from the payload.
 *
 * pre_tool_use.mjs sets payload.input = toolInput (the full parsed stdin).
 * The actual tool arguments are nested at toolInput.tool_input.
 * Falls back to payload.input directly so synthetic test payloads
 * (which skip the nesting) still work.
 */
function extractToolInput(payload: HookPayload): Record<string, unknown> {
  const raw = payload.input as Record<string, unknown> | undefined;
  return ((raw?.tool_input ?? raw) as Record<string, unknown> | undefined) ?? {};
}

function summarizeInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
  if (toolName === 'Grep') {
    return {
      pattern: typeof input.pattern === 'string' ? input.pattern.slice(0, 200) : undefined,
      glob: typeof input.glob === 'string' ? input.glob.slice(0, 100) : undefined,
    };
  }
  if (toolName === 'Read') {
    return {
      file_path: typeof input.file_path === 'string' ? input.file_path.slice(0, 200) : undefined,
    };
  }
  return {};
}

export function tapGraphUsage(payload: HookPayload): void {
  if (payload.type !== 'pre_tool_use') return;
  const toolName = payload.toolName ?? '';
  if (!TARGET_TOOLS.has(toolName)) return;
  const input = extractToolInput(payload);
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
