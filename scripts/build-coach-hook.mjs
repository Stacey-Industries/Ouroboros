/**
 * build-coach-hook.mjs — Generate hook artifacts from the TypeScript source.
 *
 * Emits two artifacts:
 *   out/coach-patterns.json  — JSON-serialized active pattern table (from patterns.ts)
 *   out/coach-detector.mjs   — Plain-JS port of detector.ts for hook consumption
 *
 * Both artifacts are also copied to ~/.claude/hooks/lib/ so delegation_coach.mjs
 * can read them without importing from the TypeScript codebase directly.
 *
 * Usage:
 *   node scripts/build-coach-hook.mjs
 * Or via npm:
 *   npm run build:coach-hook
 *
 * Implementation notes:
 *   - Patterns are extracted via esbuild (available in devDependencies) bundling
 *     patterns.ts + types.ts to a temporary CJS bundle, then require()-ing it.
 *   - Detector is a hand-written JS port (scripts/coach-detector-template.mjs)
 *     that mirrors detector.ts. This is simpler than fighting ESM/CJS interop
 *     for a pure-logic module with no imports. Update the template when
 *     detector.ts changes.
 */

import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');
const outDir = join(repoRoot, 'out');

// Ensure out/ exists
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// ── 1. Bundle patterns.ts → temp CJS via esbuild ─────────────────────────────
const esbuildPath = join(repoRoot, 'node_modules', '.bin', 'esbuild');
if (!existsSync(esbuildPath) && !existsSync(esbuildPath + '.cmd')) {
  console.error(`[build-coach-hook] ERROR: esbuild not found at ${esbuildPath}`);
  process.exit(1);
}

const patternsSource = join(repoRoot, 'src', 'main', 'delegationCoach', 'patterns.ts');
if (!existsSync(patternsSource)) {
  console.error(`[build-coach-hook] ERROR: patterns.ts not found at ${patternsSource}`);
  process.exit(1);
}

const tempBundle = join(tmpdir(), `coach-patterns-${Date.now()}.cjs`);

try {
  // Quote all path arguments to handle spaces. Use execSync with shell:false
  // equivalent by building a fully-quoted command string.
  const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
  const esbuildBin =
    process.platform === 'win32'
      ? join(repoRoot, 'node_modules', '.bin', 'esbuild.cmd')
      : esbuildPath;
  const cmd = [
    q(esbuildBin),
    q(patternsSource),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    `--outfile=${q(tempBundle)}`,
    '--log-level=error',
  ].join(' ');
  execSync(cmd, { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
} catch (err) {
  console.error(`[build-coach-hook] ERROR: esbuild failed: ${err.message}`);
  process.exit(1);
}

// ── 2. Load the bundled patterns module ──────────────────────────────────────
const require = createRequire(import.meta.url);
let patternsModule;
try {
  patternsModule = require(tempBundle);
} catch (err) {
  console.error(`[build-coach-hook] ERROR: failed to load patterns bundle: ${err.message}`);
  try {
    rmSync(tempBundle);
  } catch {
    /* ignore */
  }
  process.exit(1);
}

try {
  rmSync(tempBundle);
} catch {
  /* cleanup is best-effort */
}

const { SEED_PATTERNS, activePatterns } = patternsModule;
if (!Array.isArray(SEED_PATTERNS) || typeof activePatterns !== 'function') {
  console.error(
    '[build-coach-hook] ERROR: patterns module missing SEED_PATTERNS or activePatterns exports',
  );
  process.exit(1);
}

// ── 3. Write out/coach-patterns.json ─────────────────────────────────────────
const active = activePatterns(SEED_PATTERNS);
const patternsOutPath = join(outDir, 'coach-patterns.json');
writeFileSync(patternsOutPath, JSON.stringify(active, null, 2), 'utf8');
console.log(`[build-coach-hook] wrote ${patternsOutPath} (${active.length} active patterns)`);

// ── 4. Copy the JS detector template to out/coach-detector.mjs ───────────────
const templatePath = join(__dirname, 'coach-detector-template.mjs');
if (!existsSync(templatePath)) {
  console.error(`[build-coach-hook] ERROR: detector template not found at ${templatePath}`);
  process.exit(1);
}
const detectorOutPath = join(outDir, 'coach-detector.mjs');
copyFileSync(templatePath, detectorOutPath);
console.log(`[build-coach-hook] wrote ${detectorOutPath}`);

// ── 5. Copy both artifacts into ~/.claude/hooks/lib/ ─────────────────────────
const homeDir = process.env.USERPROFILE || process.env.HOME || '';
const hooksLibDir = join(homeDir, '.claude', 'hooks', 'lib');
if (!existsSync(hooksLibDir)) {
  mkdirSync(hooksLibDir, { recursive: true });
}

const hooksPatternsPath = join(hooksLibDir, 'coach-patterns.json');
copyFileSync(patternsOutPath, hooksPatternsPath);
console.log(`[build-coach-hook] copied patterns → ${hooksPatternsPath}`);

const hooksDetectorPath = join(hooksLibDir, 'coach-detector.mjs');
copyFileSync(detectorOutPath, hooksDetectorPath);
console.log(`[build-coach-hook] copied detector → ${hooksDetectorPath}`);

console.log('[build-coach-hook] done.');
