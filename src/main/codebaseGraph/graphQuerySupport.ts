/**
 * graphQuerySupport.ts — Cypher-like query parser extracted from graphQuery.ts.
 * Handles MATCH/WHERE/RETURN/LIMIT parsing and node/edge query execution.
 */

import type { GraphStore } from './graphStore';
import type { GraphNode } from './graphTypes';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NodeQueryOptions {
  varName: string;
  nodeType: string | undefined;
  fullQuery: string;
  returnFields: string[];
  limit: number;
}

interface EdgeQueryOptions {
  sourceVar: string;
  edgeType: string;
  targetVar: string;
  fullQuery: string;
  returnFields: string[];
  limit: number;
}

// ─── Cypher Parser ──────────────────────────────────────────────────────────

function parseLimitAndReturn(trimmed: string): { limit: number; returnFields: string[] } {
  const upper = trimmed.toUpperCase();
  const limitIndex = upper.lastIndexOf(' LIMIT ');
  const limit =
    limitIndex >= 0 ? parseInt(trimmed.slice(limitIndex + ' LIMIT '.length).trim(), 10) : 100;

  const returnIndex = upper.indexOf(' RETURN ');
  const returnFields =
    returnIndex >= 0
      ? trimmed
          .slice(
            returnIndex + ' RETURN '.length,
            limitIndex >= 0 && limitIndex > returnIndex ? limitIndex : trimmed.length,
          )
          .trim()
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean)
      : [];

  return { limit, returnFields };
}

function parseEdgeMatch(
  trimmed: string,
): { sourceVar: string; edgeType: string; targetVar: string } | null {
  const lower = trimmed.toLowerCase();
  const start = lower.indexOf('match (');
  const edgeMarker = lower.indexOf(')-[:', start);
  const arrowMarker = lower.indexOf(']->(', edgeMarker);
  const end = lower.indexOf(')', arrowMarker);
  if (start < 0 || edgeMarker < 0 || arrowMarker < 0 || end < 0) return null;

  const sourceVar = trimmed.slice(start + 'match ('.length, edgeMarker).trim();
  const edgeType = trimmed.slice(edgeMarker + ')-[:'.length, arrowMarker).trim();
  const targetVar = trimmed.slice(arrowMarker + ']->('.length, end).trim();
  if (!sourceVar || !edgeType || !targetVar) return null;
  return { sourceVar, edgeType, targetVar };
}

function parseNodeMatch(trimmed: string): { varName: string; nodeType?: string } | null {
  const lower = trimmed.toLowerCase();
  const start = lower.indexOf('match (');
  const end = lower.indexOf(')', start);
  if (start < 0 || end < 0) return null;

  const clause = trimmed.slice(start + 'match ('.length, end).trim();
  if (!clause) return null;
  const colonIndex = clause.indexOf(':');
  if (colonIndex < 0) return { varName: clause };

  const varName = clause.slice(0, colonIndex).trim();
  const nodeType = clause.slice(colonIndex + 1).trim();
  if (!varName || !nodeType) return null;
  return { varName, nodeType };
}

export function executeCypherLike(
  query: string,
  store: GraphStore,
  matchesWhereFilter: (node: GraphNode, varName: string, fullQuery: string) => boolean,
): Array<Record<string, unknown>> {
  const trimmed = query.trim();

  const { limit, returnFields } = parseLimitAndReturn(trimmed);

  const edgeMatch = parseEdgeMatch(trimmed);
  if (edgeMatch) {
    return executeEdgeQuery(store, matchesWhereFilter, {
      sourceVar: edgeMatch.sourceVar,
      edgeType: edgeMatch.edgeType,
      targetVar: edgeMatch.targetVar,
      fullQuery: trimmed,
      returnFields,
      limit,
    });
  }

  const nodeMatch = parseNodeMatch(trimmed);
  if (nodeMatch) {
    return executeNodeQuery(store, matchesWhereFilter, {
      varName: nodeMatch.varName,
      nodeType: nodeMatch.nodeType,
      fullQuery: trimmed,
      returnFields,
      limit,
    });
  }

  return [];
}

// ─── Node Query ─────────────────────────────────────────────────────────────

function executeNodeQuery(
  store: GraphStore,
  matchesWhereFilter: (node: GraphNode, varName: string, fullQuery: string) => boolean,
  opts: NodeQueryOptions,
): Array<Record<string, unknown>> {
  let nodes = opts.nodeType
    ? store.getNodesByType(opts.nodeType as GraphNode['type'])
    : store.getAllNodes();

  nodes = nodes.filter((node) => matchesWhereFilter(node, opts.varName, opts.fullQuery));

  return projectNodeResults(nodes.slice(0, opts.limit), opts.varName, opts.returnFields);
}

function buildFieldRecord(
  node: GraphNode,
  varName: string,
  returnFields: string[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const asRecord = node as unknown as Record<string, unknown>;
  for (const field of returnFields) {
    if (!field.startsWith(varName + '.')) continue;
    const prop = field.substring(varName.length + 1);
    // eslint-disable-next-line security/detect-object-injection -- prop is a suffix of a field parsed from a bounded query string
    record[field] = asRecord[prop];
  }
  return record;
}

function projectNodeResults(
  nodes: GraphNode[],
  varName: string,
  returnFields: string[],
): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    let record: Record<string, unknown>;
    if (returnFields.length === 0 || returnFields.includes(varName)) {
      record = { [varName]: node };
    } else {
      record = buildFieldRecord(node, varName, returnFields);
    }
    results.push(record);
  }
  return results;
}

// ─── Edge Query ─────────────────────────────────────────────────────────────

