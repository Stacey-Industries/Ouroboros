/**
 * repoMapGeneratorGraph.ts — Graph-backed module export queries for the repo map generator.
 *
 * Phase B1 of Wave 69: replaces name-only exports with graph-enriched ModuleExport[]
 * entries that include signatures and kinds.
 */

import log from '../logger';
import type { ModuleExport } from './contextLayerTypes';
import { getQuerySource } from './repoMapGeneratorQuerySource';

const EXPORTS_LIMIT = 50;

/**
 * Escapes single quotes in a path string for use inside a Cypher string literal.
 * The cypherEngine translates STARTS WITH to SQL LIKE, so single-quote escaping
 * follows SQL convention (double the quote).
 */
function escapeCypherStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Maps a raw `kind` column value from the graph result to the ModuleExport kind union.
 * The graph returns the node label string; unknown labels default to 'Function'.
 */
function normalizeKind(raw: unknown): ModuleExport['kind'] {
  if (raw === 'Class') return 'Class';
  if (raw === 'Method') return 'Method';
  return 'Function';
}

/**
 * Converts a single result row from queryGraph into a ModuleExport.
 * Column names follow the cypherEngine convention:
 *   - `n_name`      — from `RETURN n.name`
 *   - `n_signature` — from `RETURN n.signature` (props fall-through)
 *   - `kind`        — from `RETURN labels(n) AS kind`
 */
function rowToModuleExport(row: Record<string, unknown>): ModuleExport | null {
  const name = row['n_name'];
  if (typeof name !== 'string' || name.trim() === '') return null;

  const rawSig = row['n_signature'];
  const signature = typeof rawSig === 'string' && rawSig.trim() !== '' ? rawSig : null;

  return { name, signature, kind: normalizeKind(row['kind']) };
}

/**
 * Queries the codebase graph for all Class/Function/Method symbols whose file_path
 * starts with `moduleRootPath`, returning up to EXPORTS_LIMIT results as ModuleExport[].
 *
 * Returns an empty array (without throwing) when:
 *   - the graph controller is not yet ready (soft-fallback per Decision 7)
 *   - the query throws for any reason
 *
 * The caller is responsible for using the file-walk fallback exports when this returns [].
 */
export async function queryModuleExports(moduleRootPath: string): Promise<ModuleExport[]> {
  const ctrl = getQuerySource();
  if (!ctrl) {
    // Soft-fallback path. Caller (generateRepoMap) emits a single summary log
    // covering all skipped modules; per-module logs would spam the terminal.
    return [];
  }

  const escaped = escapeCypherStringLiteral(moduleRootPath);
  const cypher =
    `MATCH (n) WHERE n.file_path STARTS WITH '${escaped}'` +
    ` AND labels(n) IN ['Class', 'Function', 'Method']` +
    ` RETURN n.name, n.signature, labels(n) AS kind` +
    ` LIMIT ${EXPORTS_LIMIT}`;

  let rows: Array<Record<string, unknown>>;
  try {
    rows = ctrl.queryGraph(cypher);
  } catch (err) {
    log.warn('[repo-map-graph] queryGraph failed for', moduleRootPath, err);
    return [];
  }

  const results: ModuleExport[] = [];
  for (const row of rows) {
    const entry = rowToModuleExport(row);
    if (entry) results.push(entry);
  }
  return results;
}
