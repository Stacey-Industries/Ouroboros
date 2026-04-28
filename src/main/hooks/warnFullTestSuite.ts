/**
 * warnFullTestSuite.ts — Wave 50 Phase B
 *
 * PreToolUse handler. Emits a warning (never a deny) when a Bash tool call
 * runs the full test suite without a trailing path argument. Respects
 * hooks.enforcedRules config — disabled if 'test-scope' is absent.
 *
 * Rule source: ~/.claude/rules/test-scope.md
 */

import { getConfigValue } from '../config';
import type { HookPayload } from '../hooks';
import { type HookDecision, PASS } from './hookDecision';

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_NAME = 'test-scope';

/**
 * Command prefixes that invoke the full test suite when run without a path arg.
 * Order matters — more specific prefixes come first.
 */
const FULL_SUITE_PREFIXES = [
  'npx vitest run',
  'npx jest',
  'npm run test',
  'npm test',
  'pnpm run test',
  'pnpm test',
  'yarn test',
];

/**
 * Tokens that look like path arguments: contain a slash, backslash, dot-segment,
 * or end in a test-file extension. Flags (--watch, --coverage, etc.) are NOT paths.
 */
const PATH_ARG_RE = /([/\\.]|\.test\.|\.spec\.)/;

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

function extractCommand(payload: HookPayload): string | undefined {
  const raw = payload.input as Record<string, unknown> | undefined;
  const toolInput = (raw?.tool_input ?? raw) as Record<string, unknown> | undefined;
  const cmd = toolInput?.command;
  return typeof cmd === 'string' ? cmd.trim() : undefined;
}

function matchedPrefix(command: string): string | undefined {
  const lower = command.toLowerCase();
  return FULL_SUITE_PREFIXES.find((p) => lower.startsWith(p));
}

function hasPathArg(command: string, prefix: string): boolean {
  const remainder = command.slice(prefix.length).trim();
  if (!remainder) return false;
  const tokens = remainder.split(/\s+/);
  return tokens.some((t) => !t.startsWith('-') && PATH_ARG_RE.test(t));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates a PreToolUse Bash event and returns a warn decision when the
 * command appears to run the full test suite without a scoped path argument.
 * Never returns deny.
 */
export function evaluatePreToolUse(payload: HookPayload): HookDecision {
  if (payload.type !== 'pre_tool_use') return PASS;
  if (payload.toolName !== 'Bash') return PASS;
  if (!isRuleEnabled()) return PASS;

  const command = extractCommand(payload);
  if (!command) return PASS;

  const prefix = matchedPrefix(command);
  if (!prefix) return PASS;
  if (hasPathArg(command, prefix)) return PASS;

  return {
    kind: 'warn',
    ruleName: RULE_NAME,
    message:
      `Full test suite detected ('${command}'). ` +
      `Per test-scope policy, run only tests covering files you modified. ` +
      `Pass an explicit test path, e.g. 'npx vitest run src/main/hooks/'.`,
  };
}
