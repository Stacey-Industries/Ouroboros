/**
 * cypherEngineParser.ts — Clause extraction and WHERE/ORDER BY parsing helpers
 * extracted from CypherEngine class methods.
 *
 * All functions are pure (no class state). They transform query strings into
 * structured types defined in cypherEngineSupport.ts.
 */

import type { OrderByClause, WhereCondition } from './cypherEngineSupport';

// ─── Clause extraction ────────────────────────────────────────────────────────
//
// WHERE-clause grammar supported:
//   <alias>.<prop>  {= | <> | < | > | <= | >= | CONTAINS | STARTS WITH | ENDS WITH}  <value>
//   <alias>.<prop>  IN  [<value>, <value>, ...]
//   labels(<alias>) IN [<value>, <value>, ...]   (sugar for <alias>.label IN [...])
// Multiple conditions joined by AND / OR.
// Anything that doesn't match these shapes throws — silent drop hides bugs.

const SUPPORTED_FEATURES_HINT =
  'Supported: MATCH, OPTIONAL MATCH, UNWIND [...] AS x, WHERE, RETURN, ORDER BY, LIMIT. ' +
  'NOT supported: WITH (pipeline operator). See get_graph_schema for the full feature list.';

/**
 * Throw a clear error if the query contains a top-level clause that the engine
 * does not support. Currently only WITH is permanently unsupported; OPTIONAL MATCH
 * and UNWIND are handled by dedicated parse paths.
 */
export function assertNoUnsupportedClauses(query: string): void {
  const upper = query.toUpperCase();
  // Match WITH as a clause keyword: must be at start or after whitespace,
  // and followed by whitespace or end-of-string (not "WITHOUT", "WIDTH", etc.)
  if (/(?:^|\s)WITH\s/i.test(upper)) {
    throw new Error(
      `Cypher feature not supported by Ouroboros mini-engine: WITH (pipeline operator). ` +
        SUPPORTED_FEATURES_HINT,
    );
  }
}

/** Extract the content of a named clause from the query string. */
export function extractClause(query: string, clause: string): string | null {
  const clauseUpper = clause.toUpperCase();
  const queryUpper = query.toUpperCase();

  const idx = queryUpper.indexOf(clauseUpper);
  if (idx === -1) return null;

  const afterClause = idx + clauseUpper.length;
  const content = query.slice(afterClause);

  const nextClauses = ['MATCH', 'WHERE', 'RETURN', 'ORDER BY', 'LIMIT']
    .filter((c) => c !== clause)
    .map((c) => {
      const cIdx = content.toUpperCase().indexOf(c);
      return cIdx === -1 ? Infinity : cIdx;
    });

  const nextBoundary = Math.min(...nextClauses);
  return nextBoundary === Infinity ? content.trim() : content.slice(0, nextBoundary).trim();
}

// ─── WHERE parsing ────────────────────────────────────────────────────────────

/** Parse a value literal: 'string', number, or bare identifier. */
function parseValue(valueStr: string): string | number {
  const singleQuoted = /^'([^']*)'/.exec(valueStr);
  if (singleQuoted) return singleQuoted[1];

  const doubleQuoted = /^"([^"]*)"/.exec(valueStr);
  if (doubleQuoted) return doubleQuoted[1];

  const num = parseFloat(valueStr);
  if (!isNaN(num)) return num;

  return valueStr;
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
];

/** Parse the items inside an IN list literal (between [ and ]). */
function parseInListValues(listBody: string): (string | number)[] {
  const items: (string | number)[] = [];
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers; input pre-capped by IN-list extraction
  const pattern = /'([^']*)'|"([^"]*)"|([+-]?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(listBody)) !== null) {
    if (m[1] !== undefined) items.push(m[1]);
    else if (m[2] !== undefined) items.push(m[2]);
    else if (m[3] !== undefined) items.push(parseFloat(m[3]));
  }
  return items;
}

/** Try to parse an IN-form condition (n.prop IN [...] or labels(n) IN [...]). */
function parseInCondition(condStr: string): WhereCondition | null {
  // labels(alias) IN [...]
  const labelsForm = /^labels\s*\(\s*(\w+)\s*\)\s+IN\s+\[([^\]]*)\]\s*$/i.exec(condStr);
  if (labelsForm) {
    const values = parseInListValues(labelsForm[2]);
    return {
      alias: labelsForm[1],
      property: 'label',
      operator: 'IN',
      value: values,
      conjunction: null,
    };
  }
  // alias.prop IN [...]
  const propForm = /^(\w+)\.(\w+)\s+IN\s+\[([^\]]*)\]\s*$/i.exec(condStr);
  if (propForm) {
    const values = parseInListValues(propForm[3]);
    return {
      alias: propForm[1],
      property: propForm[2],
      operator: 'IN',
      value: values,
      conjunction: null,
    };
  }
  return null;
}

