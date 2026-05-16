#!/usr/bin/env node
// Wave 92 Phase 3 — lockfile:sync wrapper.
//
// Driven by `npm run lockfile:sync` from the Agent IDE repo root on Windows.
// Regenerates package-lock.json via a WSL2-native from-scratch `npm install`
// and writes a provenance marker that the pre-push guard reads.
//
// Pipeline (per roadmap/wave-92-cross-platform-lockfile-stryker/wave-92-decisions.md
// Decisions 1–5):
//   1. Pin top-level deps in the root manifest to currently-resolved exact
//      versions (Decision 3 — preserve versions, not freshness).
//   2. Copy pinned manifest into $HOME/lockgen/agent-ide/ in WSL2.
//   3. In WSL2: rm -rf node_modules package-lock.json; nvm use 20.20.2; npm install
//      --ignore-scripts --no-audit --no-fund (Decision 2 — pinned invocation).
//   4. Copy the resulting package-lock.json back to the Windows repo root.
//   5. Write .lockfile-sync.marker with lockfileSha256 + generatedAt + generatedBy.
//   6. Exit 0.
//
// Requirements: WSL2 Ubuntu with nvm + Node 20.20.2 installed, $HOME/lockgen/agent-ide/
// on ext4. The wrapper never touches the Windows node_modules/ tree.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

// Agent IDE is a single-package repo (not a monorepo). Only the root manifest.
const MANIFESTS = [
  { win: join(REPO_ROOT, 'package.json'), wsl_rel: 'package.json' },
];

const LOCK_WIN = join(REPO_ROOT, 'package-lock.json');
const MARKER_WIN = join(REPO_ROOT, '.lockfile-sync.marker');
// $HOME is used (not ~) because bash does NOT expand ~ inside double quotes.
// Using $HOME ensures correct expansion in all double-quoted bash command strings.
const WSL_LOCKGEN = '$HOME/lockgen/agent-ide';

// ---- Utilities ---------------------------------------------------------------

function ts() {
  return new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, 'Z');
}

function log(msg) {
  console.log(`[lockfile:sync ${ts()}] ${msg}`);
}

