/**
 * test-coach-hook-d.mjs — Phase D smoke tests for delegation coach outcome tracking.
 *
 * Tests:
 *   1. Soft nudge fires → coach-pending-{sessionId}.json written with unjoined entry.
 *   2. PostToolUse Agent within 30s of nudge → join happens, JSONL has outcome:taken,
 *      pending entry marked joined, dispatch file written.
 *   3. PostToolUse Agent with NO pending nudge in window → no JSONL write.
 *   4. PostToolUse Agent with OUROBOROS_INTERNAL=1 → silent exit, no writes.
 *   5. SubagentStop after dispatch → JSONL has outcome:taken-success, dispatch file deleted.
 *   6. SubagentStop after failed dispatch → JSONL has outcome:taken-failure.
 *   7. SubagentStop with no recent dispatch → silent exit, no JSONL write.
 *   8. Full sequence: nudge → PostToolUse dispatch → SubagentStop → 3 JSONL entries.
 *
 * Run:
 *   node scripts/test-coach-hook-d.mjs
 *
 * Exits 0 on all pass, 1 on any failure.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

// ── Hook paths ─────────────────────────────────────────────────────────────────
const hooksRoot = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'hooks');
const coachHookPath = join(hooksRoot, 'delegation_coach.mjs');
const postHookPath = join(hooksRoot, 'delegation_coach_post.mjs');
const stopHookPath = join(hooksRoot, 'delegation_coach_subagent_stop.mjs');

for (const [label, p] of [
  ['delegation_coach.mjs', coachHookPath],
  ['delegation_coach_post.mjs', postHookPath],
  ['delegation_coach_subagent_stop.mjs', stopHookPath],
]) {
  if (!existsSync(p)) fail(`Hook not found: ${label} at ${p}`);
}

// ── Shared setup ───────────────────────────────────────────────────────────────
const tmpBase = mkdtempSync(join(tmpdir(), 'coach-d-test-'));
const userDataDir = join(tmpBase, 'userData');
const stateDir = join(tmpBase, 'state');
mkdirSync(userDataDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const baseEnv = {
  COACH_USERDATA_OVERRIDE: userDataDir,
  COACH_STATE_OVERRIDE: stateDir,
};

const jsonlPath = join(userDataDir, 'delegation-coach.jsonl');
const now = Date.now();

let passed = 0;
let failed = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────

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

async function fireNudge(sessionId) {
  const historyPath = join(stateDir, `coach-history-${sessionId}.json`);
  const history = [
    { tool: 'Read', input: { file_path: '/repo/a.ts' }, timestamp: now - 50000, sessionId },
    { tool: 'Read', input: { file_path: '/repo/b.ts' }, timestamp: now - 40000, sessionId },
    { tool: 'Read', input: { file_path: '/repo/c.ts' }, timestamp: now - 30000, sessionId },
  ];
  writeFileSync(historyPath, JSON.stringify(history), 'utf8');
  const payload = {
    tool_name: 'Read',
    tool_input: { file_path: '/repo/trigger.ts' },
    session_id: sessionId,
  };
  return runHook(coachHookPath, payload, baseEnv);
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

// ── Test 1: Soft nudge fires → pending-nudges file written ────────────────────
{
  const sid = 'test-d-1';
  const result = await fireNudge(sid);
  const pendingPath = join(stateDir, `coach-pending-${sid}.json`);

  let hasPending = false;
  if (existsSync(pendingPath)) {
    try {
      const raw = JSON.parse(readFileSync(pendingPath, 'utf8'));
      const entries = raw?.pendingNudges ?? [];
      hasPending =
        entries.length > 0 &&
        typeof entries[0].nudgeId === 'string' &&
        entries[0].joined === false &&
        entries[0].patternId === 'multi-file-scan-no-edit';
    } catch {
      /* hasPending stays false */
    }
  }

  assert(
    'Test 1 — nudge fires → pending-nudges file written with unjoined entry',
    result.exitCode === 0 && hasPending,
    `exitCode=${result.exitCode} hasPending=${hasPending} stderr=${result.stderr.slice(0, 300)}`,
  );
}

