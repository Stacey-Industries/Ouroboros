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

import type { GraphDatabase } from './graphDatabase'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CypherQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
}

// ─── Internal AST types ───────────────────────────────────────────────────────

type MatchPattern =
  | { kind: 'single'; alias: string; label: string | null }
  | {
      kind: 'hop'
      left: { alias: string; label: string | null }
      right: { alias: string; label: string | null }
      edgeType: string | null
      direction: 'outbound' | 'inbound'
    }
  | {
      kind: 'varpath'
      left: { alias: string; label: string | null }
      right: { alias: string; label: string | null }
      edgeType: string | null
      minHops: number
      maxHops: number
      direction: 'outbound' | 'inbound'
    }

interface WhereCondition {
  alias: string
  property: string
  operator: string
  value: string | number
  conjunction: 'AND' | 'OR' | null // how this condition joins to the next
}

interface ParsedQuery {
  match: MatchPattern
  where: WhereCondition[]
  returnFields: ReturnField[]
  orderBy: OrderByClause[]
  limit: number
  isCount: boolean
  isDistinct: boolean
}

interface ReturnField {
  alias: string
  property: string
  outputName: string
}

interface OrderByClause {
  alias: string
  property: string
  direction: 'ASC' | 'DESC'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 200

// Map Cypher node properties to SQL column names
const PROP_TO_COLUMN: Record<string, string> = {
  name: 'name',
  label: 'label',
  file_path: 'file_path',
  filePath: 'file_path',
  start_line: 'start_line',
  startLine: 'start_line',
  end_line: 'end_line',
  endLine: 'end_line',
  qualified_name: 'qualified_name',
  qualifiedName: 'qualified_name',
  id: 'id',
  project: 'project',
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
        mapped[field.outputName] = row[field.outputName] ?? null
      }
      // Handle COUNT results
      if (parsed.isCount && row['_count'] !== undefined) {
        const countKey = parsed.returnFields[0]?.outputName ?? 'count'
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
  // Parser
  // ═══════════════════════════════════════════════════════════════════════════

  private parse(query: string): ParsedQuery {
    // Extract major clauses
    const matchClause = this.extractClause(query, 'MATCH')
    const whereClause = this.extractClause(query, 'WHERE')
    const returnClause = this.extractClause(query, 'RETURN')
    const orderByClause = this.extractClause(query, 'ORDER BY')
    const limitClause = this.extractClause(query, 'LIMIT')

    if (!matchClause) {
      throw new Error('Query must contain a MATCH clause')
    }
    if (!returnClause) {
      throw new Error('Query must contain a RETURN clause')
    }

    const match = this.parseMatch(matchClause)
    const where = whereClause ? this.parseWhere(whereClause) : []
    const { fields: returnFields, isCount, isDistinct } =
      this.parseReturn(returnClause)
    const orderBy = orderByClause ? this.parseOrderBy(orderByClause) : []

    let limit = MAX_ROWS
    if (limitClause) {
      const parsed = parseInt(limitClause.trim(), 10)
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_ROWS)
      }
    }

