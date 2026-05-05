#!/usr/bin/env node
/**
 * repro-electron.mjs — npm run repro -- <name> driver.
 *
 * Validates argv + spec, ensures out/main/index.js exists (auto-builds),
 * spawns Playwright with PW_REPRO_OUTPUT_DIR set, reconciles trace.zip from
 * Playwright's test-results dir into the artifacts dir, updates summary.json,
 * and exits with Playwright's exit code.
 *
 * REPRO_OUTPUT_DIR_ENV is imported from e2e/reproArtifacts.ts.
 * Node 24 experimental TypeScript stripping resolves .ts imports from .mjs.
 * If that fails in your environment, replace with the literal string
 * 'PW_REPRO_OUTPUT_DIR' and keep in sync with reproArtifacts.ts manually.
 */

import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the canonical env-var name from the Phase-0 contract.
// Node 24 strips TypeScript at load time (--experimental-strip-types, enabled
// by default on Node 24). Works in practice here — verified during Phase 2 dev.
import { REPRO_OUTPUT_DIR_ENV } from '../e2e/reproArtifacts.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────────────────

function parseArgs() {
  // process.argv: [ 'node', 'repro-electron.mjs', ...user args ]
  const args = process.argv.slice(2);
  const name = args[0]?.trim() ?? '';
  return name || null;
}

function printUsage(name) {
  const slug = name || '<name>';
  console.error(`Usage: npm run repro -- <name>`);
  console.error(`Copy the template:`);
  console.error(`  cp e2e/_repro-template.spec.ts e2e/_repro-${slug}.spec.ts`);
  console.error(`Then re-run: npm run repro -- ${slug}`);
}

function validateSpec(name) {
  const specPath = path.join(repoRoot, 'e2e', `_repro-${name}.spec.ts`);
  // Return the relative path for Playwright invocation (no spaces, shell-safe).
  return existsSync(specPath) ? `e2e/_repro-${name}.spec.ts` : null;
}

function ensureBuild() {
  const mainEntry = path.join(repoRoot, 'out', 'main', 'index.js');
  // Also ensure out/web exists: the global playwright.config.ts webServer runs
  // `vite preview --outDir out/web` for all projects. It fails if out/web is
  // missing even for the repro-electron project which doesn't need the web build.
  // Creating an empty out/web dir is enough for vite preview to start cleanly.
  mkdirSync(path.join(repoRoot, 'out', 'web'), { recursive: true });

  if (existsSync(mainEntry)) return Promise.resolve(0);

  console.log('[repro] Building IDE (out/main/index.js not found)…');
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    // On Windows, npm.cmd requires shell:true (spawn EINVAL with shell:false).
    const npm = isWin ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['run', 'build'], { stdio: 'inherit', shell: isWin });
    child.on('error', (err) => {
      console.error(`[repro] Build spawn error: ${err.message}`);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function computeOutputDir(name) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(repoRoot, 'artifacts', `repro-${name}-${ts}`);
  mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function traceInSubDir(outputDir, entry) {
  const sub = path.join(outputDir, entry);
  if (!statSync(sub).isDirectory()) return null;
  const candidate = path.join(sub, 'trace.zip');
  return existsSync(candidate) ? candidate : null;
}

function findTraceZip(outputDir) {
  // Walk 1 level deep looking for trace.zip.
  // Playwright writes traces under <outputDir>/<test-result-slug>/trace.zip.
  try {
    for (const entry of readdirSync(outputDir)) {
      const found = traceInSubDir(outputDir, entry);
      if (found) return found;
    }
  } catch {
    // outputDir may not exist if Playwright crashed before writing anything.
  }
  return null;
}

function reconcileArtifacts(outputDir) {
  const topTrace = path.join(outputDir, 'trace.zip');
  if (existsSync(topTrace)) return topTrace; // already reconciled (standalone run)

  const found = findTraceZip(outputDir);
  if (found) {
    copyFileSync(found, topTrace);
    return topTrace;
  }
  return null;
}

function updateSummaryTracePath(outputDir, tracePath) {
  const summaryFile = path.join(outputDir, 'summary.json');
  if (!existsSync(summaryFile)) return;
  try {
    const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
    summary.tracePath = tracePath;
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  } catch {
    // summary.json malformed — leave it untouched.
  }
}

function writeFallbackSummary(outputDir, name, startedAt) {
  const summaryFile = path.join(outputDir, 'summary.json');
  if (existsSync(summaryFile)) return; // afterEach already wrote it
  const fallback = {
    name,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - new Date(startedAt).getTime(),
    passed: false,
    screenshots: [],
    consoleTranscriptPath: path.join(outputDir, 'console.jsonl'),
    tracePath: null,
    testFile: `e2e/_repro-${name}.spec.ts`,
  };
  writeFileSync(summaryFile, JSON.stringify(fallback, null, 2));
}

function runPlaywright(name, specPath, outputDir, startedAt) {
  return new Promise((resolve) => {
    // On Windows, .cmd shims require shell:true (spawn EINVAL otherwise).
    // Use npx.cmd + shell:true on Windows; npx + shell:false on POSIX.
    // With shell:true on Windows, use forward-slash paths (cmd.exe accepts them)
    // so backslash escaping is not an issue. This matches the pattern used in
    // build-coach-hook.mjs (uses execSync with quoted paths).
    const isWin = process.platform === 'win32';
    const npx = isWin ? 'npx.cmd' : 'npx';
    // specPath is always a relative path (e2e/_repro-<name>.spec.ts) — no
    // spaces, no quoting needed. outputDir may have spaces (the repo root is
    // "C:\Web App\Agent IDE\…"), so quote it on Windows.
    const toFwd = (p) => p.replace(/\\/g, '/');
    const q = (p) => (isWin ? `"${toFwd(p)}"` : p);
    const args = [
      'playwright',
      'test',
      '--project=repro-electron',
      specPath, // relative, no spaces, safe on both shell modes
      '--reporter=list',
      '--output',
      q(outputDir),
    ];
    const child = spawn(npx, args, {
      stdio: 'inherit',
      shell: isWin,
      env: { ...process.env, [REPRO_OUTPUT_DIR_ENV]: outputDir },
    });
    child.on('error', (err) => {
      console.error(`[repro] Failed to spawn Playwright: ${err.message}`);
      writeFallbackSummary(outputDir, name, startedAt);
      console.log(outputDir);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();

  const name = parseArgs();
  if (!name) {
    printUsage(null);
    process.exit(2);
  }

  const specPath = validateSpec(name);
  if (!specPath) {
    printUsage(name);
    process.exit(2);
  }

  const buildCode = await ensureBuild();
  if (buildCode !== 0) {
    console.error(`[repro] Build failed with exit code ${buildCode}. Aborting.`);
    process.exit(buildCode);
  }

  const outputDir = computeOutputDir(name);

  const pwCode = await runPlaywright(name, specPath, outputDir, startedAt);

  const tracePath = reconcileArtifacts(outputDir);
  updateSummaryTracePath(outputDir, tracePath);
  writeFallbackSummary(outputDir, name, startedAt);

  // Final line: absolute path so callers can `tail -1` it.
  console.log(outputDir);
  process.exit(pwCode);
}

main().catch((err) => {
  console.error('[repro] Uncaught error:', err);
  // Best-effort: if we have an outputDir, write a fallback summary.
  // We don't have one at this point in the flow, so just exit.
  process.exit(1);
});
