/**
 * testDetectPass.ts — Test file detection pass.
 *
 * Identifies test files by common naming conventions (*.test.*, *.spec.*,
 * *_test.*, *_spec.*) and creates TESTS edges between test functions and
 * the production functions they exercise. Uses two complementary heuristics:
 *
 *   1. Name-based: test function name contains the subject function name.
 *   2. Import-based: the test file imports specific functions from the
 *      subject module.
 */

import type { GraphDatabase } from '../graphDatabase'
import type { GraphEdge } from '../graphDatabaseTypes'
import type { IndexedFile } from './passTypes'

// ─── Test file detection pattern ─────────────────────────────────────────────

const TEST_FILE_PATTERN = /\.(test|spec|_test|_spec)\.[^.]+$/

// ─── Pass implementation ─────────────────────────────────────────────────────

export function testDetectPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  const edges: Omit<GraphEdge, 'id'>[] = []

  // Build a lookup from short function name to all qualified names.
  // Skip functions that live inside test files themselves.
  const functionsByName = new Map<string, string[]>()
  const allFunctions = db
    .getNodesByLabel(projectName, 'Function')
    .concat(db.getNodesByLabel(projectName, 'Method'))

  for (const fn of allFunctions) {
    if (fn.file_path && TEST_FILE_PATTERN.test(fn.file_path)) continue

    const names = functionsByName.get(fn.name) ?? []
    names.push(fn.id)
    functionsByName.set(fn.name, names)
  }

  for (const file of indexedFiles) {
    if (!file.parsed) continue
    if (!TEST_FILE_PATTERN.test(file.relativePath)) continue

    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    // Derive the subject file path from the test file path.
    // e.g. config.test.ts -> config.ts, utils_spec.py -> utils.py
    const subjectPath = file.relativePath
      .replace(/\.(test|spec)\.([^.]+)$/, '.$2')
      .replace(/(_test|_spec)\.([^.]+)$/, '.$2')

    const subjectQn = `${projectName}.${subjectPath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    // Functions from the derived subject file.
    const subjectFunctions = allFunctions.filter((f) =>
      f.id.startsWith(subjectQn + '.'),
    )

    for (const def of file.parsed.definitions) {
      if (def.kind !== 'Function') continue

      const testFnQn = `${fileQn}.${def.name}`
      const testNameLower = def.name.toLowerCase()

      // ── Heuristic 1: name containment ──────────────────────────────
      // e.g. "testParseConfig" contains "parseConfig"
      for (const subjectFn of subjectFunctions) {
        const fnNameLower = subjectFn.name.toLowerCase()
        if (testNameLower.includes(fnNameLower)) {
          edges.push({
            project: projectName,
            source_id: testFnQn,
            target_id: subjectFn.id,
            type: 'TESTS',
            props: {},
          })
        }
      }

      // ── Heuristic 2: import-based ──────────────────────────────────
      // If the test file imports specific names from the subject module,
      // link the test function to those imported symbols.
      for (const imp of file.parsed.imports) {
        // Check if the import source matches the subject path
        // (strip extension for comparison).
        const subjectPathNoExt = subjectPath.replace(/\.[^.]+$/, '')
        if (!imp.source.includes(subjectPathNoExt)) continue

        for (const spec of imp.specifiers) {
          const candidates = functionsByName.get(
            spec.originalName ?? spec.name,
          )
          if (!candidates) continue

          // Prefer the candidate from the subject file.
          const target =
            candidates.find((c) => c.startsWith(subjectQn)) ?? candidates[0]
          edges.push({
            project: projectName,
            source_id: testFnQn,
            target_id: target,
            type: 'TESTS',
            props: {},
          })
        }
      }
    }
  }

  // ── Deduplicate by source|target pair ────────────────────────────────────
  const seen = new Set<string>()
  const unique = edges.filter((e) => {
    const key = `${e.source_id}|${e.target_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (unique.length > 0) {
    db.insertEdges(unique)
  }
}
