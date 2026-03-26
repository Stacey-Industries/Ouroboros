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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isEntryPoint(props: Record<string, unknown>, filePath: string | null): boolean {
  const decorators = (props.decorators as string[] | undefined) ?? []
  if (decorators.some((d) => ENTRY_DECORATORS.has(d))) return true
  if (filePath && /\/index\.[^.]+$/.test(filePath) && props.is_exported) return true
  return false
}

// ─── Pass implementation ─────────────────────────────────────────────────────

export function enrichmentPass(
  db: GraphDatabase,
  projectName: string,
  // _files (IndexedFile[]) reserved for future enrichment heuristics
): void {
  // IMPLEMENTS edges are a placeholder — tree-sitter extraction would need to
  // expose implements/extends info from class_heritage nodes first.

  const allFunctions = db.getNodesByLabel(projectName, 'Function')

  for (const fn of allFunctions) {
    const props = fn.props as Record<string, unknown>
    if (props.is_entry_point === true) continue
    if (isEntryPoint(props, fn.file_path)) {
      db.updateNodeProps(fn.id, { ...props, is_entry_point: true })
    }
  }
}