// ── Test 2: PostToolUse Agent within 30s → join happens ───────────────────────
{
  const sid = 'test-d-2';
  await fireNudge(sid);
  const pendingPath = join(stateDir, `coach-pending-${sid}.json`);
  const linesBefore = readJsonl().length;

  const agentPayload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'haiku-explorer', description: 'find usages' },
    session_id: sid,
  };
  const result = await runHook(postHookPath, agentPayload, baseEnv);

  const allEntries = readJsonl();
  const newEntries = allEntries.slice(linesBefore);
  const outcomeEntry = newEntries.find((e) => e.outcome === 'taken');

  let dispatchFileCount = 0;
  try {
    dispatchFileCount = readdirSync(stateDir).filter((f) =>
      f.startsWith(`coach-dispatch-${sid}-`),
    ).length;
  } catch {
    /* stays 0 */
  }

  let pendingMarkedJoined = false;
  if (existsSync(pendingPath)) {
    try {
      const raw = JSON.parse(readFileSync(pendingPath, 'utf8'));
      const entries = raw?.pendingNudges ?? [];
      pendingMarkedJoined = entries.some((n) => n.joined === true);
    } catch {
      /* stays false */
    }
  }

  assert(
    'Test 2 — PostToolUse Agent within 30s → outcome:taken appended, pending marked joined, dispatch file written',
    result.exitCode === 0 &&
      outcomeEntry?.outcome === 'taken' &&
      outcomeEntry?.meta?.kind === 'outcome-update' &&
      outcomeEntry?.meta?.linkedSubagentType === 'haiku-explorer' &&
      pendingMarkedJoined &&
      dispatchFileCount >= 1,
    `exitCode=${result.exitCode} outcomeEntry=${JSON.stringify(outcomeEntry)} pendingJoined=${pendingMarkedJoined} dispatchFiles=${dispatchFileCount} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 3: PostToolUse Agent with no pending nudge in window → no JSONL write ─
{
  const sid = 'test-d-3-nopending';
  const linesBefore = readJsonl().length;

  const agentPayload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'sonnet-explorer', description: 'explore' },
    session_id: sid,
  };
  const result = await runHook(postHookPath, agentPayload, baseEnv);
  const linesAfter = readJsonl().length;

  assert(
    'Test 3 — PostToolUse Agent with no pending nudge → no JSONL write',
    result.exitCode === 0 && linesAfter === linesBefore,
    `exitCode=${result.exitCode} delta=${linesAfter - linesBefore} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 4: PostToolUse Agent with OUROBOROS_INTERNAL=1 → silent exit ─────────
{
  const sid = 'test-d-4';
  await fireNudge(sid);
  const linesBefore = readJsonl().length;

  const agentPayload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'haiku-explorer', description: 'explore' },
    session_id: sid,
  };
  const result = await runHook(postHookPath, agentPayload, { ...baseEnv, OUROBOROS_INTERNAL: '1' });
  const linesAfter = readJsonl().length;

  assert(
    'Test 4 — OUROBOROS_INTERNAL=1 → silent exit, no writes',
    result.exitCode === 0 && linesAfter === linesBefore && result.stdout.trim() === '',
    `exitCode=${result.exitCode} delta=${linesAfter - linesBefore} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 5: SubagentStop after dispatch → taken-success, dispatch file deleted ─
{
  const sid = 'test-d-5';
  const dispatchTs = Date.now();
  const dispatchFile = join(stateDir, `coach-dispatch-${sid}-${dispatchTs}.json`);
  writeFileSync(
    dispatchFile,
    JSON.stringify({
      nudgeId: 'abc123nudge',
      patternId: 'multi-file-scan-no-edit',
      subagentType: 'haiku-explorer',
      dispatchedAt: dispatchTs - 5000,
    }),
    'utf8',
  );

  const linesBefore = readJsonl().length;
  const stopPayload = { session_id: sid };
  const result = await runHook(stopHookPath, stopPayload, baseEnv);

  const newEntries = readJsonl().slice(linesBefore);
  const completionEntry = newEntries.find((e) => e.meta?.kind === 'subagent-completion');

  assert(
    'Test 5 — SubagentStop after dispatch → taken-success, dispatch file deleted',
    result.exitCode === 0 &&
      completionEntry?.outcome === 'taken-success' &&
      completionEntry?.nudgeId === 'abc123nudge' &&
      completionEntry?.meta?.subagentType === 'haiku-explorer' &&
      !existsSync(dispatchFile),
    `exitCode=${result.exitCode} entry=${JSON.stringify(completionEntry)} dispatchExists=${existsSync(dispatchFile)} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 6: SubagentStop after failed dispatch → taken-failure ─────────────────
{
  const sid = 'test-d-6';
  const dispatchTs = Date.now();
  const dispatchFile = join(stateDir, `coach-dispatch-${sid}-${dispatchTs}.json`);
  writeFileSync(
    dispatchFile,
    JSON.stringify({
      nudgeId: 'failnudge1',
      patternId: 'multi-file-scan-no-edit',
      subagentType: 'sonnet-implementer',
      dispatchedAt: dispatchTs - 3000,
    }),
    'utf8',
  );

  const linesBefore = readJsonl().length;
  const stopPayload = { session_id: sid, error: 'subagent timed out' };
  const result = await runHook(stopHookPath, stopPayload, baseEnv);

  const newEntries = readJsonl().slice(linesBefore);
  const completionEntry = newEntries.find((e) => e.meta?.kind === 'subagent-completion');

  assert(
    'Test 6 — SubagentStop with error → taken-failure',
    result.exitCode === 0 && completionEntry?.outcome === 'taken-failure',
    `exitCode=${result.exitCode} entry=${JSON.stringify(completionEntry)} stderr=${result.stderr.slice(0, 200)}`,
  );
}

// ── Test 7: SubagentStop with no recent dispatch → silent exit ─────────────────
{
  const sid = 'test-d-7-nodispatch';
  const linesBefore = readJsonl().length;

  const stopPayload = { session_id: sid };
  const result = await runHook(stopHookPath, stopPayload, baseEnv);
  const linesAfter = readJsonl().length;

  assert(
    'Test 7 — SubagentStop with no recent dispatch → silent exit, no JSONL write',
    result.exitCode === 0 && linesAfter === linesBefore,
    `exitCode=${result.exitCode} delta=${linesAfter - linesBefore}`,
  );
}

// ── Test 8: Full sequence — nudge → PostToolUse → SubagentStop → 3 entries ────
{
  const sid = 'test-d-8-full';

  // Step 1: fire nudge
  await fireNudge(sid);
  const afterNudge = readJsonl();
  const pendingEntry = afterNudge
    .filter((e) => e.sessionId === sid && e.outcome === 'pending')
    .pop();

  // Step 2: PostToolUse Agent → outcome:taken + dispatch file
  const agentPayload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'haiku-explorer', description: 'find symbols' },
    session_id: sid,
  };
  await runHook(postHookPath, agentPayload, baseEnv);
  const afterPost = readJsonl();
  const takenEntry = afterPost.filter((e) => e.sessionId === sid && e.outcome === 'taken').pop();

  // Step 3: SubagentStop → outcome:taken-success
  const stopPayload = { session_id: sid };
  await runHook(stopHookPath, stopPayload, baseEnv);
  const afterStop = readJsonl();
  const successEntry = afterStop
    .filter((e) => e.sessionId === sid && e.outcome === 'taken-success')
    .pop();

  // All three entries should share the same nudgeId
  const nudgeIdsMatch =
    pendingEntry &&
    takenEntry &&
    successEntry &&
    pendingEntry.nudgeId === takenEntry.nudgeId &&
    takenEntry.nudgeId === successEntry.nudgeId;

  assert(
    'Test 8 — full sequence: pending → taken → taken-success with matching nudgeIds',
    pendingEntry?.outcome === 'pending' &&
      takenEntry?.outcome === 'taken' &&
      successEntry?.outcome === 'taken-success' &&
      nudgeIdsMatch,
    `pending=${pendingEntry?.nudgeId} taken=${takenEntry?.nudgeId} success=${successEntry?.nudgeId}`,
  );
}

// ── Cleanup ────────────────────────────────────────────────────────────────────
try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {
  /* best-effort */
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\nPhase D smoke results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All Phase D smoke tests passed.');
process.exit(0);
