/**
 * ouroborosMcp.ts — Standalone MCP server entry point (Wave 60 Phase A).
 *
 * Spawned by Claude Code as a stdio child process. Reads the IDE's
 * codebase-graph SQLite DB in read-only mode and exposes the graph tools
 * via MCP. Lives outside Electron; works whether the IDE is running or not.
 *
 * stdout is reserved for the SDK's StdioServerTransport (JSON-RPC wire).
 * All logging goes to stderr — any stdout write outside the SDK transport
 * corrupts the protocol stream.
 */

import fs from 'node:fs';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';

import { parseArgs } from './ouroborosMcpPath';
import { checkSchemaVersion } from './ouroborosMcpSchema';
import { buildOuroborosMcpServer } from './ouroborosMcpServer';

function logErr(msg: string): void {
  process.stderr.write(`[ouroborosMcp] ${msg}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dbPath)) {
    throw new Error(
      `Codebase graph DB not found at ${args.dbPath}. Open the Ouroboros IDE on a project at least once to build the graph.`,
    );
  }

  // Schema handshake before standing up the server. Open the DB once for the
  // version probe; close it; the server's own readonly open follows.
  const probeDb = new Database(args.dbPath, { readonly: true, fileMustExist: true });
  const check = checkSchemaVersion(probeDb);
  probeDb.close();
  if (!check.ok) throw new Error(check.message ?? 'schema mismatch');

  logErr(`starting; db=${args.dbPath} schema=v${check.actualVersion}`);

  const built = buildOuroborosMcpServer({ dbPath: args.dbPath });
  logErr(`registered ${built.toolNames.length} tool(s): ${built.toolNames.join(',')}`);

  const transport = new StdioServerTransport();
  await built.server.connect(transport);

  process.on('SIGTERM', () => {
    logErr('SIGTERM; shutting down');
    built.close();
    process.exit(0);
  });
}

function isScriptEntry(): boolean {
  return (process.argv[1] ?? '').includes('ouroborosMcp');
}

if (isScriptEntry()) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logErr(`fatal: ${msg}`);
    process.exit(1);
  });
}

export { main };
