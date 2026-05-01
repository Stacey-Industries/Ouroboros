// One-shot: delete the "Agent IDE" project from the codebase graph DB so
// the next IDE launch performs a full reindex (instead of incremental).
//
// MUST be run through Electron's Node mode — better-sqlite3's native binding
// is compiled for Electron's Node ABI, not the system Node ABI.
//
// Usage (PowerShell):
//   $env:ELECTRON_RUN_AS_NODE=1
//   ./node_modules/electron/dist/electron.exe tools/force-reindex.cjs
//
// Usage (bash):
//   ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe tools/force-reindex.cjs
//
// The IDE app must be CLOSED before running this — better-sqlite3 holds an
// exclusive lock when the IDE is open.

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(
  process.env.APPDATA || path.join(process.env.HOME || '/tmp', 'AppData', 'Roaming'),
  'ouroboros',
  'codebase-graph.db',
);

console.log(`opening: ${dbPath}`);
const db = new Database(dbPath);

const before = db.prepare('SELECT name, node_count, edge_count, indexed_at FROM projects').all();
console.log('projects before:', before);

// Foreign keys cascade — deleting from projects clears nodes, edges, and file_hashes.
const r = db.prepare("DELETE FROM projects WHERE name = 'Agent IDE'").run();
console.log(`deleted ${r.changes} project row(s)`);

// Also clear any stale graph_metadata entries for this project.
const m = db.prepare("DELETE FROM graph_metadata WHERE key LIKE '%Agent IDE'").run();
console.log(`deleted ${m.changes} graph_metadata row(s)`);

const after = db.prepare('SELECT name, node_count, edge_count, indexed_at FROM projects').all();
console.log('projects after:', after);

db.close();
console.log('Done. Relaunch the Ouroboros IDE to trigger a fresh full reindex.');
