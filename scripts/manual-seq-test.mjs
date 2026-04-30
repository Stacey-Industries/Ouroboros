/**
 * One-shot manual sequence verification: nudge → PostToolUse → SubagentStop
 * Used for Phase D manual smoke verification. Not part of the test suite.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const tmpBase = mkdtempSync(join(tmpdir(), 'coach-manual-'));
const userDataDir = join(tmpBase, 'userData');
const stateDir = join(tmpBase, 'state');
mkdirSync(userDataDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const hooksRoot = join(process.env.USERPROFILE || process.env.HOME || '', '.claude', 'hooks');
const coachHook = join(hooksRoot, 'delegation_coach.mjs');
const postHook = join(hooksRoot, 'delegation_coach_post.mjs');
const stopHook = join(hooksRoot, 'delegation_coach_subagent_stop.mjs');

const env = {
  ...process.env,
  COACH_USERDATA_OVERRIDE: userDataDir,
  COACH_STATE_OVERRIDE: stateDir,
};

const now = Date.now();
const sid = 'manual-seq';

const history = [
  { tool: 'Read', input: { file_path: '/repo/a.ts' }, timestamp: now - 50000, sessionId: sid },
  { tool: 'Read', input: { file_path: '/repo/b.ts' }, timestamp: now - 40000, sessionId: sid },
  { tool: 'Read', input: { file_path: '/repo/c.ts' }, timestamp: now - 30000, sessionId: sid },
];
writeFileSync(join(stateDir, `coach-history-${sid}.json`), JSON.stringify(history), 'utf8');

function runHookSync(hookPath, payload) {
  const r = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  return { exitCode: r.status ?? 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function readJsonl() {
  const p = join(userDataDir, 'delegation-coach.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
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

const r1 = runHookSync(coachHook, {
  tool_name: 'Read',
  tool_input: { file_path: '/repo/trigger.ts' },
  session_id: sid,
});
const after1 = readJsonl();
const pending = after1.find((e) => e.outcome === 'pending');
console.log(
  `[Step 1] PreToolUse exitCode=${r1.exitCode} JSONL pending nudgeId=${pending?.nudgeId ?? 'NONE'}`,
);
if (r1.stderr.trim()) console.log('  stderr:', r1.stderr.trim().slice(0, 200));

const r2 = runHookSync(postHook, {
  tool_name: 'Agent',
  tool_input: { subagent_type: 'haiku-explorer', description: 'find callers' },
  session_id: sid,
});
const after2 = readJsonl();
const taken = after2.find((e) => e.outcome === 'taken');
console.log(
  `[Step 2] PostToolUse exitCode=${r2.exitCode} JSONL taken nudgeId=${taken?.nudgeId ?? 'NONE'}`,
);
if (r2.stderr.trim()) console.log('  stderr:', r2.stderr.trim().slice(0, 200));

const r3 = runHookSync(stopHook, { session_id: sid });
const after3 = readJsonl();
const success = after3.find((e) => e.outcome === 'taken-success');
console.log(
  `[Step 3] SubagentStop exitCode=${r3.exitCode} JSONL taken-success nudgeId=${success?.nudgeId ?? 'NONE'}`,
);
if (r3.stderr.trim()) console.log('  stderr:', r3.stderr.trim().slice(0, 200));

const allSame =
  pending &&
  taken &&
  success &&
  pending.nudgeId === taken.nudgeId &&
  taken.nudgeId === success.nudgeId;

console.log('');
console.log(`Total JSONL entries: ${after3.length}`);
console.log(`NudgeIds chain: ${allSame ? 'YES (all match)' : 'NO'}`);
after3.forEach((e, i) => {
  console.log(`  [${i}] outcome=${e.outcome} nudgeId=${e.nudgeId} kind=${e.meta?.kind ?? 'N/A'}`);
});
console.log('');
console.log(allSame && after3.length >= 3 ? 'Manual sequence PASSED' : 'Manual sequence FAILED');

try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {
  /* best-effort */
}
