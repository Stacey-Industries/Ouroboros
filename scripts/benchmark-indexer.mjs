#!/usr/bin/env node
/**
 * benchmark-indexer.mjs — Manual benchmark for the codebase graph indexer.
 *
 * ELECTRON COUPLING BLOCKER:
 *   indexingPipeline.ts imports logger.ts which imports electron-log, which calls
 *   electron.app.getPath() at module load time. This cannot run outside an Electron
 *   process. Attempting to import the pipeline directly would crash with:
 *     Error: Cannot find module 'electron'  (or similar ABI / app.ready errors)
 *
 * ALTERNATIVE APPROACH (implemented here):
 *   Instead of driving the indexer, this script reads the persisted graph at
 *   .ouroboros/graph.db (SQLite) using the system-Node better-sqlite3 build
 *   installed by scripts/install-sqlite-fresh.mjs (pretest hook). It reports:
 *     - Node/edge counts and project metadata
 *     - File hash counts (files indexed)
 *     - Last indexed timestamp
 *     - Per-project breakdown if multiple projects exist
 *     - FD pressure snapshot via process._getActiveHandles()
 *     - DB read latency across N iterations (median + p95)
 *
 *   To benchmark INDEXING performance, trigger a re-index from the IDE and then
 *   run this script to inspect the persisted results. Phase timings are written
 *   to IndexingResult.phaseTimingsMs — search the app log for "[indexer]" entries.
 *
 * USAGE:
 *   node scripts/benchmark-indexer.mjs
 *   node scripts/benchmark-indexer.mjs --project=/absolute/path/to/project
 *   node scripts/benchmark-indexer.mjs --iterations=5
 *   npm run bench:indexer
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// ─── CLI argument parsing ────────────────────────────────────────────────────

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    project: { type: 'string', default: process.cwd() },
    iterations: { type: 'string', default: '3' },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (args.help) {
  console.log(`
Usage: node scripts/benchmark-indexer.mjs [options]

Options:
  --project=<path>     Project root to inspect (default: cwd)
  --iterations=<N>     Number of read iterations for I/O timing (default: 3)
  --help               Show this help message
`);
  process.exit(0);
}

const projectRoot = String(args.project);
const iterations = Math.max(1, parseInt(String(args.iterations), 10) || 3);

// ─── Locate system-Node better-sqlite3 ───────────────────────────────────────

const localAppData = process.env.LOCALAPPDATA ?? '/tmp';
const sqliteFreshDir = path.join(localAppData, 'Temp', 'sqlite-fresh', 'node_modules', 'better-sqlite3');
const addonPath = path.join(sqliteFreshDir, 'build', 'Release', 'better_sqlite3.node');

if (!existsSync(addonPath)) {
  console.error(
    `[bench] ERROR: System-Node better-sqlite3 not found at:\n  ${sqliteFreshDir}\n\n` +
    `  Run: node scripts/install-sqlite-fresh.mjs\n` +
    `  Or:  npm test  (which runs it as a pretest hook)\n`,
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const Database = require(sqliteFreshDir);

// ─── FD pressure snapshot ─────────────────────────────────────────────────────

function snapshotFdPressure() {
  const getter = process._getActiveHandles;
  if (typeof getter !== 'function') return { total: 0, summary: 'unavailable' };
  try {
    const handles = getter.call(process);
    const counts = new Map();
    for (const h of handles) {
      const t =
        h && typeof h === 'object' && 'constructor' in h
          ? (h.constructor?.name ?? typeof h)
          : typeof h;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([t, c]) => `${t}:${c}`)
      .join(', ');
    return { total: handles.length, summary };
  } catch {
    return { total: 0, summary: 'error' };
  }
}

// ─── Statistics helpers ───────────────────────────────────────────────────────

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function p95(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1);
  return sorted[idx];
}

// ─── Locate graph DB ──────────────────────────────────────────────────────────
// The new indexer (Package D) stores its DB at Electron userData.
const appData = process.env.APPDATA ?? path.join(process.env.HOME ?? '/tmp', '.config');
const newDbPath = path.join(appData, 'ouroboros', 'codebase-graph.db');
// The old graphStore stores its DB at project-root/.ouroboros/graph.db.
const oldDbPath = path.join(projectRoot, '.ouroboros', 'graph.db');

let dbPath = null;
let dbSchema = null;

if (existsSync(newDbPath)) {
  dbPath = newDbPath;
  dbSchema = 'new';
} else if (existsSync(oldDbPath)) {
  dbPath = oldDbPath;
  dbSchema = 'old';
}

// ─── Iteration: new schema (projects/nodes/edges/file_hashes tables) ─────────

function runIterationNew(db) {
  const start = performance.now();
  const projects = db.prepare('SELECT * FROM projects').all();
  const fileCounts = db
    .prepare('SELECT project, COUNT(*) as cnt FROM file_hashes GROUP BY project')
    .all();
  const nodesByProject = db
    .prepare('SELECT project, COUNT(*) as cnt FROM nodes GROUP BY project')
    .all();
  const edgesByProject = db
    .prepare('SELECT project, COUNT(*) as cnt FROM edges GROUP BY project')
    .all();
  const durationMs = performance.now() - start;
  const fileMap = Object.fromEntries(fileCounts.map((r) => [r.project, r.cnt]));
  const nodeMap = Object.fromEntries(nodesByProject.map((r) => [r.project, r.cnt]));
  const edgeMap = Object.fromEntries(edgesByProject.map((r) => [r.project, r.cnt]));
  return { durationMs, projects, fileMap, nodeMap, edgeMap };
}

// ─── Iteration: old schema (nodes/edges only, no projects table) ─────────────

function runIterationOld(db) {
  const start = performance.now();
  const nodeCount = db.prepare('SELECT COUNT(*) as cnt FROM nodes').get();
  const edgeCount = db.prepare('SELECT COUNT(*) as cnt FROM edges').get();
  const durationMs = performance.now() - start;
  return { durationMs, nodeCount: nodeCount.cnt, edgeCount: edgeCount.cnt };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\nOUROBOROS INDEXER BENCHMARK');
console.log('-'.repeat(60));
console.log(`Project root:  ${projectRoot}`);
console.log(`Iterations:    ${iterations}`);
console.log('-'.repeat(60) + '\n');

if (!dbPath) {
  console.error(
    `[bench] No graph DB found. Tried:\n` +
    `  (new) ${newDbPath}\n` +
    `  (old) ${oldDbPath}\n\n` +
    `  Open the project in the IDE and wait for indexing to complete,\n` +
    `  then re-run this script.\n`,
  );
  process.exit(1);
}

console.log(`Database:      ${dbPath}  (schema: ${dbSchema})\n`);

const readTimings = [];
let lastResult = null;
const fdSnapshots = [];
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

for (let i = 0; i < iterations; i++) {
  fdSnapshots.push(snapshotFdPressure());
  const result = dbSchema === 'new' ? runIterationNew(db) : runIterationOld(db);
  readTimings.push(result.durationMs);
  lastResult = result;
  fdSnapshots.push(snapshotFdPressure());
}

db.close();

const peakFd = Math.max(...fdSnapshots.map((s) => s.total));
const readMedian = median(readTimings);
const readP95 = p95(readTimings);

console.log(`BENCHMARK RESULTS (${iterations} iteration${iterations !== 1 ? 's' : ''}, median reported)`);
console.log('-'.repeat(60));
console.log(`DB read time:  ${readMedian.toFixed(1)} ms  (p95: ${readP95.toFixed(1)} ms)`);
console.log(`Peak FD count: ${peakFd}`);

if (dbSchema === 'new') {
  const { projects, fileMap, nodeMap, edgeMap } = lastResult;
  if (projects.length === 0) {
    console.log('\n  No projects indexed yet.\n');
  } else {
    for (const proj of projects) {
      const nodes = proj.node_count || nodeMap[proj.name] || 0;
      const edges = proj.edge_count || edgeMap[proj.name] || 0;
      const files = fileMap[proj.name] || 0;
      const indexedAt = proj.indexed_at
        ? new Date(proj.indexed_at).toISOString()
        : 'never';
      console.log(`\nProject: ${proj.name}`);
      console.log(`  Root:          ${proj.root_path}`);
      console.log(`  Last indexed:  ${indexedAt}`);
      console.log(`  Files indexed: ${files}`);
      console.log(`  Nodes / Edges: ${nodes} / ${edges}`);
    }
  }
} else {
  const { nodeCount, edgeCount } = lastResult;
  console.log('\nGraph (old schema):');
  console.log(`  Nodes / Edges: ${nodeCount} / ${edgeCount}`);
  console.log('  Note: old graphStore DB -- no per-project or file-hash metadata.');
}

console.log('\nNOTE: Phase timings (discovery, parsing, structure, definitions,');
console.log('  imports, calls, git_prefetch, ...) are captured in');
console.log('  IndexingResult.phaseTimingsMs after each indexing run. To see them:');
console.log('  open the project in the IDE, trigger a re-index, and search the');
console.log('  app log for "[indexer]" entries.\n');
