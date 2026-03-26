/**
 * cypherEngine.ts — Minimal Cypher-subset query engine.
 *
 * Translates a limited subset of Cypher queries into SQL against the
 * nodes/edges tables in GraphDatabase. Pattern-based (not a full parser):
 * matches known query shapes and generates corresponding SQL.
 *
 * Supported patterns:
 * - MATCH (n:Label) WHERE ... RETURN ...
 * - MATCH (n:Label)-[:TYPE]->(m:Label) WHERE ... RETURN ...
 * - MATCH (n)-[:TYPE*1..3]->(m) WHERE ... RETURN ...
 * - WHERE: =, <>, CONTAINS, STARTS WITH, ENDS WITH, >, <, >=, <=, AND, OR
 * - RETURN with property access (n.name, n.file_path)
 * - ORDER BY, LIMIT, COUNT, DISTINCT
 *
 * Read-only: rejects anything that isn't a SELECT/WITH statement.
 * Results capped at 200 rows.
 */

import { extractClause, parseOrderBy, parseWhere } from './cypherEngineParser'
import type {
  CypherResolvers,
  MatchPattern,
  OrderByClause,
  ParsedQuery,
  ReturnField,
  VarpathStartContext,
  WhereCondition,
} from './cypherEngineSupport'
import {
  buildHopJoinCondition,
  buildVarpathEndConditions,
  buildVarpathSelectParts,
  buildVarpathSqlTemplate,
  buildVarpathStartConditions,
  MAX_ROWS,
  parseMatch,
  parseReturn,
  PROP_TO_COLUMN,
} from './cypherEngineSupport'
import type { GraphDatabase } from './graphDatabase'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CypherQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
}

// ─── CypherEngine ─────────────────────────────────────────────────────────────

export class CypherEngine {
  constructor(
    private db: GraphDatabase,
    private projectName: string,
  ) {}