function die(msg, err) {
  console.error(`[lockfile:sync ${ts()}] ERROR: ${msg}`);
  if (err) console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

// Convert a Windows absolute path to a WSL2 /mnt/... path.
// 'C:\Web App\Agent IDE\package.json' → '/mnt/c/Web App/Agent IDE/package.json'
function winToWslPath(winPath) {
  // normalise separators
  const normalised = winPath.replace(/\\/g, '/');
  // expect C:/... shape
  const m = normalised.match(/^([A-Za-z]):\/(.*)$/);
  if (!m) die(`Cannot convert Windows path to WSL path: ${winPath}`);
  return `/mnt/${m[1].toLowerCase()}/${m[2]}`;
}

// Run a command via wsl.exe -d Ubuntu -e bash -lc '...'
// from a normal Windows cwd (avoids the UNC-path bug).
function wsl(bashCmd, { label, allowFailure = false } = {}) {
  if (label) log(`WSL: ${label}`);
  const proc = spawnSync('wsl.exe', ['-d', 'Ubuntu', '-e', 'bash', '-lc', bashCmd], {
    cwd: REPO_ROOT, // Windows cwd — NOT a \\wsl$\... UNC path
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  });
  if (!allowFailure && proc.status !== 0) {
    die(`WSL command failed (exit ${proc.status}): ${bashCmd}`);
  }
  return proc.status;
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

// ---- Step 1: Pin top-level deps to currently-resolved exact versions ----------

log('Step 1/5 — Pinning top-level deps to currently-resolved versions...');

if (!existsSync(LOCK_WIN)) {
  die('package-lock.json not found at repo root. Cannot pin deps without an existing lockfile.');
}

const pinScript = join(SCRIPT_DIR, 'pin-toplevel.mjs');
const tempDir = join(tmpdir(), `lockfile-sync-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

// Emit a pinned version of each manifest into tempDir (parallel-safe flat structure).
const pinnedManifests = [];
for (const { win, wsl_rel } of MANIFESTS) {
  if (!existsSync(win)) {
    log(`  (skipping ${wsl_rel} — file not found at ${win})`);
    continue;
  }

  // Sanitise the relative path to make a safe temp filename.
  const safeName = wsl_rel.replace(/\//g, '__');
  const outPath = join(tempDir, safeName);

  const result = spawnSync(process.execPath, [pinScript, win, LOCK_WIN, outPath], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) die(`pin-toplevel.mjs failed for ${wsl_rel}`);

  pinnedManifests.push({ outPath, wsl_rel });
  log(`  pinned ${wsl_rel} → ${outPath}`);
}

// ---- Step 2: Copy pinned manifests into WSL2 $HOME/lockgen/agent-ide/ -----------

log('Step 2/5 — Syncing pinned manifests into WSL2 $HOME/lockgen/agent-ide/...');

// Ensure the lockgen directories exist in WSL2.
const subdirs = [
  ...new Set(
    pinnedManifests.map(({ wsl_rel }) =>
      wsl_rel.includes('/')
        ? `${WSL_LOCKGEN}/${wsl_rel.split('/').slice(0, -1).join('/')}`
        : WSL_LOCKGEN,
    ),
  ),
];
const mkdirCmd = `mkdir -p ${subdirs.map((d) => `"${d}"`).join(' ')}`;
wsl(mkdirCmd, { label: 'mkdir -p lockgen subdirs' });

// Copy each pinned manifest via the WSL2 filesystem (read from /mnt/c/... temp path).
for (const { outPath, wsl_rel } of pinnedManifests) {
  const wslSrc = winToWslPath(outPath);
  const wslDst = `${WSL_LOCKGEN}/${wsl_rel}`;
  wsl(`cp "${wslSrc}" "${wslDst}"`, { label: `copy ${wsl_rel}` });
}

log('  manifests copied.');

// ---- Pre-regen snapshot (for drift detection after regen) --------------------

// Snapshot the current lockfile so the drift checker can compare before vs after.
// Skip gracefully if the lockfile doesn't exist yet (first-ever run).
const DRIFT_CHECK_SCRIPT = join(SCRIPT_DIR, 'lockfile-drift-check.mjs');
const snapshotPath = join(tmpdir(), `lockfile-pre-regen-${Date.now()}.json`);
let snapshotExists = false;
if (existsSync(LOCK_WIN)) {
  try {
    writeFileSync(snapshotPath, readFileSync(LOCK_WIN));
    snapshotExists = true;
    log(`  pre-regen lockfile snapshot saved to ${snapshotPath}`);
  } catch (err) {
    log(`  (snapshot failed — drift check will be skipped): ${err.message}`);
  }
}

// ---- Step 3: WSL2-native npm install -----------------------------------------

log('Step 3/5 — Running npm install in WSL2 (this takes ~1–2 min on first run)...');

// Source nvm explicitly — the -lc login shell doesn't always activate it on first call.
const NVM_INIT = 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"';
const INSTALL_CMD = [
  NVM_INIT,
  `cd "${WSL_LOCKGEN}"`,
  'nvm use 20.20.2 > /dev/null',
  'rm -rf node_modules package-lock.json',
  'npm install --ignore-scripts --no-audit --no-fund',
].join(' && ');

wsl(INSTALL_CMD, { label: 'npm install in $HOME/lockgen/agent-ide' });

log('  install complete.');

// ---- Step 4: Copy package-lock.json back to Windows repo root ---------------

log('Step 4/5 — Copying package-lock.json back to Windows repo...');

// Read the generated lockfile from WSL2's ext4 fs via the /mnt path.
// We do this with a wsl cp command writing to the Windows-side path.
const wslLockSrc = `${WSL_LOCKGEN}/package-lock.json`;
const wslLockDst = winToWslPath(LOCK_WIN);
wsl(`cp "${wslLockSrc}" "${wslLockDst}"`, { label: 'copy package-lock.json back' });

log('  package-lock.json written.');

// ---- Drift check (post-regen, pre-marker-write) ------------------------------

if (snapshotExists) {
  log('Drift check — comparing pre-regen snapshot to new lockfile...');
  const acceptDrift = process.env.LOCKFILE_SYNC_ACCEPT_DRIFT === '1';
  const driftArgs = [DRIFT_CHECK_SCRIPT, snapshotPath, LOCK_WIN];
  if (acceptDrift) driftArgs.push('--accept-drift');

  const driftResult = spawnSync(process.execPath, driftArgs, { stdio: 'inherit', shell: false });

  if (driftResult.status !== 0) {
    console.error(
      '\n[lockfile:sync] Drift detected — re-run with LOCKFILE_SYNC_ACCEPT_DRIFT=1 to accept, ' +
      'or fix the source of drift. Marker NOT written; pre-push guard will block any push of this lockfile.',
    );
    process.exit(2);
  }
  log('  drift check passed.');
}

// ---- Step 5: Write provenance marker -----------------------------------------

log('Step 5/5 — Writing .lockfile-sync.marker...');

if (!existsSync(LOCK_WIN)) {
  die('package-lock.json still missing after WSL install — something went wrong.');
}

const lockfileSha256 = sha256File(LOCK_WIN);
const marker = {
  lockfileSha256,
  generatedAt: new Date().toISOString(),
  generatedBy: 'lockfile:sync',
};
writeFileSync(MARKER_WIN, JSON.stringify(marker, null, 2) + '\n');

log(`  marker written (sha256: ${lockfileSha256.slice(0, 16)}...)`);

// ---- Done --------------------------------------------------------------------

log('lockfile:sync complete.');
log(`  package-lock.json updated at ${LOCK_WIN}`);
log(`  .lockfile-sync.marker written at ${MARKER_WIN}`);
log('  Windows node_modules/ was not touched.');