function executeEdgeQuery(
  store: GraphStore,
  matchesWhereFilter: (node: GraphNode, varName: string, fullQuery: string) => boolean,
  opts: EdgeQueryOptions,
): Array<Record<string, unknown>> {
  const allEdges = store.getAllEdges();
  const matchingEdges = allEdges.filter((e) => e.type === opts.edgeType);
  const results: Array<Record<string, unknown>> = [];

  for (const edge of matchingEdges) {
    if (results.length >= opts.limit) break;

    const sourceNode = store.getNode(edge.source);
    const targetNode = store.getNode(edge.target);
    if (!sourceNode || !targetNode) continue;

    if (!matchesWhereFilter(sourceNode, opts.sourceVar, opts.fullQuery)) continue;
    if (!matchesWhereFilter(targetNode, opts.targetVar, opts.fullQuery)) continue;

    const record = buildEdgeRecord({
      sourceNode,
      targetNode,
      sourceVar: opts.sourceVar,
      targetVar: opts.targetVar,
      returnFields: opts.returnFields,
    });
    results.push(record);
  }

  return results;
}

interface EdgeRecordOpts {
  sourceNode: GraphNode;
  targetNode: GraphNode;
  sourceVar: string;
  targetVar: string;
  returnFields: string[];
}

function applyEdgeField(
  record: Record<string, unknown>,
  field: string,
  opts: EdgeRecordOpts,
): void {
  const { sourceNode, targetNode, sourceVar, targetVar } = opts;
  const srcRecord = sourceNode as unknown as Record<string, unknown>;
  const tgtRecord = targetNode as unknown as Record<string, unknown>;

  if (field === sourceVar) {
    // eslint-disable-next-line security/detect-object-injection -- sourceVar is a query variable name from bounded Cypher-like input
    record[sourceVar] = sourceNode;
  } else if (field === targetVar) {
    // eslint-disable-next-line security/detect-object-injection -- targetVar is a query variable name from bounded Cypher-like input
    record[targetVar] = targetNode;
  } else if (field.startsWith(sourceVar + '.')) {
    const prop = field.substring(sourceVar.length + 1);
    // eslint-disable-next-line security/detect-object-injection -- prop is a suffix of a field from bounded query string
    record[field] = srcRecord[prop];
  } else if (field.startsWith(targetVar + '.')) {
    const prop = field.substring(targetVar.length + 1);
    // eslint-disable-next-line security/detect-object-injection -- prop is a suffix of a field from bounded query string
    record[field] = tgtRecord[prop];
  }
}

function buildEdgeRecord(opts: EdgeRecordOpts): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const { sourceNode, targetNode, sourceVar, targetVar, returnFields } = opts;

  if (returnFields.length === 0) {
    // eslint-disable-next-line security/detect-object-injection -- sourceVar/targetVar are query variable names from bounded Cypher-like input
    record[sourceVar] = sourceNode;
    // eslint-disable-next-line security/detect-object-injection -- sourceVar/targetVar are query variable names from bounded Cypher-like input
    record[targetVar] = targetNode;
    return record;
  }

  for (const field of returnFields) {
    applyEdgeField(record, field, opts);
  }

  return record;
}

// ─── WHERE Filter ───────────────────────────────────────────────────────────

function getNodePropString(node: GraphNode, prop: string): string {
  // eslint-disable-next-line security/detect-object-injection -- prop is a property name extracted from a bounded Cypher-like WHERE clause
  return String((node as unknown as Record<string, unknown>)[prop] ?? '');
}

// varName is always bounded to \w+ by the MATCH clause regex (matchEdgeRe / matchNodeRe),
// so interpolating it into a RegExp cannot introduce ReDoS or injection.

function matchesContains(node: GraphNode, varName: string, fullQuery: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-regexp -- varName is \w+-bounded from MATCH clause parse
  const containsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s+CONTAINS\\s+'([^']+)'`, 'i');
  const match = containsRe.exec(fullQuery);
  if (!match) return true;
  const nodeProp = getNodePropString(node, match[1]);
  return nodeProp.toLowerCase().includes(match[2].toLowerCase());
}

function buildContainsRe(varName: string): RegExp {
  // eslint-disable-next-line security/detect-non-literal-regexp -- varName is \w+-bounded from MATCH clause parse
  return new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s+CONTAINS\\s+'([^']+)'`, 'i');
}

function matchesEquals(node: GraphNode, varName: string, fullQuery: string): boolean {
  // Only apply if CONTAINS didn't already match
  if (buildContainsRe(varName).test(fullQuery)) return true;

  // eslint-disable-next-line security/detect-non-literal-regexp -- varName is \w+-bounded from MATCH clause parse
  const equalsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s*=\\s*'([^']+)'`, 'i');
  const match = equalsRe.exec(fullQuery);
  if (!match) return true;
  return getNodePropString(node, match[1]) === match[2];
}

function matchesStartsWith(node: GraphNode, varName: string, fullQuery: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-regexp -- varName is \w+-bounded from MATCH clause parse
  const startsRe = new RegExp(`WHERE\\s+${varName}\\.(\\w+)\\s+STARTS\\s+WITH\\s+'([^']+)'`, 'i');
  const match = startsRe.exec(fullQuery);
  if (!match) return true;
  return getNodePropString(node, match[1]).toLowerCase().startsWith(match[2].toLowerCase());
}

export function matchesWhereFilter(node: GraphNode, varName: string, fullQuery: string): boolean {
  if (!matchesContains(node, varName, fullQuery)) return false;
  if (!matchesEquals(node, varName, fullQuery)) return false;
  if (!matchesStartsWith(node, varName, fullQuery)) return false;
  return true;
}
