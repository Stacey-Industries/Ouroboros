/**
 * blockLockfileEdits.ts — Wave 50 Phase B
 *
 * PreToolUse handler. Denies Write/Edit on package manager lockfiles.
 * Respects hooks.enforcedRules config — disabled if 'lockfiles' is absent.
 *
 * Rule source: ~/.claude/rules/lockfiles.md
 */

import path from 'path';

import { getConfigValue } from '../config';
import type { HookPayload } from '../hooks';
import { type HookDecision, PASS } from './hookDecision';

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_NAME = 'lockfiles';
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const LOCKFILE_BASENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

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

function isLockfile(filePath: string): boolean {
  return LOCKFILE_BASENAMES.has(path.basename(filePath));
}

function buildDenyMessage(filePath: string): string {
  const base = path.basename(filePath);
  return (
    `refusing to edit '${base}' — lockfiles are auto-generated. ` +
    `Use the appropriate package manager command instead ` +
    `(e.g. 'npm install' to regenerate package-lock.json). ` +
    `Modify package.json or the equivalent manifest file.`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a PreToolUse event and returns a deny decision when the agent
 * attempts to Write or Edit a package manager lockfile.
 */
export function evaluatePreToolUse(payload: HookPayload): HookDecision {
  if (payload.type !== 'pre_tool_use') return PASS;
  if (!payload.toolName || !WRITE_TOOLS.has(payload.toolName)) return PASS;
  if (!isRuleEnabled()) return PASS;

  const filePath = extractFilePath(payload);
  if (!filePath) return PASS;
  if (!isLockfile(filePath)) return PASS;

  return { kind: 'deny', ruleName: RULE_NAME, message: buildDenyMessage(filePath) };
}
