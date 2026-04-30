/**
 * test-coach-hook.mjs — Smoke tests for delegation_coach.mjs
 *
 * Spawns the hook with synthetic stdin payloads and asserts:
 *   1. Exit code 0 always (soft-nudge mode never blocks)
 *   2. Stdout contains the expected nudge for a payload that should fire
 *      the multi-file-scan-no-edit pattern
 *   3. Stdout is empty for a single Read that should NOT fire
 *   4. OUROBOROS_INTERNAL=1 → silent exit 0, no nudge, no JSONL write
 *   5. JSONL line is appended to the userData dir (via COACH_USERDATA_OVERRIDE)
 *   6. test-first-violation pattern fires on Edit-after-test-read
 *
 * Run:
 *   node scripts/test-coach-hook.mjs
 *
 * Exits 0 on all pass, 1 on any failure.
 *
 * Environment overrides used:
 *   COACH_USERDATA_OVERRIDE — avoids writing to real userData
 *   COACH_STATE_OVERRIDE    — avoids writing to real ~/.claude/hooks/state/
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Path to the hook under test
const hookPath = join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude',
  'hooks',
  'delegation_coach.mjs',
);

if (!existsSync(hookPath)) {
  fail(`Hook not found at ${hookPath}. Run scripts/build-coach-hook.mjs first.`);
}

// Create temp dirs for test state + JSONL (avoids polluting real userData/state)
const tmpBase = mkdtempSync(join(tmpdir(), 'coach-test-'));
const userDataDir = join(tmpBase, 'userData');
const stateDir = join(tmpBase, 'state');
mkdirSync(userDataDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

// Env overrides applied to every hook invocation
const testEnv = {
  COACH_USERDATA_OVERRIDE: userDataDir,
  COACH_STATE_OVERRIDE: stateDir,
};

let passed = 0;
let failed = 0;

const now = Date.now();
const sessionId = 'test-session-smoke';
const historyPath = join(stateDir, `coach-history-${sessionId}.json`);

// Pre-populated history: 3 Read events within the 60s window
// This causes multi-file-scan-no-edit to fire on the next Read.
const priorHistory = [
  { tool: 'Read', input: { file_path: '/repo/a.ts' }, timestamp: now - 50000, sessionId },
  { tool: 'Read', input: { file_path: '/repo/b.ts' }, timestamp: now - 40000, sessionId },
  { tool: 'Read', input: { file_path: '/repo/c.ts' }, timestamp: now - 30000, sessionId },
];

// ── Test 1: multi-file-scan fires → stdout contains nudge ────────────────────
writeFileSync(historyPath, JSON.stringify(priorHistory), 'utf8');
{
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/d.ts' },
    session_id: sessionId,
  };
  const result = await runHook(payload, testEnv);
  const nudgeFired =
    result.stdout.includes('[delegation-coach]') && result.stdout.includes('haiku-explorer');
  assert(
    'Test 1 — multi-file-scan fires nudge',
    result.exitCode === 0 && nudgeFired,
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout.slice(0, 300))} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 2: single Read with empty history → no nudge ────────────────────────
{
  const freshSession = 'test-session-fresh';
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/one.ts' },
    session_id: freshSession,
  };
  const result = await runHook(payload, testEnv);
  assert(
    'Test 2 — first Read → no nudge',
    result.exitCode === 0 && result.stdout.trim() === '',
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout)}`,
  );
}

// ── Test 3: OUROBOROS_INTERNAL=1 → silent exit 0, no nudge, no JSONL write ───
writeFileSync(historyPath, JSON.stringify(priorHistory), 'utf8');
{
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/e.ts' },
    session_id: sessionId,
  };
  const jsonlPath = join(userDataDir, 'delegation-coach.jsonl');
  const linesBefore = existsSync(jsonlPath)
    ? readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  const result = await runHook(payload, { ...testEnv, OUROBOROS_INTERNAL: '1' });

  const linesAfter = existsSync(jsonlPath)
    ? readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  assert(
    'Test 3 — OUROBOROS_INTERNAL=1 → no nudge, no JSONL write',
    result.exitCode === 0 && result.stdout.trim() === '' && linesAfter === linesBefore,
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout)} jsonl delta=${linesAfter - linesBefore}`,
  );
}

// ── Test 4: JSONL line appended with correct shape ────────────────────────────
// Use a fresh session ID so cooldown from Test 1 doesn't suppress the match.
const jsonlSession = 'test-session-jsonl';
const jsonlHistoryPath = join(stateDir, `coach-history-${jsonlSession}.json`);
writeFileSync(
  jsonlHistoryPath,
  JSON.stringify(priorHistory.map((e) => ({ ...e, sessionId: jsonlSession }))),
  'utf8',
);
{
  const jsonlPath = join(userDataDir, 'delegation-coach.jsonl');
  const linesBefore = existsSync(jsonlPath)
    ? readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/f.ts' },
    session_id: jsonlSession,
  };
  const result = await runHook(payload, testEnv);

  const linesAfter = existsSync(jsonlPath)
    ? readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean).length
    : 0;

  const newLines = linesAfter - linesBefore;
  let validEntry = false;
  if (newLines > 0) {
    try {
      const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
      const last = JSON.parse(lines[lines.length - 1]);
      validEntry =
        last.patternId === 'multi-file-scan-no-edit' &&
        last.outcome === 'pending' &&
        typeof last.nudgeId === 'string' &&
        last.sessionId === jsonlSession;
    } catch {
      /* validEntry stays false */
    }
  }

  assert(
    'Test 4 — JSONL line appended with correct shape',
    result.exitCode === 0 && newLines >= 1 && validEntry,
    `exitCode=${result.exitCode} newLines=${newLines} validEntry=${validEntry}`,
  );
}

// ── Test 5: empty stdin → exit 0, no output ──────────────────────────────────
{
  const result = await runHookRaw('', testEnv);
  assert(
    'Test 5 — empty stdin → exit 0, no output',
    result.exitCode === 0 && result.stdout.trim() === '',
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout)}`,
  );
}

// ── Test 6: test-first-violation pattern fires ────────────────────────────────
{
  const tddSession = 'test-session-tdd';
  const tddHistoryPath = join(stateDir, `coach-history-${tddSession}.json`);
  const tddHistory = [
    {
      tool: 'Read',
      input: { file_path: '/repo/foo.test.ts' },
      timestamp: now - 10000,
      sessionId: tddSession,
    },
  ];
  writeFileSync(tddHistoryPath, JSON.stringify(tddHistory), 'utf8');

  const payload = {
    tool_name: 'Edit',
    tool_input: { file_path: '/repo/foo.ts' },
    session_id: tddSession,
  };
  const result = await runHook(payload, testEnv);
  const nudgeFired =
    result.stdout.includes('[delegation-coach]') &&
    result.stdout.includes('test-driven-development');
  assert(
    'Test 6 — test-first-violation fires nudge',
    result.exitCode === 0 && nudgeFired,
    `exitCode=${result.exitCode} stdout=${JSON.stringify(result.stdout.slice(0, 300))} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {
  /* best-effort in tests */
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nSmoke test results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All smoke tests passed.');
process.exit(0);

// ── Helpers ───────────────────────────────────────────────────────────────────

function runHook(payload, extraEnv = {}) {
  return runHookRaw(JSON.stringify(payload), extraEnv);
}

function runHookRaw(stdinStr, extraEnv = {}) {
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

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });

    child.stdin.write(stdinStr);
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

function fail(msg) {
  console.error(`FATAL: ${msg}`);
  process.exit(1);
}
