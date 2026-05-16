#!/usr/bin/env node
// Wave 92 Phase 4 — orchestrator-owned acceptance test for the pre-push
// lockfile guard + CI canary.
//
// This file is the boundary contract for Phase 4 per
// `~/.claude/rules/orchestrator-owned-acceptance-tests.md`. The subagent
// implementing Phase 4 may NOT modify this file. It implements until this test
// passes.
//
// Ported from Gamify Wave 9 Phase 3's acceptance test (the canonical
// implementation). Adaptations: Wave 92 Phase 4 numbering; CI workflow shape
// reflects Agent IDE's 3-OS matrix (Gamify is Ubuntu-only).
//
// Contract being tested (per waveplan-92.md Phase 4 + wave-92-decisions.md D4):
//
//   1. Root package.json exposes a `lockfile:check` script.
//   2. `npm run lockfile:check` validates the current package-lock.json against
//      .lockfile-sync.marker — both must be present and the marker's
//      `lockfileSha256` must equal sha256(package-lock.json). Otherwise exit
//      non-zero with a message naming `npm run lockfile:sync`.
//      a. Marker exists + hash matches → exit 0, silent or near-silent.
//      b. Marker missing → exit non-zero; stderr mentions "lockfile:sync".
//      c. Marker exists but hash mismatch → exit non-zero; stderr mentions
//         "lockfile:sync".
//   3. Advisory bypass: if env `LOCKFILE_SYNC_GUARD_BYPASS=1` is set, exit 0
//      regardless of marker state (Decision 4 — guard ships advisory-tunable).
//   4. A pre-push hook entry point exists at `scripts/hooks/pre-push` — file
//      present, has a shebang line.
//   5. CI canary: `.github/workflows/ci.yml` contains a step that runs either
//      `scripts/lockfile-smoke.mjs` or `npm run lockfile:check` (the exact
//      surface is implementer's choice, but evidence of structural validation
//      must be in the workflow).
//
// The test snapshots package-lock.json + .lockfile-sync.marker before mutating
// them per scenario, and restores both at end. It does NOT invoke `git push`
// directly — that requires a configured remote and is environment-coupled
// beyond what's worth automating here. The end-to-end push behavior is
// verified manually by the orchestrator at wave-end.
//
// Usage:
//   node scripts/wave-92-phase-4.acceptance.mjs
//
// Exit 0 = all assertions passed. Exit 1 = at least one assertion failed.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const LOCK_PATH = resolve(REPO_ROOT, 'package-lock.json');
const MARKER_PATH = resolve(REPO_ROOT, '.lockfile-sync.marker');
const HOOK_PATH = resolve(REPO_ROOT, 'scripts', 'hooks', 'pre-push');
const CI_WORKFLOW = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml');

const failures = [];
const successes = [];
let scenariosRan = false;