/** Try to parse a scalar comparison condition (=, <>, <, >, CONTAINS, STARTS WITH, ENDS WITH).
 *  Anchored at the start of `condStr` so leading constructs like `NOT ...` or `EXISTS(...)`
 *  fall through and trigger the parser's "unsupported shape" error rather than being silently
 *  dropped (the pre-Wave-68b behavior). */
function parseScalarCondition(condStr: string): WhereCondition | null {
  const propMatch = /^(\w+)\.(\w+)/.exec(condStr.trim());
  if (!propMatch) return null;
  const alias = propMatch[1];
  const property = propMatch[2];
  const afterProp = condStr.trim().slice(propMatch[0].length).trim();
  for (const { pattern, op } of WHERE_OPERATORS) {
    const opMatch = pattern.exec(afterProp);
    if (opMatch) {
      const value = parseValue(afterProp.slice(opMatch[0].length).trim());
      return { alias, property, operator: op, value, conjunction: null };
    }
  }
  return null;
}

/** Parse a single WHERE condition. Recognizes IN-form first, then scalar comparisons. */
export function parseSingleCondition(condStr: string): WhereCondition | null {
  return parseInCondition(condStr) ?? parseScalarCondition(condStr);
}

type WherePart = { condition: string; conjunction: 'AND' | 'OR' | null };

/** Detect a top-level AND/OR boundary at position `i` of `whereStr`. */
function detectConjunctionAt(
  whereStr: string,
  i: number,
): { conj: 'AND' | 'OR'; length: number } | null {
  const rest = whereStr.slice(i);
  const andMatch = /^\s+AND\s+/i.exec(rest);
  if (andMatch) return { conj: 'AND', length: andMatch[0].length };
  const orMatch = /^\s+OR\s+/i.exec(rest);
  if (orMatch) return { conj: 'OR', length: orMatch[0].length };
  return null;
}

/** Update the bracket-nesting depth based on the character. */
function updateDepth(ch: string, depth: number): number {
  if (ch === '[' || ch === '(') return depth + 1;
  if (ch === ']' || ch === ')') return depth - 1;
  return depth;
}

/** Split a WHERE string on AND/OR while respecting bracket nesting (so `IN [a, b]` isn't split on the comma). */
function splitWhereParts(whereStr: string): WherePart[] {
  const parts: WherePart[] = [];
  let current = '';
  let depth = 0;
  let i = 0;
  while (i < whereStr.length) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded loop index over a known string
    const ch = whereStr[i];
    depth = updateDepth(ch, depth);
    const conj = depth === 0 ? detectConjunctionAt(whereStr, i) : null;
    if (conj) {
      if (current.trim()) parts.push({ condition: current.trim(), conjunction: conj.conj });
      current = '';
      i += conj.length;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) parts.push({ condition: current.trim(), conjunction: null });
  return parts;
}

/** Parse WHERE clause into conditions. Throws on shapes the engine does not understand. */
export function parseWhere(whereStr: string): WhereCondition[] {
  const conditions: WhereCondition[] = [];
  for (const part of splitWhereParts(whereStr)) {
    const cond = parseSingleCondition(part.condition);
    if (!cond) {
      throw new Error(
        `Unsupported WHERE condition: "${part.condition}". Supported shapes: ` +
          `<alias>.<prop> {= | <> | < | > | <= | >= | CONTAINS | STARTS WITH | ENDS WITH} <value>; ` +
          `<alias>.<prop> IN [...]; labels(<alias>) IN [...].`,
      );
    }
    // The conjunction stored on a part is "what follows it" (AND/OR connects to the NEXT part).
    // The conjunction stored on a WhereCondition has the same meaning.
    cond.conjunction = part.conjunction;
    conditions.push(cond);
  }
  return conditions;
}

// ─── ORDER BY parsing ─────────────────────────────────────────────────────────

/** Parse ORDER BY clause into a list of sort directives. */
export function parseOrderBy(orderByStr: string): OrderByClause[] {
  const clauses: OrderByClause[] = [];
  for (const part of orderByStr.split(',').map((s) => s.trim())) {
    if (!part) continue;
    const desc = /\bDESC\b/i.test(part);
    const clean = part.replace(/\b(ASC|DESC)\b/gi, '').trim();
    const propMatch = /^(\w+)\.(\w+)$/.exec(clean);
    if (propMatch) {
      clauses.push({
        alias: propMatch[1],
        property: propMatch[2],
        direction: desc ? 'DESC' : 'ASC',
      });
    }
  }
  return clauses;
}
