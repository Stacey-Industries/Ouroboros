/**
 * cypherEngineVarpath.ts — Variable-length path (varpath) SQL builder helpers
 * extracted from cypherEngineSupport.ts to keep that file under 300 lines.
 */

import type { ReturnField, WhereCondition } from './cypherEngineSupport'

// ─── Resolver callbacks ───────────────────────────────────────────────────────

/** Resolver callbacks used to translate Cypher identifiers and operators to SQL. */
export interface CypherResolvers {
  resolveColumn: (p: string) => string
  cypherOpToSql: (op: string) => string
}

// ─── Start / end condition builders ──────────────────────────────────────────

/** Context for building varpath start-node conditions. */
export interface VarpathStartContext {
  left: { alias: string; label: string | null }
  projectName: string
}

/** Build the start-node WHERE conditions for a varpath query. */
export function buildVarpathStartConditions(
  ctx: VarpathStartContext,
  where: WhereCondition[],
  params: unknown[],
  resolvers: CypherResolvers,
): string[] {
  const { left, projectName } = ctx
  const startConditions: string[] = ['n_start.project = ?']
  params.push(projectName)

  if (left.label) {
    startConditions.push('n_start.label = ?')
    params.push(left.label)
  }

  for (const cond of where) {
    if (cond.alias === left.alias) {
      const col = resolvers.resolveColumn(cond.property)
      const sqlOp = resolvers.cypherOpToSql(cond.operator)
      startConditions.push(`n_start.${col} ${sqlOp} ?`)
      params.push(cond.value)
    }
  }

  return startConditions
}

/** Build the end-node WHERE conditions for a varpath query. */
export function buildVarpathEndConditions(
  right: { alias: string; label: string | null },
  where: WhereCondition[],
  params: unknown[],
  resolvers: CypherResolvers,
): string[] {
  const endConditions: string[] = []

  if (right.label) {
    endConditions.push('n_end.label = ?')
    params.push(right.label)
  }

  for (const cond of where) {
    if (cond.alias === right.alias) {
      const col = resolvers.resolveColumn(cond.property)
      const sqlOp = resolvers.cypherOpToSql(cond.operator)
      endConditions.push(`n_end.${col} ${sqlOp} ?`)
      params.push(cond.value)
    }
  }

  return endConditions
}

// ─── SQL template builder ─────────────────────────────────────────────────────

/** Options for the WITH RECURSIVE SQL template. */
export interface VarpathTemplateOptions {
  startConditions: string[]
  nextNode: string
  edgeJoin: string
  endWhere: string
  distinct: string
  selectParts: string[]
  orderBy: string
}

/** Assemble the WITH RECURSIVE SQL for a variable-length path query. */
export function buildVarpathSqlTemplate(opts: VarpathTemplateOptions): string {
  const { startConditions, nextNode, edgeJoin, endWhere, distinct, selectParts, orderBy } = opts
  return `
    WITH RECURSIVE reachable(current_id, depth, path) AS (
      SELECT n_start.id, 0, n_start.id
      FROM nodes n_start
      WHERE ${startConditions.join(' AND ')}
      UNION ALL
      SELECT ${nextNode}, r.depth + 1, r.path || '>' || ${nextNode}
      FROM reachable r
      JOIN edges e ON ${edgeJoin}
      WHERE r.depth < ?
        AND r.path NOT LIKE '%' || ${nextNode} || '%'
    )
    SELECT ${distinct}${selectParts.join(', ')}
    FROM reachable r2
    JOIN nodes n_end ON n_end.id = r2.current_id
    JOIN nodes n_start ON n_start.id = SUBSTR(r2.path, 1, INSTR(r2.path || '>', '>') - 1)
    WHERE r2.depth >= ? AND r2.depth <= ?
    ${endWhere}
    ${orderBy ? `ORDER BY ${orderBy}` : ''}
    LIMIT ?
  `.trim()
}

// ─── SELECT parts builder ─────────────────────────────────────────────────────

/** Build SELECT parts for a varpath query. */
export function buildVarpathSelectParts(
  returnFields: ReturnField[],
  leftAlias: string,
  rightAlias: string,
  resolveColumn: (p: string) => string,
): string[] {
  const selectParts: string[] = []

  for (const field of returnFields) {
    if (field.property === '*') {
      if (field.alias === leftAlias) selectParts.push(`n_start.id AS ${field.outputName}`)
      else if (field.alias === rightAlias) selectParts.push(`n_end.id AS ${field.outputName}`)
    } else {
      const col = resolveColumn(field.property)
      if (field.alias === leftAlias) selectParts.push(`n_start.${col} AS ${field.outputName}`)
      else if (field.alias === rightAlias) selectParts.push(`n_end.${col} AS ${field.outputName}`)
    }
  }

  return selectParts
}