    return { match, where, returnFields, orderBy, limit, isCount, isDistinct }
  }

  /**
   * Extract the content of a named clause from the query string.
   * Handles the boundaries between clauses correctly.
   */
  private extractClause(query: string, clause: string): string | null {
    const clauseUpper = clause.toUpperCase()
    const queryUpper = query.toUpperCase()

    // For ORDER BY, handle as two words
    const searchStr = clauseUpper
    const idx = queryUpper.indexOf(searchStr)
    if (idx === -1) return null

    const afterClause = idx + searchStr.length
    const content = query.slice(afterClause)

    // Find the next clause boundary
    const nextClauses = ['MATCH', 'WHERE', 'RETURN', 'ORDER BY', 'LIMIT']
      .filter((c) => c !== clause)
      .map((c) => {
        const cIdx = content.toUpperCase().indexOf(c)
        return cIdx === -1 ? Infinity : cIdx
      })

    const nextBoundary = Math.min(...nextClauses)
    return nextBoundary === Infinity ? content.trim() : content.slice(0, nextBoundary).trim()
  }

  /**
   * Parse MATCH clause into a MatchPattern.
   *
   * Supported shapes:
   * - (n:Label)
   * - (n:Label)-[:TYPE]->(m:Label)
   * - (n)<-[:TYPE]-(m)
   * - (n)-[:TYPE*1..3]->(m)
   */
  private parseMatch(matchStr: string): MatchPattern {
    // Variable-length path: (n:Label)-[:TYPE*1..3]->(m:Label)
    const varpathOut =
      /\((\w+)(?::(\w+))?\)\s*-\[\s*:?(\w+)\s*\*\s*(\d+)\s*\.\.\s*(\d+)\s*\]\s*->\s*\((\w+)(?::(\w+))?\)/i
    const varpathIn =
      /\((\w+)(?::(\w+))?\)\s*<-\[\s*:?(\w+)\s*\*\s*(\d+)\s*\.\.\s*(\d+)\s*\]\s*-\s*\((\w+)(?::(\w+))?\)/i

    let m = varpathOut.exec(matchStr)
    if (m) {
      return {
        kind: 'varpath',
        left: { alias: m[1], label: m[2] || null },
        right: { alias: m[6], label: m[7] || null },
        edgeType: m[3] || null,
        minHops: parseInt(m[4], 10),
        maxHops: parseInt(m[5], 10),
        direction: 'outbound',
      }
    }

    m = varpathIn.exec(matchStr)
    if (m) {
      return {
        kind: 'varpath',
        left: { alias: m[1], label: m[2] || null },
        right: { alias: m[6], label: m[7] || null },
        edgeType: m[3] || null,
        minHops: parseInt(m[4], 10),
        maxHops: parseInt(m[5], 10),
        direction: 'inbound',
      }
    }

    // Single hop outbound: (n:Label)-[:TYPE]->(m:Label)
    const hopOut =
      /\((\w+)(?::(\w+))?\)\s*-\[\s*:?(\w+)?\s*\]\s*->\s*\((\w+)(?::(\w+))?\)/i
    m = hopOut.exec(matchStr)
    if (m) {
      return {
        kind: 'hop',
        left: { alias: m[1], label: m[2] || null },
        right: { alias: m[4], label: m[5] || null },
        edgeType: m[3] || null,
        direction: 'outbound',
      }
    }

    // Single hop inbound: (n:Label)<-[:TYPE]-(m:Label)
    const hopIn =
      /\((\w+)(?::(\w+))?\)\s*<-\[\s*:?(\w+)?\s*\]\s*-\s*\((\w+)(?::(\w+))?\)/i
    m = hopIn.exec(matchStr)
    if (m) {
      return {
        kind: 'hop',
        left: { alias: m[1], label: m[2] || null },
        right: { alias: m[4], label: m[5] || null },
        edgeType: m[3] || null,
        direction: 'inbound',
      }
    }

    // Single node: (n:Label) or (n)
    const singleNode = /\((\w+)(?::(\w+))?\)/i
    m = singleNode.exec(matchStr)
    if (m) {
      return {
        kind: 'single',
        alias: m[1],
        label: m[2] || null,
      }
    }

    throw new Error(`Unsupported MATCH pattern: ${matchStr}`)
  }

  /**
   * Parse WHERE clause into conditions.
   *
   * Supports: =, <>, CONTAINS, STARTS WITH, ENDS WITH, >, <, >=, <=
   * Conjunctions: AND, OR
   */
  private parseWhere(whereStr: string): WhereCondition[] {
    const conditions: WhereCondition[] = []

    // Split by AND/OR while preserving the conjunction
    const parts: Array<{ condition: string; conjunction: 'AND' | 'OR' | null }> = []
    const tokens = whereStr.split(/\b(AND|OR)\b/i)

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim()
      if (!token) continue

      if (token.toUpperCase() === 'AND' || token.toUpperCase() === 'OR') {
        // This is a conjunction, attach it to the previous condition
        if (parts.length > 0) {
          parts[parts.length - 1].conjunction = token.toUpperCase() as
            | 'AND'
            | 'OR'
        }
        continue
      }

      parts.push({ condition: token, conjunction: null })
    }

    for (const part of parts) {
      const cond = this.parseSingleCondition(part.condition)
      if (cond) {
        cond.conjunction = part.conjunction
        conditions.push(cond)
      }
    }

    return conditions
  }

  /** Parse a single WHERE condition like n.name = 'foo' */
  private parseSingleCondition(condStr: string): WhereCondition | null {
    // Property access: alias.property
    const propAccess = /(\w+)\.(\w+)/
    const propMatch = propAccess.exec(condStr)
    if (!propMatch) return null

    const alias = propMatch[1]
    const property = propMatch[2]

    // Find the operator and value after the property reference
    const afterProp = condStr.slice(propMatch.index + propMatch[0].length).trim()

    // Try each operator pattern (order matters: longer operators first)
    const operators: Array<{ pattern: RegExp; op: string }> = [
      { pattern: /^STARTS\s+WITH\s+/i, op: 'STARTS WITH' },
      { pattern: /^ENDS\s+WITH\s+/i, op: 'ENDS WITH' },
      { pattern: /^CONTAINS\s+/i, op: 'CONTAINS' },
      { pattern: /^<>\s*/, op: '<>' },
      { pattern: /^>=\s*/, op: '>=' },
      { pattern: /^<=\s*/, op: '<=' },
      { pattern: /^>\s*/, op: '>' },
      { pattern: /^<\s*/, op: '<' },
      { pattern: /^=\s*/, op: '=' },
    ]

    for (const { pattern, op } of operators) {
      const opMatch = pattern.exec(afterProp)
      if (opMatch) {
        const valueStr = afterProp.slice(opMatch[0].length).trim()
        const value = this.parseValue(valueStr)
        return { alias, property, operator: op, value, conjunction: null }
      }
    }

    return null
  }

  /** Parse a value literal: 'string', number, or bare identifier. */
  private parseValue(valueStr: string): string | number {
    // Quoted string (single or double quotes)
    const singleQuoted = /^'([^']*)'/.exec(valueStr)
    if (singleQuoted) return singleQuoted[1]

    const doubleQuoted = /^"([^"]*)"/.exec(valueStr)
    if (doubleQuoted) return doubleQuoted[1]

    // Number
    const num = parseFloat(valueStr)
    if (!isNaN(num)) return num

    // Bare identifier (treat as string)
    return valueStr
  }

  /** Parse RETURN clause into fields and detect COUNT/DISTINCT. */
  private parseReturn(
    returnStr: string,
  ): { fields: ReturnField[]; isCount: boolean; isDistinct: boolean } {
    let isCount = false
    let isDistinct = false
    let working = returnStr.trim()

    // Check for DISTINCT
    if (working.toUpperCase().startsWith('DISTINCT')) {
      isDistinct = true
      working = working.slice(8).trim()
    }

    // Check for COUNT
    const countMatch = /^COUNT\s*\(\s*(.*)\s*\)$/i.exec(working)
    if (countMatch) {
      isCount = true
      working = countMatch[1].trim()
      // COUNT(*) or COUNT(n)
      if (working === '*' || /^\w+$/.test(working)) {
        return {
          fields: [
            {
              alias: working === '*' ? '_all' : working,
              property: '*',
              outputName: `count`,
            },
          ],
          isCount: true,
          isDistinct,
        }
      }
    }

    // Parse comma-separated return fields
    const fieldStrs = working.split(',').map((s) => s.trim())
    const fields: ReturnField[] = []

    for (const fieldStr of fieldStrs) {
      if (!fieldStr) continue

      // Check for AS alias
      const asMatch = /^(.+?)\s+AS\s+(\w+)$/i.exec(fieldStr)
      let expr: string
      let outputName: string

      if (asMatch) {
        expr = asMatch[1].trim()
        outputName = asMatch[2]
      } else {
        expr = fieldStr
        outputName = fieldStr.replace('.', '_')
      }

      // Parse property access: alias.property
      const propMatch = /^(\w+)\.(\w+)$/.exec(expr)
      if (propMatch) {
        fields.push({
          alias: propMatch[1],
          property: propMatch[2],
          outputName,
        })
      } else if (/^\w+$/.test(expr)) {
        // Bare alias — return all properties as a node
        fields.push({
          alias: expr,
          property: '*',
          outputName: expr,
        })
      }
    }

    return { fields, isCount, isDistinct }
  }

  /** Parse ORDER BY clause. */
  private parseOrderBy(orderByStr: string): OrderByClause[] {
    const clauses: OrderByClause[] = []
    const parts = orderByStr.split(',').map((s) => s.trim())

    for (const part of parts) {
      if (!part) continue

      const desc = /\bDESC\b/i.test(part)
      const clean = part.replace(/\b(ASC|DESC)\b/gi, '').trim()
      const propMatch = /^(\w+)\.(\w+)$/.exec(clean)

      if (propMatch) {
        clauses.push({
          alias: propMatch[1],
          property: propMatch[2],
          direction: desc ? 'DESC' : 'ASC',
        })
      }
    }

    return clauses
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

    // Build SELECT
    const selectCols = this.buildSelectColumns(parsed, match.alias)

    // Build WHERE
    const conditions: string[] = [`${match.alias}.project = ?`]
    params.push(this.projectName)

    if (match.label) {
      conditions.push(`${match.alias}.label = ?`)
      params.push(match.label)
    }

    this.addWhereConditions(parsed.where, conditions, params)

    // Build ORDER BY
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

    const selectCols = this.buildSelectColumns(parsed, left.alias, right.alias)

    // JOIN: nodes left JOIN edges e ON ... JOIN nodes right ON ...
    const edgeAlias = 'e'
    let joinCondition: string
    if (direction === 'outbound') {
      joinCondition = `${edgeAlias}.source_id = ${left.alias}.id AND ${edgeAlias}.target_id = ${right.alias}.id`
    } else {
      joinCondition = `${edgeAlias}.target_id = ${left.alias}.id AND ${edgeAlias}.source_id = ${right.alias}.id`
    }

    const conditions: string[] = [`${left.alias}.project = ?`]
    params.push(this.projectName)

    if (left.label) {
      conditions.push(`${left.alias}.label = ?`)
      params.push(left.label)
    }
    if (right.label) {
      conditions.push(`${right.alias}.label = ?`)
      params.push(right.label)
    }
    if (edgeType) {
      conditions.push(`${edgeAlias}.type = ?`)
      params.push(edgeType)
    }

    this.addWhereConditions(parsed.where, conditions, params)

    const orderBy = this.buildOrderBy(parsed.orderBy)
    const distinct = parsed.isDistinct ? 'DISTINCT ' : ''

    const sql = [
      `SELECT ${distinct}${selectCols}`,
      `FROM nodes ${left.alias}`,
      `JOIN edges ${edgeAlias} ON ${joinCondition}`,
      `JOIN nodes ${right.alias} ON ${right.alias}.id = ${direction === 'outbound' ? `${edgeAlias}.target_id` : `${edgeAlias}.source_id`}`,
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
  private varpathSql(
    parsed: ParsedQuery,
  ): { text: string; params: unknown[] } {
    const match = parsed.match as Extract<MatchPattern, { kind: 'varpath' }>
    const params: unknown[] = []
    const { left, right, edgeType, minHops, maxHops, direction } = match

    // Build the start node conditions
    const startConditions: string[] = ['n_start.project = ?']
    params.push(this.projectName)

    if (left.label) {
      startConditions.push('n_start.label = ?')
      params.push(left.label)
    }

    // Add WHERE conditions that reference the left alias as start node filters
    for (const cond of parsed.where) {
      if (cond.alias === left.alias) {
        const col = this.resolveColumn(cond.property)
        const sqlOp = this.cypherOpToSql(cond.operator)
        startConditions.push(`n_start.${col} ${sqlOp} ?`)
        params.push(cond.value)
      }
    }

    // Edge type filter in the CTE
    const typeFilter = edgeType ? `AND e.type = '${this.sanitizeIdentifier(edgeType)}'` : ''

    // Build the traversal direction
    const edgeJoin =
      direction === 'outbound'
        ? `e.source_id = r.current_id ${typeFilter}`
        : `e.target_id = r.current_id ${typeFilter}`
    const nextNode =
      direction === 'outbound' ? 'e.target_id' : 'e.source_id'

    // Build right-side conditions for the final match
    const endConditions: string[] = []
    if (right.label) {
      endConditions.push(`n_end.label = ?`)
      params.push(right.label)
    }

    // WHERE conditions for the right alias
    for (const cond of parsed.where) {
      if (cond.alias === right.alias) {
        const col = this.resolveColumn(cond.property)
        const sqlOp = this.cypherOpToSql(cond.operator)
        endConditions.push(`n_end.${col} ${sqlOp} ?`)
        params.push(cond.value)
      }
    }

    const endWhere =
      endConditions.length > 0
        ? `AND ${endConditions.join(' AND ')}`
        : ''

    // Build SELECT for the outer query mapping aliases
    const selectParts: string[] = []
    for (const field of parsed.returnFields) {
      if (field.property === '*') {
        if (field.alias === left.alias) {
          selectParts.push(`n_start.id AS ${field.outputName}`)
        } else if (field.alias === right.alias) {
          selectParts.push(`n_end.id AS ${field.outputName}`)
        }
      } else {
        const col = this.resolveColumn(field.property)
        if (field.alias === left.alias) {
          selectParts.push(`n_start.${col} AS ${field.outputName}`)
        } else if (field.alias === right.alias) {
          selectParts.push(`n_end.${col} AS ${field.outputName}`)
        }
      }
    }

    // Add depth for reference
    if (selectParts.length === 0) {
      selectParts.push('n_end.*')
    }

    const orderBy = this.buildOrderBy(parsed.orderBy)
    const distinct = parsed.isDistinct ? 'DISTINCT ' : ''

    const sql = `
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
    `

    params.push(maxHops) // max recursion depth
    params.push(minHops) // min hops filter
    params.push(maxHops) // max hops filter
    params.push(parsed.limit)

    return { text: sql.trim(), params }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SQL building helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Build SELECT column list from RETURN fields. */
  private buildSelectColumns(
    parsed: ParsedQuery,
    ...availableAliases: string[]
  ): string {
    if (parsed.isCount) {
      return 'COUNT(*) AS _count'
    }

    const cols: string[] = []

    for (const field of parsed.returnFields) {
      if (field.property === '*') {
        // Return all columns for the alias
        if (availableAliases.includes(field.alias)) {
          cols.push(`${field.alias}.*`)
        }
      } else {
        const col = this.resolveColumn(field.property)
        if (availableAliases.includes(field.alias)) {
          cols.push(`${field.alias}.${col} AS ${field.outputName}`)
        } else if (col === 'props') {
          // Access JSON property
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
    for (let i = 0; i < where.length; i++) {
      const cond = where[i]
      const col = this.resolveColumn(cond.property)
      const sqlOp = this.cypherOpToSql(cond.operator)
      const colRef = `${cond.alias}.${col}`

      // If it's a non-standard column, try json_extract
      let expression: string
      if (PROP_TO_COLUMN[cond.property]) {
        expression = colRef
      } else {
        expression = `json_extract(${cond.alias}.props, '$.${cond.property}')`
      }

      const condStr = `${expression} ${sqlOp} ?`

      if (i > 0 && where[i - 1].conjunction === 'OR') {
        // Replace the last AND with OR
        const lastCond = conditions.pop()
        if (lastCond) {
          conditions.push(`(${lastCond} OR ${condStr})`)
        } else {
          conditions.push(condStr)
        }
      } else {
        conditions.push(condStr)
      }

      // Handle CONTAINS, STARTS WITH, ENDS WITH value wrapping
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
    return PROP_TO_COLUMN[property] ?? property
  }

  /**
   * Convert Cypher comparison operators to SQL operators.
   * CONTAINS, STARTS WITH, ENDS WITH become LIKE (values wrapped by caller).
   */
  private cypherOpToSql(op: string): string {
    switch (op) {
      case 'CONTAINS':
        return 'LIKE'
      case 'STARTS WITH':
        return 'LIKE'
      case 'ENDS WITH':
        return 'LIKE'
      case '=':
        return '='
      case '<>':
        return '<>'
      case '>':
        return '>'
      case '<':
        return '<'
      case '>=':
        return '>='
      case '<=':
        return '<='
      default:
        return '='
    }
  }

  /** Safety: check if a query contains write operations. */
  private isWriteQuery(query: string): boolean {
    const upper = query.toUpperCase().trim()
    const writeKeywords = [
      'CREATE',
      'DELETE',
      'REMOVE',
      'SET ',
      'MERGE',
      'DROP',
      'INSERT',
      'UPDATE',
      'ALTER',
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
