/**
 * cypherEngineSqlHelpers.ts — SQL building helpers extracted from CypherEngine
 * to keep cypherEngine.ts under the 300-line ESLint limit.
 */

import type { OrderByClause, WhereCondition } from './cypherEngineSupport';
import { PROP_TO_COLUMN } from './cypherEngineSupport';

/** Map Cypher property name to SQL column name. */
export function resolveColumn(property: string): string {
  // eslint-disable-next-line security/detect-object-injection -- property is a validated identifier from the parsed query
  return PROP_TO_COLUMN[property] ?? property;
}

/** Convert Cypher comparison operators to SQL operators. */
export function cypherOpToSql(op: string): string {
  switch (op) {
    case 'CONTAINS':
    case 'STARTS WITH':
    case 'ENDS WITH':
      return 'LIKE';
    case '=':
      return '=';
    case '<>':
      return '<>';
    case '>':
      return '>';
    case '<':
      return '<';
    case '>=':
      return '>=';
    case '<=':
      return '<=';
    default:
      return '=';
  }
}

/** Build ORDER BY clause. */
export function buildOrderBy(orderBy: OrderByClause[]): string {
  if (orderBy.length === 0) return '';
  return orderBy
    .map((o) => {
      const col = resolveColumn(o.property);
      return `${o.alias}.${col} ${o.direction}`;
    })
    .join(', ');
}

/** Return the SQL expression for a WHERE property (column ref or json_extract). */
export function buildWhereExpression(property: string, alias: string, colRef: string): string {
  // eslint-disable-next-line security/detect-object-injection -- property is a validated identifier from the parsed WHERE clause
  return PROP_TO_COLUMN[property] ? colRef : `json_extract(${alias}.props, '$.${property}')`;
}

/** Merge a new condition, collapsing OR pairs into a single expression. */
export function mergeCondition(
  conditions: string[],
  condStr: string,
  prevConjunction: 'AND' | 'OR' | null,
): void {
  if (prevConjunction === 'OR') {
    const lastCond = conditions.pop();
    conditions.push(lastCond ? `(${lastCond} OR ${condStr})` : condStr);
  } else {
    conditions.push(condStr);
  }
}

/** Push the parameter value for a WHERE condition (handles LIKE wrapping). */
export function pushWhereParam(params: unknown[], cond: WhereCondition): void {
  if (cond.operator === 'CONTAINS') {
    params.push(`%${cond.value}%`);
  } else if (cond.operator === 'STARTS WITH') {
    params.push(`${cond.value}%`);
  } else if (cond.operator === 'ENDS WITH') {
    params.push(`%${cond.value}`);
  } else {
    params.push(cond.value);
  }
}

/** Safety: check if a query contains write operations. */
export function isWriteQuery(query: string): boolean {
  const upper = query.toUpperCase().trim();
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
  ];
  return writeKeywords.some((kw) => upper.startsWith(kw) || upper.includes(` ${kw}`));
}

/** Sanitize an identifier to prevent SQL injection in inline values. */
export function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '');
}
