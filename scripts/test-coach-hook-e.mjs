/**
 * test-coach-hook-e.mjs — Phase E smoke tests: acknowledgment + hard-gate tiers.
 *
 * Tests:
 *   1. Synthetic acknowledgment pattern fires → exit 0, structured deny with
 *      permissionDecision:"deny", permissionDecisionReason contains header + suggestion.
 *   2. Synthetic hard-gate pattern fires → structured deny with HARD GATE header
 *      AND bypass instruction.
 *   3. Mixed soft + acknowledgment → acknowledgment deny emitted; soft suggestions
 *      appear under "Soft suggestions also flagged:" heading in the same reason.
 *   4. Mixed acknowledgment + hard → hard deny emitted (hard wins).
 *   5. Hard-gate fires → JSONL entry written with escalation:'hard', outcome:'pending'.
 *      Pending-nudges state includes the entry.
 *   6. UserPromptSubmit hook detects [delegation-bypass: <reason>] → bypass state
 *      file updated with the matched pattern id from recent hard fires.
 *   7. After bypass is set, the same hard-gate pattern fires for the same session
 *      → silent exit (no deny emitted, no nudge).
 *   8. Bypass for one pattern does NOT suppress other patterns → another pattern
 *      still fires normally.
 *   9. OUROBOROS_INTERNAL=1 → all tiers silent-exit (escalation tiers are suppressed).
 *
 * Run:
 *   node scripts/test-coach-hook-e.mjs
 *
 * Exits 0 on all pass, 1 on any failure.
 *
 * Environment overrides used:
 *   COACH_USERDATA_OVERRIDE   — avoids writing to real userData
 *   COACH_STATE_OVERRIDE      — avoids writing to real ~/.claude/hooks/state/
 *   COACH_PATTERNS_OVERRIDE   — injects synthetic patterns with ack/hard escalation
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// ── Hook paths ─────────────────────────────────────────────────────────────────
const hooksRoot = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'hooks');
const coachHookPath = join(hooksRoot, 'delegation_coach.mjs');
const userPromptHookPath = join(hooksRoot, 'delegation_coach_user_prompt.mjs');

for (const [label, p] of [
  ['delegation_coach.mjs', coachHookPath],
  ['delegation_coach_user_prompt.mjs', userPromptHookPath],
]) {
  if (!existsSync(p)) {
    console.error(`FATAL: Hook not found: ${label} at ${p}`);
    process.exit(1);
  }
}

// ── Shared setup ───────────────────────────────────────────────────────────────
const tmpBase = mkdtempSync(join(tmpdir(), 'coach-e-test-'));
const userDataDir = join(tmpBase, 'userData');
const stateDir = join(tmpBase, 'state');
const patternsDir = join(tmpBase, 'patterns');
mkdirSync(userDataDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });
mkdirSync(patternsDir, { recursive: true });

const jsonlPath = join(userDataDir, 'delegation-coach.jsonl');
const now = Date.now();

let passed = 0;
let failed = 0;

// ── Synthetic pattern definitions ──────────────────────────────────────────────
// These are injected via COACH_PATTERNS_OVERRIDE so we can test ack/hard tiers
// without promoting any real seed patterns.

const ACK_PATTERN = {
  id: 'test-ack-pattern',
  name: 'Synthetic acknowledgment pattern',
  description: 'Test pattern — acknowledgment tier — fires on Read in test sessions.',
  trigger: {
    current: { tool: 'Read' },
    history: [{ match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60000 }],
  },
  suggestion: 'ACK_PATTERN_SUGGESTION: consider dispatching haiku-explorer for this read burst.',
  escalation: 'acknowledgment',
  cooldownMs: 0,
  confidence: 0.9,
};

const HARD_PATTERN = {
  id: 'test-hard-pattern',
  name: 'Synthetic hard-gate pattern',
  description: 'Test pattern — hard tier — fires on Read in test sessions.',
  trigger: {
    current: { tool: 'Read' },
    history: [{ match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60000 }],
  },
  suggestion: 'HARD_PATTERN_SUGGESTION: this is a hard gate — dispatch a subagent.',
  escalation: 'hard',
  cooldownMs: 0,
  confidence: 0.95,
};

const SOFT_PATTERN = {
  id: 'test-soft-pattern',
  name: 'Synthetic soft pattern',
  description: 'Test pattern — soft tier — fires on Read in test sessions.',
  trigger: {
    current: { tool: 'Read' },
    history: [{ match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60000 }],
  },
  suggestion: 'SOFT_PATTERN_SUGGESTION: soft nudge for this read burst.',
  escalation: 'soft',
  cooldownMs: 0,
  confidence: 0.7,
};

const ANOTHER_ACK_PATTERN = {
  id: 'test-ack-pattern-2',
  name: 'Synthetic acknowledgment pattern 2',
  description: 'Second ack pattern for mixed-tier tests.',
  trigger: {
    current: { tool: 'Grep' },
    history: [{ match: { tool: 'Grep' }, count: { min: 1 }, withinMs: 60000 }],
  },
  suggestion: 'ACK_PATTERN_2_SUGGESTION: second ack pattern suggestion.',
  escalation: 'acknowledgment',
  cooldownMs: 0,
  confidence: 0.9,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function writePatterns(patterns, filename = 'patterns.json') {
  const path = join(patternsDir, filename);
  writeFileSync(path, JSON.stringify(patterns), 'utf8');
  return path;
}

function readJsonl() {
  if (!existsSync(jsonlPath)) return [];
  return readFileSync(jsonlPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildHistory(sessionId, count = 3) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      tool: 'Read',
      input: { file_path: `/repo/file${i}.ts` },
      timestamp: now - (count - i) * 10000,
      sessionId,
    });
  }
  return entries;
}

function setHistory(sessionId, history) {
  const historyPath = join(stateDir, `coach-history-${sessionId}.json`);
  writeFileSync(historyPath, JSON.stringify(history), 'utf8');
}

function runHook(hookPath, payload, extraEnv = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...extraEnv };
    const child = spawn(process.execPath, [hookPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function parseDenyOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    return parsed?.hookSpecificOutput ?? null;
  } catch {
    return null;
  }
}

// ── Test 1: Acknowledgment pattern fires → structured deny ─────────────────────
{
  const sid = 'test-e-1-ack';
  const patternsPath = writePatterns([ACK_PATTERN], 'test-e-1.json');
  setHistory(sid, buildHistory(sid));

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const isCorrectDeny =
    deny?.permissionDecision === 'deny' &&
    typeof deny?.permissionDecisionReason === 'string' &&
    deny.permissionDecisionReason.includes('[delegation-coach: acknowledgment required]') &&
    deny.permissionDecisionReason.includes('ACK_PATTERN_SUGGESTION');

  assert(
    'Test 1 — acknowledgment pattern → exit 0, structured deny with ack header + suggestion',
    result.exitCode === 0 && isCorrectDeny,
    `exitCode=${result.exitCode} deny=${JSON.stringify(deny)} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 2: Hard-gate pattern fires → structured deny with HARD GATE header ────
{
  const sid = 'test-e-2-hard';
  const patternsPath = writePatterns([HARD_PATTERN], 'test-e-2.json');
  setHistory(sid, buildHistory(sid));

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const reason = deny?.permissionDecisionReason ?? '';
  const hasHardHeader = reason.includes('[delegation-coach: HARD GATE]');
  const hasSuggestion = reason.includes('HARD_PATTERN_SUGGESTION');
  const hasBypassInstruction = reason.includes('[delegation-bypass:');

  assert(
    'Test 2 — hard-gate pattern → exit 0, structured deny with HARD GATE header + bypass instruction',
    result.exitCode === 0 &&
      deny?.permissionDecision === 'deny' &&
      hasHardHeader &&
      hasSuggestion &&
      hasBypassInstruction,
    `exitCode=${result.exitCode} hasHardHeader=${hasHardHeader} hasBypassInstr=${hasBypassInstruction} hasSuggestion=${hasSuggestion} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 3: Mixed soft + acknowledgment → ack deny; soft in "also flagged" ─────
{
  const sid = 'test-e-3-mixed-soft-ack';
  const patternsPath = writePatterns([SOFT_PATTERN, ACK_PATTERN], 'test-e-3.json');
  setHistory(sid, buildHistory(sid));

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const reason = deny?.permissionDecisionReason ?? '';
  const hasAckHeader = reason.includes('[delegation-coach: acknowledgment required]');
  const hasAckSuggestion = reason.includes('ACK_PATTERN_SUGGESTION');
  const hasSoftUnderAlsoFlagged =
    reason.includes('Soft suggestions also flagged:') && reason.includes('SOFT_PATTERN_SUGGESTION');

  assert(
    'Test 3 — mixed soft+ack → ack deny with soft suggestions under "Soft suggestions also flagged:"',
    result.exitCode === 0 &&
      deny?.permissionDecision === 'deny' &&
      hasAckHeader &&
      hasAckSuggestion &&
      hasSoftUnderAlsoFlagged,
    `exitCode=${result.exitCode} hasAckHeader=${hasAckHeader} hasSoftUnderAlsoFlagged=${hasSoftUnderAlsoFlagged} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 4: Mixed acknowledgment + hard → hard deny wins ──────────────────────
{
  const sid = 'test-e-4-mixed-ack-hard';
  const patternsPath = writePatterns([ACK_PATTERN, HARD_PATTERN], 'test-e-4.json');
  setHistory(sid, buildHistory(sid));

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const reason = deny?.permissionDecisionReason ?? '';
  const hasHardHeader = reason.includes('[delegation-coach: HARD GATE]');
  const noAckOnlyHeader = !reason.startsWith('[delegation-coach: acknowledgment required]');

  assert(
    'Test 4 — mixed ack+hard → hard deny wins (HARD GATE header, not ack header)',
    result.exitCode === 0 &&
      deny?.permissionDecision === 'deny' &&
      hasHardHeader &&
      noAckOnlyHeader,
    `exitCode=${result.exitCode} hasHardHeader=${hasHardHeader} reason=${reason.slice(0, 200)} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 5: Hard-gate fires → JSONL entry with escalation:'hard', pending state ─
{
  const sid = 'test-e-5-hard-jsonl';
  const patternsPath = writePatterns([HARD_PATTERN], 'test-e-5.json');
  setHistory(sid, buildHistory(sid));

  const linesBefore = readJsonl().length;

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const allEntries = readJsonl();
  const newEntries = allEntries.slice(linesBefore);
  const hardEntry = newEntries.find((e) => e.patternId === 'test-hard-pattern');

  const pendingPath = join(stateDir, `coach-pending-${sid}.json`);
  let hasPendingEntry = false;
  if (existsSync(pendingPath)) {
    try {
      const raw = JSON.parse(readFileSync(pendingPath, 'utf8'));
      const entries = raw?.pendingNudges ?? [];
      hasPendingEntry = entries.some((n) => n.patternId === 'test-hard-pattern');
    } catch {
      /* stays false */
    }
  }

  assert(
    'Test 5 — hard-gate fires → JSONL entry escalation:hard + outcome:pending, pending-nudges state includes entry',
    result.exitCode === 0 &&
      hardEntry?.escalation === 'hard' &&
      hardEntry?.outcome === 'pending' &&
      typeof hardEntry?.nudgeId === 'string' &&
      hasPendingEntry,
    `exitCode=${result.exitCode} hardEntry=${JSON.stringify(hardEntry)} hasPendingEntry=${hasPendingEntry} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 6: UserPromptSubmit hook detects bypass token → bypass state updated ──
{
  const sid = 'test-e-6-bypass-detect';
  const patternsPath = writePatterns([HARD_PATTERN], 'test-e-6-patterns.json');

  // Step 1: fire a hard-gate to populate pending state
  setHistory(sid, buildHistory(sid));
  await runHook(
    coachHookPath,
    {
      tool_name: 'Read',
      tool_input: { file_path: '/repo/trigger.ts' },
      session_id: sid,
    },
    {
      COACH_USERDATA_OVERRIDE: userDataDir,
      COACH_STATE_OVERRIDE: stateDir,
      COACH_PATTERNS_OVERRIDE: patternsPath,
    },
  );

  // Step 2: submit user message with bypass token
  const promptPayload = {
    prompt: 'Proceeding anyway. [delegation-bypass: this pattern misfired on a legitimate read]',
    session_id: sid,
  };
  const result = await runHook(userPromptHookPath, promptPayload, {
    COACH_STATE_OVERRIDE: stateDir,
  });

  const bypassPath = join(stateDir, `coach-bypass-${sid}.json`);
  let bypassHasPattern = false;
  if (existsSync(bypassPath)) {
    try {
      const raw = JSON.parse(readFileSync(bypassPath, 'utf8'));
      bypassHasPattern = (raw?.bypassedPatterns ?? []).includes('test-hard-pattern');
    } catch {
      /* stays false */
    }
  }

  assert(
    'Test 6 — UserPromptSubmit with bypass token → coach-bypass state file updated with hard pattern id',
    result.exitCode === 0 && bypassHasPattern,
    `exitCode=${result.exitCode} bypassHasPattern=${bypassHasPattern} bypassPath=${bypassPath} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 7: After bypass, same hard-gate pattern → silent exit (no deny) ────────
{
  const sid = 'test-e-7-bypass-suppresses';
  const patternsPath = writePatterns([HARD_PATTERN], 'test-e-7-patterns.json');

  // Manually write bypass state file as if Test 6 already ran for this session
  const bypassPath = join(stateDir, `coach-bypass-${sid}.json`);
  writeFileSync(
    bypassPath,
    JSON.stringify({
      bypassedPatterns: ['test-hard-pattern'],
      lastUpdated: Date.now(),
    }),
    'utf8',
  );

  // Fire the hard-gate pattern
  setHistory(sid, buildHistory(sid));
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const noOutput = result.stdout.trim() === '';

  assert(
    'Test 7 — bypassed hard-gate pattern → silent exit (no deny, no nudge in stdout)',
    result.exitCode === 0 && noOutput && deny === null,
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout.slice(0, 200))} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 8: Bypass for one pattern does NOT suppress another ──────────────────
{
  const sid = 'test-e-8-bypass-selective';
  // Two patterns: hard (bypassed) + ack (not bypassed)
  const patternsPath = writePatterns([HARD_PATTERN, ACK_PATTERN], 'test-e-8-patterns.json');

  // Bypass only the hard pattern
  const bypassPath = join(stateDir, `coach-bypass-${sid}.json`);
  writeFileSync(
    bypassPath,
    JSON.stringify({
      bypassedPatterns: ['test-hard-pattern'],
      lastUpdated: Date.now(),
    }),
    'utf8',
  );

  // Fire — should trigger ACK_PATTERN but not HARD_PATTERN
  setHistory(sid, buildHistory(sid));
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
  });

  const deny = parseDenyOutput(result.stdout);
  const reason = deny?.permissionDecisionReason ?? '';
  const isAckDeny =
    deny?.permissionDecision === 'deny' &&
    reason.includes('[delegation-coach: acknowledgment required]') &&
    reason.includes('ACK_PATTERN_SUGGESTION');
  const noHardHeader = !reason.includes('[delegation-coach: HARD GATE]');

  assert(
    'Test 8 — bypass for hard pattern does not suppress ack pattern (ack deny still fires)',
    result.exitCode === 0 && isAckDeny && noHardHeader,
    `exitCode=${result.exitCode} isAckDeny=${isAckDeny} noHardHeader=${noHardHeader} reason=${reason.slice(0, 200)} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 9: OUROBOROS_INTERNAL=1 → all tiers silent-exit ─────────────────────
{
  const sid = 'test-e-9-internal';
  const patternsPath = writePatterns([HARD_PATTERN, ACK_PATTERN], 'test-e-9-patterns.json');
  setHistory(sid, buildHistory(sid));

  const linesBefore = readJsonl().length;
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sid,
  };
  const result = await runHook(coachHookPath, payload, {
    COACH_USERDATA_OVERRIDE: userDataDir,
    COACH_STATE_OVERRIDE: stateDir,
    COACH_PATTERNS_OVERRIDE: patternsPath,
    OUROBOROS_INTERNAL: '1',
  });
  const linesAfter = readJsonl().length;

  assert(
    'Test 9 — OUROBOROS_INTERNAL=1 → silent exit, no deny, no JSONL write (ack+hard patterns both suppressed)',
    result.exitCode === 0 && result.stdout.trim() === '' && linesAfter === linesBefore,
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout)} delta=${linesAfter - linesBefore} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {
  /* best-effort */
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\nPhase E smoke results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All Phase E smoke tests passed.');
process.exit(0);
