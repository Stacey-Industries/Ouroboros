#!/usr/bin/env node
// Wave 92 Phase 7 — orchestrator-owned acceptance test for the Stryker CI workflow.
//
// This file is the boundary contract for Phase 7 per
// `~/.claude/rules/orchestrator-owned-acceptance-tests.md`. The subagent
// implementing Phase 7 may NOT modify this file. It implements until this test
// passes.
//
// Contract being tested (per waveplan-92.md Phase 7 + wave-92-decisions.md D7):
//
//   1. `.github/workflows/ci-stryker.yml` exists at the canonical path.
//   2. Workflow is valid YAML.
//   3. Workflow has top-level `on:` triggers: pull_request, push (to master),
//      and schedule.
//   4. Two jobs declared: `mutation-incremental` and `mutation-full`.
//      a. mutation-incremental has `if:` condition restricting to
//         pull_request OR push events.
//      b. mutation-full has `if:` condition restricting to schedule event.
//   5. Both jobs install dependencies AND run Stryker.
//      a. mutation-incremental runs `stryker run --incremental`.
//      b. mutation-full runs `stryker run --force`.
//   6. Both jobs pin Node 20 (Agent IDE's engine pin).
//   7. The workflow uses `npm ci --ignore-scripts` (Agent IDE pattern, mirrors
//      the existing ci.yml) followed by explicit electron binary install,
//      because the full postinstall would run electron-rebuild needlessly for
//      a mutation testing job that doesn't exercise native bindings.
//
// This is a STATIC validation test — it parses ci-stryker.yml and inspects its
// structure. It does NOT trigger a live workflow run; that happens manually at
// wave-end (Phase 9) by opening a test PR and confirming both jobs fire.
//
// Usage:
//   node scripts/wave-92-phase-7.acceptance.mjs
//
// Exit 0 = all assertions passed. Exit 1 = at least one assertion failed.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const WORKFLOW_PATH = resolve(REPO_ROOT, '.github', 'workflows', 'ci-stryker.yml');

const failures = [];
const successes = [];

function assert(ok, msg) {
  if (ok) successes.push(msg);
  else failures.push(msg);
}

function report() {
  console.log('');
  console.log('=== Wave 92 Phase 7 acceptance test ===');
  for (const s of successes) console.log(`  ok   ${s}`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  console.log('');
  console.log(`${successes.length} passed, ${failures.length} failed`);
}

// --- Step 1: workflow file exists ---
assert(existsSync(WORKFLOW_PATH), `.github/workflows/ci-stryker.yml exists`);

if (!existsSync(WORKFLOW_PATH)) {
  report();
  process.exit(1);
}

const yamlText = readFileSync(WORKFLOW_PATH, 'utf8');

// --- Step 2: valid YAML (light heuristic — not a full parser, but catches obvious breaks) ---
// We don't pull in a YAML lib here to keep this script dependency-free. Instead,
// we check for the expected structural markers via regex. A real `actionlint`
// run is a CI concern, not an acceptance-test concern.
assert(
  /^name:\s+/m.test(yamlText) && /^on:\s*$/m.test(yamlText) && /^jobs:\s*$/m.test(yamlText),
  `workflow has top-level name:, on:, and jobs: keys`,
);

// --- Step 3: on: triggers ---
const onSection = yamlText.match(/^on:[\s\S]*?(?=^jobs:|\Z)/m)?.[0] ?? '';
assert(/pull_request:/.test(onSection), `on: has pull_request: trigger`);
assert(/push:/.test(onSection), `on: has push: trigger`);
assert(/schedule:/.test(onSection), `on: has schedule: trigger`);

// Push must be restricted to master (not main — Agent IDE uses master).
assert(
  /push:[\s\S]*?branches:[\s\S]*?-\s+master/.test(onSection),
  `on.push.branches includes master`,
);

// --- Step 4: two jobs declared ---
assert(/^\s+mutation-incremental:/m.test(yamlText), `mutation-incremental job declared`);
assert(/^\s+mutation-full:/m.test(yamlText), `mutation-full job declared`);

// 4a + 4b: if: conditions
// Section regex anchors at 2-space-indent job-key boundary so it captures the
// FULL job block (including nested `if:`, `steps:` etc.) rather than stopping
// at the first indented \w+: key. Boundary: next 2-space-indented identifier
// followed by colon, OR top-level key, OR end of file.
function jobSection(jobKey) {
  // Boundary: next 2-space-indented job key, OR a top-level key, OR end of
  // input. JS regex has no \Z anchor — use (?![\s\S]) (negative lookahead for
  // any character) to match end of input.
  const re = new RegExp(
    `^  ${jobKey}:[\\s\\S]*?(?=^  [a-z][a-z0-9_-]*:|^[a-z][a-z0-9_-]*:|(?![\\s\\S]))`,
    'm',
  );
  return yamlText.match(re)?.[0] ?? '';
}
const incrementalSection = jobSection('mutation-incremental');
const fullSection = jobSection('mutation-full');

assert(
  /if:[\s\S]*?(pull_request|push)/.test(incrementalSection),
  `mutation-incremental gated on pull_request OR push`,
);
assert(
  /if:[\s\S]*?schedule/.test(fullSection),
  `mutation-full gated on schedule event`,
);

// --- Step 5: Stryker invocations ---
assert(
  /stryker\s+run\s+--incremental/.test(incrementalSection),
  `mutation-incremental runs \`stryker run --incremental\``,
);
assert(
  /stryker\s+run\s+--force/.test(fullSection),
  `mutation-full runs \`stryker run --force\``,
);

// --- Step 6: Node version pinned to 20 ---
const node20Refs = (yamlText.match(/node-version:\s*['"]?20/g) ?? []).length;
assert(
  node20Refs >= 1,
  `at least one node-version: '20' pin present (got ${node20Refs} match(es))`,
);

// --- Step 7: npm ci --ignore-scripts pattern ---
assert(
  /npm\s+ci\s+--ignore-scripts/.test(yamlText),
  `workflow uses \`npm ci --ignore-scripts\` (Agent IDE pattern, mirrors ci.yml)`,
);

report();
process.exit(failures.length === 0 ? 0 : 1);
