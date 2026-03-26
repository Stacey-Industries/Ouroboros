/**
 * cypherEngineSupport.ts — Helper types and functions extracted from cypherEngine.ts
 * to keep the main file under the max-lines limit.
 */

// ─── Internal AST types ───────────────────────────────────────────────────────

export type MatchPattern =
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

export interface WhereCondition {
  alias: string
  property: string
  operator: string
  value: string | number
  conjunction: 'AND' | 'OR' | null
}

export interface ParsedQuery {
  match: MatchPattern
  where: WhereCondition[]
  returnFields: ReturnField[]
  orderBy: OrderByClause[]
  limit: number
  isCount: boolean
  isDistinct: boolean
}

export interface ReturnField {
  alias: string
  property: string
  outputName: string
}

export interface OrderByClause {
  alias: string
  property: string
  direction: 'ASC' | 'DESC'
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_ROWS = 200

/** Map Cypher node properties to SQL column names */
export const PROP_TO_COLUMN: Record<string, string> = {
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

// ─── parseMatch helpers ───────────────────────────────────────────────────────

// eslint-disable-next-line security/detect-unsafe-regex -- pattern matches Cypher varpath syntax; bounded quantifiers prevent catastrophic backtracking
const VARPATH_OUT = /\((\w+)(?::(\w+))?\)\s*-\[\s*:?(\w+)\s*\*\s*(\d+)\s*\.\.\s*(\d+)\s*\]\s*->\s*\((\w+)(?::(\w+))?\)/i
// eslint-disable-next-line security/detect-unsafe-regex -- pattern matches Cypher varpath syntax; bounded quantifiers prevent catastrophic backtracking
const VARPATH_IN = /\((\w+)(?::(\w+))?\)\s*<-\[\s*:?(\w+)\s*\*\s*(\d+)\s*\.\.\s*(\d+)\s*\]\s*-\s*\((\w+)(?::(\w+))?\)/i
// eslint-disable-next-line security/detect-unsafe-regex -- pattern matches Cypher hop syntax; bounded quantifiers prevent catastrophic backtracking
const HOP_OUT = /\((\w+)(?::(\w+))?\)\s*-\[\s*:?(\w+)?\s*\]\s*->\s*\((\w+)(?::(\w+))?\)/i
// eslint-disable-next-line security/detect-unsafe-regex -- pattern matches Cypher hop syntax; bounded quantifiers prevent catastrophic backtracking
const HOP_IN = /\((\w+)(?::(\w+))?\)\s*<-\[\s*:?(\w+)?\s*\]\s*-\s*\((\w+)(?::(\w+))?\)/i
// eslint-disable-next-line security/detect-unsafe-regex -- pattern matches single Cypher node; no backtracking risk
const SINGLE_NODE = /\((\w+)(?::(\w+))?\)/i

function tryVarpath(matchStr: string): MatchPattern | null {
  let m = VARPATH_OUT.exec(matchStr)
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
  m = VARPATH_IN.exec(matchStr)
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
  return null
}

function tryHop(matchStr: string): MatchPattern | null {
  let m = HOP_OUT.exec(matchStr)
  if (m) {
    return {
      kind: 'hop',
      left: { alias: m[1], label: m[2] || null },
      right: { alias: m[4], label: m[5] || null },
      edgeType: m[3] || null,
      direction: 'outbound',
    }
  }
  m = HOP_IN.exec(matchStr)
  if (m) {
    return {
      kind: 'hop',
      left: { alias: m[1], label: m[2] || null },
      right: { alias: m[4], label: m[5] || null },
      edgeType: m[3] || null,
      direction: 'inbound',
    }
  }
  return null
}

/** Parse MATCH clause into a MatchPattern. */
export function parseMatch(matchStr: string): MatchPattern {
  const varpath = tryVarpath(matchStr)
  if (varpath) return varpath

  const hop = tryHop(matchStr)
  if (hop) return hop

  const m = SINGLE_NODE.exec(matchStr)
  if (m) {
    return { kind: 'single', alias: m[1], label: m[2] || null }
  }

  throw new Error(`Unsupported MATCH pattern: ${matchStr}`)
}

// ─── parseReturn helpers ──────────────────────────────────────────────────────

function parseCountReturn(
  working: string,
  isDistinct: boolean,
): { fields: ReturnField[]; isCount: boolean; isDistinct: boolean } | null {
  const countMatch = /^COUNT\s*\(\s*(.*)\s*\)$/i.exec(working)
  if (!countMatch) return null

  const inner = countMatch[1].trim()
  if (inner === '*' || /^\w+$/.test(inner)) {
    return {
      fields: [
        {
          alias: inner === '*' ? '_all' : inner,
          property: '*',
          outputName: 'count',
        },
      ],
      isCount: true,
      isDistinct,
    }
  }
  return null
}

function parseReturnField(fieldStr: string): ReturnField | null {
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

  const propMatch = /^(\w+)\.(\w+)$/.exec(expr)
  if (propMatch) {
    return { alias: propMatch[1], property: propMatch[2], outputName }
  }
  if (/^\w+$/.test(expr)) {
    return { alias: expr, property: '*', outputName: expr }
  }
  return null
}

/** Parse RETURN clause into fields and detect COUNT/DISTINCT. */
export function parseReturn(
  returnStr: string,
): { fields: ReturnField[]; isCount: boolean; isDistinct: boolean } {
  let isDistinct = false
  let working = returnStr.trim()

  if (working.toUpperCase().startsWith('DISTINCT')) {
    isDistinct = true
    working = working.slice(8).trim()
  }

  const countResult = parseCountReturn(working, isDistinct)
  if (countResult) return countResult

  const fieldStrs = working.split(',').map((s) => s.trim())
  const fields: ReturnField[] = []
  for (const fieldStr of fieldStrs) {
    if (!fieldStr) continue
    const field = parseReturnField(fieldStr)
    if (field) fields.push(field)
  }

  return { fields, isCount: false, isDistinct }
}

// ─── singleHopSql helpers ─────────────────────────────────────────────────────

/** Build the JOIN condition for a single-hop query. */
export function buildHopJoinCondition(
  edgeAlias: string,
  leftAlias: string,
  rightAlias: string,
  direction: 'outbound' | 'inbound',
): string {
  if (direction === 'outbound') {
    return `${edgeAlias}.source_id = ${leftAlias}.id AND ${edgeAlias}.target_id = ${rightAlias}.id`
  }
  return `${edgeAlias}.target_id = ${leftAlias}.id AND ${edgeAlias}.source_id = ${rightAlias}.id`
}

export type { CypherResolvers, VarpathStartContext, VarpathTemplateOptions } from './cypherEngineVarpath'
export { buildVarpathEndConditions, buildVarpathSelectParts, buildVarpathSqlTemplate, buildVarpathStartConditions } from './cypherEngineVarpath'
