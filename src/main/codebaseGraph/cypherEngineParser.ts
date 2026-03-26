/**
 * cypherEngineParser.ts — Clause extraction and WHERE/ORDER BY parsing helpers
 * extracted from CypherEngine class methods.
 *
 * All functions are pure (no class state). They transform query strings into
 * structured types defined in cypherEngineSupport.ts.
 */

import type { OrderByClause, WhereCondition } from './cypherEngineSupport'

// ─── Clause extraction ────────────────────────────────────────────────────────

/** Extract the content of a named clause from the query string. */
export function extractClause(query: string, clause: string): string | null {
  const clauseUpper = clause.toUpperCase()
  const queryUpper = query.toUpperCase()

  const idx = queryUpper.indexOf(clauseUpper)
  if (idx === -1) return null

  const afterClause = idx + clauseUpper.length
  const content = query.slice(afterClause)

  const nextClauses = ['MATCH', 'WHERE', 'RETURN', 'ORDER BY', 'LIMIT']
    .filter((c) => c !== clause)
    .map((c) => {
      const cIdx = content.toUpperCase().indexOf(c)
      return cIdx === -1 ? Infinity : cIdx
    })

  const nextBoundary = Math.min(...nextClauses)
  return nextBoundary === Infinity ? content.trim() : content.slice(0, nextBoundary).trim()
}

// ─── WHERE parsing ────────────────────────────────────────────────────────────

/** Parse a value literal: 'string', number, or bare identifier. */
function parseValue(valueStr: string): string | number {
  const singleQuoted = /^'([^']*)'/.exec(valueStr)
  if (singleQuoted) return singleQuoted[1]

  const doubleQuoted = /^"([^"]*)"/.exec(valueStr)
  if (doubleQuoted) return doubleQuoted[1]

  const num = parseFloat(valueStr)
  if (!isNaN(num)) return num

  return valueStr
}

const WHERE_OPERATORS: Array<{ pattern: RegExp; op: string }> = [
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

/** Parse a single WHERE condition like n.name = 'foo'. */
export function parseSingleCondition(condStr: string): WhereCondition | null {
  const propMatch = /(\w+)\.(\w+)/.exec(condStr)
  if (!propMatch) return null

  const alias = propMatch[1]
  const property = propMatch[2]
  const afterProp = condStr.slice(propMatch.index + propMatch[0].length).trim()

  for (const { pattern, op } of WHERE_OPERATORS) {
    const opMatch = pattern.exec(afterProp)
    if (opMatch) {
      const value = parseValue(afterProp.slice(opMatch[0].length).trim())
      return { alias, property, operator: op, value, conjunction: null }
    }
  }

  return null
}

/** Parse WHERE clause into conditions. */
export function parseWhere(whereStr: string): WhereCondition[] {
  const conditions: WhereCondition[] = []
  const parts: Array<{ condition: string; conjunction: 'AND' | 'OR' | null }> = []

  for (const token of whereStr.split(/\b(AND|OR)\b/i)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const upper = trimmed.toUpperCase()
    if (upper === 'AND' || upper === 'OR') {
      if (parts.length > 0) parts[parts.length - 1].conjunction = upper as 'AND' | 'OR'
      continue
    }
    parts.push({ condition: trimmed, conjunction: null })
  }

  for (const part of parts) {
    const cond = parseSingleCondition(part.condition)
    if (cond) { cond.conjunction = part.conjunction; conditions.push(cond) }
  }

  return conditions
}

// ─── ORDER BY parsing ─────────────────────────────────────────────────────────

/** Parse ORDER BY clause into a list of sort directives. */
export function parseOrderBy(orderByStr: string): OrderByClause[] {
  const clauses: OrderByClause[] = []
  for (const part of orderByStr.split(',').map((s) => s.trim())) {
    if (!part) continue
    const desc = /\bDESC\b/i.test(part)
    const clean = part.replace(/\b(ASC|DESC)\b/gi, '').trim()
    const propMatch = /^(\w+)\.(\w+)$/.exec(clean)
    if (propMatch) {
      clauses.push({ alias: propMatch[1], property: propMatch[2], direction: desc ? 'DESC' : 'ASC' })
    }
  }
  return clauses
}
