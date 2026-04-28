/**
 * blockSecretWrites.ts — Wave 50 Phase B
 *
 * PreToolUse handler. Denies Write/Edit on .env* paths except for
 * safe template files (.env.sample, .env.example, .env.template).
 * Respects hooks.enforcedRules config — disabled if 'no-secrets' is absent.
 *
 * Rule source: ~/.claude/rules/no-secrets.md
 */

import path from 'path';

import { getConfigValue } from '../config';
import type { HookPayload } from '../hooks';
import { type HookDecision, PASS } from './hookDecision';

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_NAME = 'no-secrets';
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

/** Basenames that are safe to edit — they contain only placeholder values. */
const ALLOWED_BASENAMES = new Set(['.env.sample', '.env.example', '.env.template']);

/** Matches any .env* file (e.g. .env, .env.local, .env.production). */
// eslint-disable-next-line security/detect-unsafe-regex -- bounded: suffix segment after dot, no backtracking risk in practice
const ENV_FILE_RE = /^\.env(\.[^.]+)*$/;

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

function isEnvFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return ENV_FILE_RE.test(base);
}

function isAllowedEnvFile(filePath: string): boolean {
  return ALLOWED_BASENAMES.has(path.basename(filePath));
}

function buildDenyMessage(filePath: string): string {
  const base = path.basename(filePath);
  return (
    `refusing to edit '${base}' — secrets must not be modified by the agent. ` +
    `If a value is needed for testing, use a placeholder (sk-test-placeholder) ` +
    `or ask the user to populate it manually.`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a PreToolUse event and returns a deny decision when the agent
 * attempts to Write or Edit a secret-container .env* file.
 */
export function evaluatePreToolUse(payload: HookPayload): HookDecision {
  if (payload.type !== 'pre_tool_use') return PASS;
  if (!payload.toolName || !WRITE_TOOLS.has(payload.toolName)) return PASS;
  if (!isRuleEnabled()) return PASS;

  const filePath = extractFilePath(payload);
  if (!filePath) return PASS;
  if (!isEnvFile(filePath)) return PASS;
  if (isAllowedEnvFile(filePath)) return PASS;

  return { kind: 'deny', ruleName: RULE_NAME, message: buildDenyMessage(filePath) };
}