function assert(ok, msg) {
  if (ok) successes.push(msg);
  else failures.push(msg);
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

function runCheck({ env = {} } = {}) {
  return spawnSync('npm run lockfile:check', {
    cwd: REPO_ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
}

function report() {
  console.log('');
  console.log('=== Wave 92 Phase 4 acceptance test ===');
  for (const s of successes) console.log(`  ok   ${s}`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log('');
  console.log(
    `${successes.length} passed, ${failures.length} failed${scenariosRan ? '' : ' (some scenarios skipped due to setup failure)'}`,
  );
}

// --- Step 1: lockfile:check script must exist in root package.json ---
const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
const hasScript =
  typeof pkg.scripts?.['lockfile:check'] === 'string' &&
  pkg.scripts['lockfile:check'].trim().length > 0;
assert(hasScript, 'root package.json defines a non-empty `lockfile:check` script');

if (!hasScript) {
  report();
  process.exit(failures.length === 0 ? 0 : 1);
}

// --- Snapshot + restore plumbing ---
const lockBackup = existsSync(LOCK_PATH) ? readFileSync(LOCK_PATH) : null;
const markerBackup = existsSync(MARKER_PATH) ? readFileSync(MARKER_PATH) : null;

try {
  if (!lockBackup) {
    assert(false, 'package-lock.json exists at repo root (required for scenario setup)');
    throw new Error('cannot proceed without package-lock.json');
  }

  // --- Scenario 2a: marker matches → exit 0 ---
  {
    const sha = sha256File(LOCK_PATH);
    const marker = {
      lockfileSha256: sha,
      generatedAt: new Date().toISOString(),
      generatedBy: 'lockfile:sync',
    };
    writeFileSync(MARKER_PATH, JSON.stringify(marker, null, 2) + '\n');
    const r = runCheck();
    assert(
      r.status === 0,
      `scenario 2a (marker matches): exit 0 (got ${r.status}; stderr: ${(r.stderr ?? '').toString().slice(0, 200)})`,
    );
  }

  // --- Scenario 2b: marker missing → exit non-zero, mentions lockfile:sync ---
  {
    rmSync(MARKER_PATH, { force: true });
    const r = runCheck();
    const stderr = (r.stderr ?? '').toString();
    const stdout = (r.stdout ?? '').toString();
    const output = stderr + stdout;
    assert(r.status !== 0, `scenario 2b (marker missing): exit non-zero (got ${r.status})`);
    assert(
      /lockfile:sync/.test(output),
      `scenario 2b: output mentions "lockfile:sync" (got: ${output.slice(0, 200)})`,
    );
  }

  // --- Scenario 2c: marker exists but hash mismatch → exit non-zero ---
  {
    const wrongMarker = {
      lockfileSha256: '0'.repeat(64),
      generatedAt: new Date().toISOString(),
      generatedBy: 'lockfile:sync',
    };
    writeFileSync(MARKER_PATH, JSON.stringify(wrongMarker, null, 2) + '\n');
    const r = runCheck();
    const output = (r.stderr ?? '').toString() + (r.stdout ?? '').toString();
    assert(r.status !== 0, `scenario 2c (hash mismatch): exit non-zero (got ${r.status})`);
    assert(
      /lockfile:sync/.test(output),
      `scenario 2c: output mentions "lockfile:sync" (got: ${output.slice(0, 200)})`,
    );
  }

  // --- Scenario 3: bypass env → exit 0 even with marker missing ---
  {
    rmSync(MARKER_PATH, { force: true });
    const r = runCheck({ env: { LOCKFILE_SYNC_GUARD_BYPASS: '1' } });
    assert(
      r.status === 0,
      `scenario 3 (LOCKFILE_SYNC_GUARD_BYPASS=1, marker missing): exit 0 (got ${r.status})`,
    );
  }

  scenariosRan = true;
} finally {
  if (lockBackup !== null) writeFileSync(LOCK_PATH, lockBackup);
  if (markerBackup !== null) writeFileSync(MARKER_PATH, markerBackup);
  else if (existsSync(MARKER_PATH)) rmSync(MARKER_PATH, { force: true });
}

// --- Step 4: pre-push hook entry point exists ---
assert(existsSync(HOOK_PATH), `pre-push hook entry exists at scripts/hooks/pre-push`);
if (existsSync(HOOK_PATH)) {
  const hookContent = readFileSync(HOOK_PATH, 'utf8');
  assert(
    hookContent.startsWith('#!'),
    `pre-push hook starts with a shebang line (got: ${hookContent.slice(0, 80)})`,
  );
}

// --- Step 5: CI canary present in ci.yml ---
if (existsSync(CI_WORKFLOW)) {
  const ci = readFileSync(CI_WORKFLOW, 'utf8');
  const hasSmokeRef = /lockfile-smoke\.mjs/.test(ci);
  const hasCheckRef = /lockfile:check/.test(ci);
  assert(
    hasSmokeRef || hasCheckRef,
    `.github/workflows/ci.yml contains a step running lockfile-smoke.mjs OR lockfile:check`,
  );
} else {
  assert(false, `.github/workflows/ci.yml exists`);
}

report();
process.exit(failures.length === 0 ? 0 : 1);
