#!/usr/bin/env node
// Wave 92 Phase 3 — orchestrator-owned acceptance test for `npm run lockfile:sync`.
//
// This file is the boundary contract for Phase 3 per
// `~/.claude/rules/orchestrator-owned-acceptance-tests.md`. The subagent
// implementing Phase 3 may NOT modify this file. It implements until this test
// passes.
//
// Ported from Gamify Wave 9 Phase 2's acceptance test (the canonical
// implementation). Adaptations: Wave 92 Phase 3 numbering; Node 20.20.2 pin;
// $HOME/lockgen/agent-ide subdir; references to wave-92 docs.
//
// Contract being tested (from `roadmap/wave-92-cross-platform-lockfile-stryker/
// waveplan-92.md` + `wave-92-decisions.md` Decisions 1, 2, 3, 4):
//
//   1. Root `package.json` exposes a `lockfile:sync` script.
//   2. Running `npm run lockfile:sync` from the repo root on Windows:
//      a. Exits 0.
//      b. Produces a `package-lock.json` that passes the structural smoke
//         (`scripts/lockfile-smoke.mjs`) — all platform-specific package
//         families have win32 + linux + darwin entries.
//      c. Writes a provenance marker at `.lockfile-sync.marker` (repo root)
//         containing JSON with at least these keys:
//           - `lockfileSha256` (string, 64 lowercase hex characters)
//           - `generatedAt`    (string, ISO-8601 timestamp)
//           - `generatedBy`    (string, exactly "lockfile:sync")
//      d. `marker.lockfileSha256` matches sha256(package-lock.json) — i.e. the
//         marker is bound to the lockfile content it was generated against.
//      e. The Windows-side `node_modules/` tree is NOT touched — top-level
//         directory mtime unchanged across the run (if it existed before;
//         must remain absent if it didn't exist before).
//      f. No stray entries appear in the repo working tree besides
//         `.lockfile-sync.marker` (the "tilde-not-expanded-in-bash" trap).
//
// This test is intentionally environment-coupled — it requires WSL2 to be set
// up on the host (Ubuntu, nvm, Node 20.20.2, ~/lockgen/agent-ide/ on ext4).
// That is the runtime environment Phase 3's wrapper targets; the test runs
// in the same place.
//
// Usage:
//   node scripts/wave-92-phase-3.acceptance.mjs
//
// Exit 0 = all assertions passed. Exit 1 = at least one assertion failed.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const PKG_JSON_PATH = resolve(REPO_ROOT, 'package.json');
const LOCK_PATH = resolve(REPO_ROOT, 'package-lock.json');
const MARKER_PATH = resolve(REPO_ROOT, '.lockfile-sync.marker');
const NODE_MODULES_PATH = resolve(REPO_ROOT, 'node_modules');
const SMOKE_SCRIPT = resolve(SCRIPT_DIR, 'lockfile-smoke.mjs');

const failures = [];
const successes = [];

