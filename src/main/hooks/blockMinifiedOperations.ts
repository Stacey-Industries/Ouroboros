/**
 * blockMinifiedOperations.ts — Wave 50 Phase B
 *
 * PreToolUse handler. Denies Read/Edit on minified build artifacts
 * (*.min.js, *.min.mjs, *.min.css). Respects hooks.enforcedRules config
 * — disabled if 'no-minified' is absent.
 *
 * Rule source: ~/.claude/rules/no-minified.md
 */

import path from 'path';

import { getConfigValue } from '../config';
import type { HookPayload } from '../hooks';
import { type HookDecision, PASS } from './hookDecision';

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_NAME = 'no-minified';
const BLOCKED_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write']);

/** Suffixes that identify a minified artifact by basename. */
const MINIFIED_SUFFIXES = ['.min.js', '.min.mjs', '.min.css'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRuleEnabled(): boolean {
  try {
    const hooks = getConfigValue('hooks' as Parameters<typeof getConfigValue>[0]);
    const rules = (hooks as { enforcedRules?: string[] } | undefined)?.enforcedRules;
    if (!Array.isArray(rules)) return true;
    return rules.includes(RULE_NAME);
  } catch {
    return true;
  }
}

function extractFilePath(payload: HookPayload): string | undefined {
  const raw = payload.input as Record<string, unknown> | undefined;
  const toolInput = (raw?.tool_input ?? raw) as Record<string, unknown> | undefined;
  const fp = toolInput?.file_path ?? toolInput?.path;
  return typeof fp === 'string' ? fp : undefined;
}

function isMinifiedFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return MINIFIED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

function buildDenyMessage(filePath: string): string {
  const base = path.basename(filePath);
  return (
    `refusing to read '${base}' — minified output is not source. ` +
    `Find the source file instead (usually the same name without '.min'), ` +
    `or ask the user where the source lives.`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a PreToolUse event and returns a deny decision when the agent
 * attempts to Read or Edit a minified build artifact.
 */
export function evaluatePreToolUse(payload: HookPayload): HookDecision {
  if (payload.type !== 'pre_tool_use') return PASS;
  if (!payload.toolName || !BLOCKED_TOOLS.has(payload.toolName)) return PASS;
  if (!isRuleEnabled()) return PASS;

  const filePath = extractFilePath(payload);
  if (!filePath) return PASS;
  if (!isMinifiedFile(filePath)) return PASS;

  return { kind: 'deny', ruleName: RULE_NAME, message: buildDenyMessage(filePath) };
}
