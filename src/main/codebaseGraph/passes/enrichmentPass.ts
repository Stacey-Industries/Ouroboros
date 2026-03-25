/**
 * enrichmentPass.ts — Entry point refinement and enrichment pass.
 *
 * Marks additional entry points that the core pipeline may have missed.
 * Entry point heuristics:
 *
 *   - Decorator patterns: Controller, Injectable, Component, etc.
 *   - Index file default exports (barrel re-exports).
 *   - Framework-specific entry points (main, cli, command, route handlers).
 *
 * Also creates IMPLEMENTS edges between classes and interfaces when the
 * tree-sitter parser provides that information (placeholder for now —
 * the extraction would need to be enhanced in treeSitterParser first).
 */

import type { GraphDatabase } from '../graphDatabase'
import type { GraphEdge } from '../graphDatabaseTypes'
import type { IndexedFile } from './passTypes'

// ─── Decorator names that mark entry points ──────────────────────────────────

const ENTRY_DECORATORS = new Set([
  // NestJS
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Controller',
  'Injectable',
  'Module',
  // Angular
  'Component',
  'Directive',
  'Pipe',
  // Express-style
  'app.get',
  'app.post',
  // Flask / Django
  'route',
  'before_request',
  'after_request',
  'api_view',
  // CLI frameworks
  'main',
  'cli',
  'command',
])

// ─── Pass implementation ─────────────────────────────────────────────────────

export function enrichmentPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  const edges: Omit<GraphEdge, 'id'>[] = []

  // ── IMPLEMENTS edges (placeholder) ─────────────────────────────────────
  // For TypeScript `class Foo implements IBar`, the tree-sitter extraction
  // would need to expose implements/extends info. Currently the parser does
  // not extract this, so we build the interface lookup but skip edge creation.

  const interfacesByName = new Map<string, string>()
  const allInterfaces = db.getNodesByLabel(projectName, 'Interface')
  for (const iface of allInterfaces) {
    interfacesByName.set(iface.name, iface.id)
  }

  for (const file of indexedFiles) {
    if (!file.parsed) continue

    for (const def of file.parsed.definitions) {
      if (def.kind !== 'Class') continue
      // TODO: Enhance TreeSitterParser to extract implements/extends from
      // class_heritage nodes. Once available, create IMPLEMENTS edges here.
    }
  }

  // ── Entry point refinement ─────────────────────────────────────────────

  const allFunctions = db.getNodesByLabel(projectName, 'Function')

  for (const fn of allFunctions) {
    const props = fn.props as Record<string, unknown>

    // Already marked — nothing to do.
    if (props.is_entry_point === true) continue

    let shouldMark = false

    // Check decorator-based entry points.
    const decorators = (props.decorators as string[] | undefined) ?? []
    if (decorators.some((d) => ENTRY_DECORATORS.has(d))) {
      shouldMark = true
    }

    // Check if exported from an index/barrel file.
    if (!shouldMark && fn.file_path) {
      if (/\/index\.[^.]+$/.test(fn.file_path) && props.is_exported) {
        shouldMark = true
      }
    }

    if (shouldMark) {
      db.updateNodeProps(fn.id, { ...props, is_entry_point: true })
    }
  }

  if (edges.length > 0) {
    db.insertEdges(edges)
  }
}