function assert(ok, msg) {
  if (ok) successes.push(msg);
  else failures.push(msg);
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

function dirMtimeMs(p) {
  return existsSync(p) ? statSync(p).mtimeMs : null;
}

function report() {
  console.log('');
  console.log('=== Wave 92 Phase 3 acceptance test ===');
  for (const s of successes) console.log(`  ok   ${s}`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log('');
  console.log(`${successes.length} passed, ${failures.length} failed`);
}

// --- Step 1: lockfile:sync script must exist in root package.json ---
const pkg = JSON.parse(readFileSync(PKG_JSON_PATH, 'utf8'));
const hasScript =
  typeof pkg.scripts?.['lockfile:sync'] === 'string' &&
  pkg.scripts['lockfile:sync'].trim().length > 0;
assert(hasScript, 'root package.json defines a non-empty `lockfile:sync` script');

if (!hasScript) {
  report();
  process.exit(failures.length === 0 ? 0 : 1);
}

// --- Step 2: snapshot pre-run state ---
const nodeModulesExistedBefore = existsSync(NODE_MODULES_PATH);
const nodeModulesMtimeBefore = dirMtimeMs(NODE_MODULES_PATH);
const repoEntriesBefore = new Set(readdirSync(REPO_ROOT));

// --- Step 3: run `npm run lockfile:sync` ---
// shell: true required on Windows for .cmd shim launchers (Node 18.20+ CVE-2024-27980
// hardening — spawn cannot exec .cmd directly without going through cmd.exe).
console.error(
  '[acceptance] running `npm run lockfile:sync` — this takes ~2–3 min on a warm-cache run...',
);
const runStart = Date.now();
const proc = spawnSync('npm run lockfile:sync', {
  cwd: REPO_ROOT,
  shell: true,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: false,
});
const runMs = Date.now() - runStart;
console.error(`[acceptance] lockfile:sync exited ${proc.status} in ${(runMs / 1000).toFixed(1)}s`);

assert(proc.status === 0, `lockfile:sync exits 0 (got ${proc.status})`);

// --- Step 4: marker file exists and parses ---
assert(existsSync(MARKER_PATH), `.lockfile-sync.marker exists at repo root`);

let marker = null;
if (existsSync(MARKER_PATH)) {
  try {
    marker = JSON.parse(readFileSync(MARKER_PATH, 'utf8'));
    assert(true, '.lockfile-sync.marker is valid JSON');
  } catch (err) {
    assert(false, `.lockfile-sync.marker is valid JSON (parse error: ${err.message})`);
  }
}

if (marker) {
  assert(
    typeof marker.lockfileSha256 === 'string' && /^[0-9a-f]{64}$/.test(marker.lockfileSha256),
    `marker.lockfileSha256 is 64 lowercase hex chars (got ${typeof marker.lockfileSha256 === 'string' ? marker.lockfileSha256.slice(0, 20) + '…' : typeof marker.lockfileSha256})`,
  );
  assert(
    typeof marker.generatedAt === 'string' && !Number.isNaN(Date.parse(marker.generatedAt)),
    `marker.generatedAt is a parseable ISO timestamp (got ${marker.generatedAt})`,
  );
  assert(
    marker.generatedBy === 'lockfile:sync',
    `marker.generatedBy is exactly "lockfile:sync" (got ${JSON.stringify(marker.generatedBy)})`,
  );
}

// --- Step 5: marker hash matches lockfile content ---
if (marker && existsSync(LOCK_PATH)) {
  const actualHash = sha256File(LOCK_PATH);
  assert(
    actualHash === marker.lockfileSha256,
    `sha256(package-lock.json) matches marker.lockfileSha256 (actual ${actualHash.slice(0, 16)}…, marker ${(marker.lockfileSha256 || '').slice(0, 16)}…)`,
  );
}

// --- Step 6: lockfile smokes clean ---
if (existsSync(LOCK_PATH)) {
  const smoke = spawnSync('node', [SMOKE_SCRIPT, LOCK_PATH], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert(
    smoke.status === 0,
    `scripts/lockfile-smoke.mjs returns 0 against the regenerated package-lock.json (exit ${smoke.status})`,
  );
  if (smoke.status !== 0) {
    console.error('--- smoke stderr ---');
    console.error(smoke.stderr?.toString() ?? '(none)');
  }
}

// --- Step 7: node_modules untouched ---
const nodeModulesExistsAfter = existsSync(NODE_MODULES_PATH);
const nodeModulesMtimeAfter = dirMtimeMs(NODE_MODULES_PATH);
if (nodeModulesExistedBefore) {
  assert(
    nodeModulesExistsAfter && nodeModulesMtimeBefore === nodeModulesMtimeAfter,
    `node_modules/ mtime unchanged across the run (before ${nodeModulesMtimeBefore}, after ${nodeModulesMtimeAfter})`,
  );
} else {
  assert(
    !nodeModulesExistsAfter,
    `node_modules/ remained absent (existed-after: ${nodeModulesExistsAfter})`,
  );
}

// --- Step 8: no stray files or dirs created in the repo working tree ---
// Catches the "tilde-not-expanded-in-bash" failure mode where lockfile:sync
// runs `mkdir -p "~/lockgen/..."` inside bash -lc and bash treats the literal
// "~" as a directory name in the cwd (which on `wsl.exe -e bash -lc` from a
// Windows cwd is /mnt/c/Web App/Agent IDE/). Result: a literal "~" dir gets
// created in the repo, containing the whole WSL2 lockgen state — directly
// violating ADR Decision 1 ("never against /mnt/c"). Use $HOME inside bash
// command strings.
const repoEntriesAfter = new Set(readdirSync(REPO_ROOT));
const newEntries = [...repoEntriesAfter].filter((e) => !repoEntriesBefore.has(e));
const allowedNewEntries = new Set(['.lockfile-sync.marker']);
const strayEntries = newEntries.filter((e) => !allowedNewEntries.has(e));
assert(
  strayEntries.length === 0,
  `no stray entries created in repo working tree (found: ${JSON.stringify(strayEntries)})`,
);

report();
process.exit(failures.length === 0 ? 0 : 1);
