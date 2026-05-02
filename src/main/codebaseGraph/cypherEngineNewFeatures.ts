/**
 * cypherEngineNewFeatures.ts — SQL builders for Wave-77 features:
 * OPTIONAL MATCH (LEFT JOIN) and UNWIND (VALUES CTE).
 *
 * Extracted from cypherEngine.ts to keep it under the 300-line limit.
 */

import { buildOrderBy, resolveColumnExpression, sanitizeIdentifier } from './cypherEngineSqlHelpers';
import type { MatchPattern, ParsedQuery, UnwindClause } from './cypherEngineSupport';

// ─── OPTIONAL MATCH ───────────────────────────────────────────────────────────

/**
 * Build the LEFT JOIN SQL fragment for an OPTIONAL MATCH hop.
 * Returns empty string if om is not a hop pattern.
 */
export function buildOptionalHopJoin(om: MatchPattern, leftAlias: string): string {
  if (om.kind !== 'hop') return '';
  const edgeAlias = 'e_opt';
  const rightAlias = om.right.alias || '_opt_r';
  const srcCol = om.direction === 'outbound' ? 'source_id' : 'target_id';
  const tgtCol = om.direction === 'outbound' ? 'target_id' : 'source_id';
  const edgeTypeCond = om.edgeType
    ? ` AND ${edgeAlias}.type = '${sanitizeIdentifier(om.edgeType)}'`
    : '';
  return (
    `LEFT JOIN edges ${edgeAlias} ON ${edgeAlias}.${srcCol} = ${leftAlias}.id${edgeTypeCond} ` +
    `LEFT JOIN nodes ${rightAlias} ON ${rightAlias}.id = ${edgeAlias}.${tgtCol}`
  );
}

// ─── UNWIND ───────────────────────────────────────────────────────────────────

export interface UnwindSqlContext {
  parsed: ParsedQuery;
  unwind: UnwindClause;
  projectName: string;
  buildSelectColumns: (p: ParsedQuery, ...aliases: string[]) => string;
  addWhereConditions: (where: ParsedQuery['where'], conditions: string[], params: unknown[]) => void;
}

function buildUnwindConditions(
  ctx: UnwindSqlContext,
  nodeAlias: string,
  label: string | null,
  params: unknown[],
): string[] {
  const conditions: string[] = [`${nodeAlias}.project = ?`];
  params.push(ctx.projectName);
  if (label) {
    conditions.push(`${nodeAlias}.label = ?`);
    params.push(label);
  }
  const safeAlias = sanitizeIdentifier(ctx.unwind.alias);
  const safeNodeAlias = sanitizeIdentifier(nodeAlias);
  conditions.push(`${resolveColumnExpression(safeNodeAlias, safeAlias)} = _unwind.val`);
  ctx.addWhereConditions(ctx.parsed.where, conditions, params);
  return conditions;
}

/**
 * Build SQL for UNWIND ['v1','v2'] AS x ... RETURN ...
 * Uses a VALUES CTE so the statement stays fully read-only.
 */
export function buildUnwindSql(ctx: UnwindSqlContext): { text: string; params: unknown[] } {
  const { values, alias } = ctx.unwind;
  if (values.length === 0) return { text: 'SELECT NULL WHERE 0', params: [] };

  const params: unknown[] = [];
  const placeholders = values.map(() => '(?)').join(', ');
  for (const v of values) params.push(v);

  const nodeAlias =
    ctx.parsed.match.kind === 'single'
      ? (ctx.parsed.match as Extract<MatchPattern, { kind: 'single' }>).alias || 'n'
      : 'n';
  const label =
    ctx.parsed.match.kind === 'single'
      ? (ctx.parsed.match as Extract<MatchPattern, { kind: 'single' }>).label
      : null;

  const selectCols = ctx.buildSelectColumns(ctx.parsed, nodeAlias);
  const conditions = buildUnwindConditions(ctx, nodeAlias, label, params);
  const safeAlias = sanitizeIdentifier(alias);
  const safeNodeAlias = sanitizeIdentifier(nodeAlias);
  const joinExpr = resolveColumnExpression(safeNodeAlias, safeAlias);
  const orderBy = buildOrderBy(ctx.parsed.orderBy);
  const distinct = ctx.parsed.isDistinct ? 'DISTINCT ' : '';

  const sql = [
    `WITH _unwind(val) AS (VALUES ${placeholders})`,
    `SELECT ${distinct}${selectCols}`,
    `FROM nodes ${nodeAlias}`,
    `JOIN _unwind ON ${joinExpr} = _unwind.val`,
    `WHERE ${conditions.join(' AND ')}`,
    orderBy ? `ORDER BY ${orderBy}` : '',
    `LIMIT ?`,
  ]
    .filter(Boolean)
    .join(' ');
  params.push(ctx.parsed.limit);
  return { text: sql, params };
}