  execute(query: string): CypherQueryResult {
    const trimmed = query.trim()

    // Safety: reject anything that looks like a write operation
    if (this.isWriteQuery(trimmed)) {
      throw new Error('Only read-only queries are allowed')
    }

    const parsed = this.parse(trimmed)
    const sql = this.toSql(parsed)

    const rawRows = this.db.rawQuery(sql.text, sql.params) as Record<
      string,
      unknown
    >[]

    // Map rows to use the Cypher RETURN column names
    const mappedRows = rawRows.map((row) => {
      const mapped: Record<string, unknown> = {}
      for (const field of parsed.returnFields) {
        mapped[field.outputName] = (row as Record<string, unknown>)[field.outputName] ?? null
      }
      // Handle COUNT results
      if (parsed.isCount && row['_count'] !== undefined) {
        const countKey = parsed.returnFields[0]?.outputName ?? 'count'
        // eslint-disable-next-line security/detect-object-injection -- countKey is derived from validated RETURN field names
        mapped[countKey] = row['_count']
      }
      return mapped
    })

    return {
      columns: parsed.returnFields.map((f) => f.outputName),
      rows: mappedRows,
      total: mappedRows.length,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Parser (delegates to cypherEngineParser.ts standalone functions)
  // ═══════════════════════════════════════════════════════════════════════════

  private parse(query: string): ParsedQuery {
    const matchClause = extractClause(query, 'MATCH')
    const whereClause = extractClause(query, 'WHERE')
    const returnClause = extractClause(query, 'RETURN')
    const orderByClause = extractClause(query, 'ORDER BY')
    const limitClause = extractClause(query, 'LIMIT')

    if (!matchClause) throw new Error('Query must contain a MATCH clause')
    if (!returnClause) throw new Error('Query must contain a RETURN clause')

    const match = parseMatch(matchClause)
    const where = whereClause ? parseWhere(whereClause) : []
    const { fields: returnFields, isCount, isDistinct } = parseReturn(returnClause)
    const orderBy = orderByClause ? parseOrderBy(orderByClause) : []

    let limit = MAX_ROWS
    if (limitClause) {
      const parsed = parseInt(limitClause.trim(), 10)
      if (!isNaN(parsed) && parsed > 0) limit = Math.min(parsed, MAX_ROWS)
    }

    return { match, where, returnFields, orderBy, limit, isCount, isDistinct }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SQL Generator
  // ═══════════════════════════════════════════════════════════════════════════

  private toSql(parsed: ParsedQuery): { text: string; params: unknown[] } {
    switch (parsed.match.kind) {
      case 'single':
        return this.singleNodeSql(parsed)
      case 'hop':
        return this.singleHopSql(parsed)
      case 'varpath':
        return this.varpathSql(parsed)
    }
  }

  /** Single node match: MATCH (n:Label) ... */
  private singleNodeSql(
    parsed: ParsedQuery,
  ): { text: string; params: unknown[] } {
    const match = parsed.match as Extract<MatchPattern, { kind: 'single' }>
    const params: unknown[] = []

    const selectCols = this.buildSelectColumns(parsed, match.alias)

    const conditions: string[] = [`${match.alias}.project = ?`]
    params.push(this.projectName)

    if (match.label) {
      conditions.push(`${match.alias}.label = ?`)
      params.push(match.label)
    }

    this.addWhereConditions(parsed.where, conditions, params)

    const orderBy = this.buildOrderBy(parsed.orderBy)
    const distinct = parsed.isDistinct ? 'DISTINCT ' : ''

    const sql = [
      `SELECT ${distinct}${selectCols}`,
      `FROM nodes ${match.alias}`,
      `WHERE ${conditions.join(' AND ')}`,
      orderBy ? `ORDER BY ${orderBy}` : '',
      `LIMIT ?`,
    ]
      .filter(Boolean)
      .join(' ')

    params.push(parsed.limit)
    return { text: sql, params }
  }

  /** Single hop: MATCH (n)-[:TYPE]->(m) ... */
  private singleHopSql(
    parsed: ParsedQuery,
  ): { text: string; params: unknown[] } {
    const match = parsed.match as Extract<MatchPattern, { kind: 'hop' }>
    const params: unknown[] = []
    const { left, right, edgeType, direction } = match
    const edgeAlias = 'e'

    const selectCols = this.buildSelectColumns(parsed, left.alias, right.alias)
    const joinCondition = buildHopJoinCondition(edgeAlias, left.alias, right.alias, direction)

    const conditions: string[] = [`${left.alias}.project = ?`]
    params.push(this.projectName)

    if (left.label) { conditions.push(`${left.alias}.label = ?`); params.push(left.label) }
    if (right.label) { conditions.push(`${right.alias}.label = ?`); params.push(right.label) }
    if (edgeType) { conditions.push(`${edgeAlias}.type = ?`); params.push(edgeType) }

    this.addWhereConditions(parsed.where, conditions, params)

    const orderBy = this.buildOrderBy(parsed.orderBy)
    const distinct = parsed.isDistinct ? 'DISTINCT ' : ''
    const rightJoinCol = direction === 'outbound' ? `${edgeAlias}.target_id` : `${edgeAlias}.source_id`

    const sql = [
      `SELECT ${distinct}${selectCols}`,
      `FROM nodes ${left.alias}`,
      `JOIN edges ${edgeAlias} ON ${joinCondition}`,
      `JOIN nodes ${right.alias} ON ${right.alias}.id = ${rightJoinCol}`,
      `WHERE ${conditions.join(' AND ')}`,
      orderBy ? `ORDER BY ${orderBy}` : '',
      `LIMIT ?`,
    ]
      .filter(Boolean)
      .join(' ')

    params.push(parsed.limit)
    return { text: sql, params }
  }

  /** Variable-length path: MATCH (n)-[:TYPE*1..3]->(m) ... */
  private varpathSql(parsed: ParsedQuery): { text: string; params: unknown[] } {
    const match = parsed.match as Extract<MatchPattern, { kind: 'varpath' }>
    const params: unknown[] = []
    const { left, right, edgeType, minHops, maxHops, direction } = match
    const resolvers: CypherResolvers = { resolveColumn: (p) => this.resolveColumn(p), cypherOpToSql: (op) => this.cypherOpToSql(op) }

    const startCtx: VarpathStartContext = { left, projectName: this.projectName }
    const startConditions = buildVarpathStartConditions(startCtx, parsed.where, params, resolvers)
    const endConditions = buildVarpathEndConditions(right, parsed.where, params, resolvers)
    const rawSelectParts = buildVarpathSelectParts(parsed.returnFields, left.alias, right.alias, (p) => this.resolveColumn(p))

    const typeFilter = edgeType ? `AND e.type = '${this.sanitizeIdentifier(edgeType)}'` : ''
    const nextNode = direction === 'outbound' ? 'e.target_id' : 'e.source_id'
    const edgeJoin = direction === 'outbound'
      ? `e.source_id = r.current_id ${typeFilter}`
      : `e.target_id = r.current_id ${typeFilter}`
    const endWhere = endConditions.length > 0 ? `AND ${endConditions.join(' AND ')}` : ''
    const selectParts = rawSelectParts.length === 0 ? ['n_end.*'] : rawSelectParts
    const orderBy = this.buildOrderBy(parsed.orderBy)
    const distinct = parsed.isDistinct ? 'DISTINCT ' : ''

    const sql = buildVarpathSqlTemplate({ startConditions, nextNode, edgeJoin, endWhere, distinct, selectParts, orderBy })
    params.push(maxHops, minHops, maxHops, parsed.limit)
    return { text: sql, params }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SQL building helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Build SELECT column list from RETURN fields. */
  private buildSelectColumns(
    parsed: ParsedQuery,
    ...availableAliases: string[]
  ): string {
    if (parsed.isCount) return 'COUNT(*) AS _count'

    const cols: string[] = []

    for (const field of parsed.returnFields) {
      if (field.property === '*') {
        if (availableAliases.includes(field.alias)) {
          cols.push(`${field.alias}.*`)
        }
      } else {
        const col = this.resolveColumn(field.property)
        if (availableAliases.includes(field.alias)) {
          cols.push(`${field.alias}.${col} AS ${field.outputName}`)
        } else {
          cols.push(
            `json_extract(${field.alias}.props, '$.${field.property}') AS ${field.outputName}`,
          )
        }
      }
    }

    return cols.length > 0 ? cols.join(', ') : `${availableAliases[0]}.*`
  }

  /** Add WHERE conditions to the SQL conditions array. */
  private addWhereConditions(
    where: WhereCondition[],
    conditions: string[],
    params: unknown[],
  ): void {
    let prevConjunction: 'AND' | 'OR' | null = null
    for (const cond of where) {
      const col = this.resolveColumn(cond.property)
      const sqlOp = this.cypherOpToSql(cond.operator)
      const colRef = `${cond.alias}.${col}`
      const expression = this.buildWhereExpression(cond.property, cond.alias, colRef)
      const condStr = `${expression} ${sqlOp} ?`
      this.mergeCondition(conditions, condStr, prevConjunction)
      this.pushWhereParam(params, cond)
      prevConjunction = cond.conjunction
    }
  }

  /** Return the SQL expression for a WHERE property (column ref or json_extract). */
  private buildWhereExpression(property: string, alias: string, colRef: string): string {
    // eslint-disable-next-line security/detect-object-injection -- property is a validated identifier from the parsed WHERE clause
    return PROP_TO_COLUMN[property]
      ? colRef
      : `json_extract(${alias}.props, '$.${property}')`
  }

  /** Merge a new condition, collapsing OR pairs into a single expression. */
  private mergeCondition(conditions: string[], condStr: string, prevConjunction: 'AND' | 'OR' | null): void {
    if (prevConjunction === 'OR') {
      const lastCond = conditions.pop()
      conditions.push(lastCond ? `(${lastCond} OR ${condStr})` : condStr)
    } else {
      conditions.push(condStr)
    }
  }

  /** Push the parameter value for a WHERE condition (handles LIKE wrapping). */
  private pushWhereParam(params: unknown[], cond: WhereCondition): void {
    if (cond.operator === 'CONTAINS') {
      params.push(`%${cond.value}%`)
    } else if (cond.operator === 'STARTS WITH') {
      params.push(`${cond.value}%`)
    } else if (cond.operator === 'ENDS WITH') {
      params.push(`%${cond.value}`)
    } else {
      params.push(cond.value)
    }
  }

  /** Build ORDER BY clause. */
  private buildOrderBy(orderBy: OrderByClause[]): string {
    if (orderBy.length === 0) return ''

    return orderBy
      .map((o) => {
        const col = this.resolveColumn(o.property)
        return `${o.alias}.${col} ${o.direction}`
      })
      .join(', ')
  }

  /** Map Cypher property name to SQL column name. */
  private resolveColumn(property: string): string {
    // eslint-disable-next-line security/detect-object-injection -- property is a validated identifier from the parsed query
    return PROP_TO_COLUMN[property] ?? property
  }

  /**
   * Convert Cypher comparison operators to SQL operators.
   */
  private cypherOpToSql(op: string): string {
    switch (op) {
      case 'CONTAINS':
      case 'STARTS WITH':
      case 'ENDS WITH':
        return 'LIKE'
      case '=': return '='
      case '<>': return '<>'
      case '>': return '>'
      case '<': return '<'
      case '>=': return '>='
      case '<=': return '<='
      default: return '='
    }
  }

  /** Safety: check if a query contains write operations. */
  private isWriteQuery(query: string): boolean {
    const upper = query.toUpperCase().trim()
    const writeKeywords = [
      'CREATE', 'DELETE', 'REMOVE', 'SET ', 'MERGE',
      'DROP', 'INSERT', 'UPDATE', 'ALTER',
    ]
    return writeKeywords.some(
      (kw) => upper.startsWith(kw) || upper.includes(` ${kw}`),
    )
  }

  /** Sanitize an identifier to prevent SQL injection in inline values. */
  private sanitizeIdentifier(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '')
  }
}

// Re-export types that consumers may need
export type { MatchPattern, OrderByClause,ParsedQuery, ReturnField, WhereCondition }
