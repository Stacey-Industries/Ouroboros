/**
 * httpLinkPass.ts — HTTP call-site detection pass.
 *
 * Scans extracted call sites for known HTTP client patterns (fetch, axios,
 * requests, http, httpx, https) and matches them against Route nodes already
 * present in the graph. Creates HTTP_CALLS edges with confidence scores
 * (0.0 -- 1.0) based on method match and caller-name / route-path similarity.
 */

import type { GraphDatabase } from '../graphDatabase'
import type { GraphEdge } from '../graphDatabaseTypes'
import type { IndexedFile } from './passTypes'

// ─── HTTP call-site patterns ─────────────────────────────────────────────────
// Maps a function/method name to the HTTP methods it can represent.
// '*' means any method (the actual method is determined at runtime).

const HTTP_CALL_PATTERNS: Record<string, string[]> = {
  // JavaScript / TypeScript
  fetch: ['GET'],
  axios: ['GET'],
  'axios.get': ['GET'],
  'axios.post': ['POST'],
  'axios.put': ['PUT'],
  'axios.delete': ['DELETE'],
  'axios.patch': ['PATCH'],
  // Node.js http / https
  'http.get': ['GET'],
  'http.request': ['*'],
  'https.get': ['GET'],
  'https.request': ['*'],
  // Python — requests
  'requests.get': ['GET'],
  'requests.post': ['POST'],
  'requests.put': ['PUT'],
  'requests.delete': ['DELETE'],
  'requests.patch': ['PATCH'],
  // Python — httpx
  'httpx.get': ['GET'],
  'httpx.post': ['POST'],
  'httpx.put': ['PUT'],
  'httpx.delete': ['DELETE'],
  'httpx.patch': ['PATCH'],
  // Go
  'http.Get': ['GET'],
  'http.Post': ['POST'],
  'http.NewRequest': ['*'],
}

// ─── Pass implementation ─────────────────────────────────────────────────────

export function httpLinkPass(
  db: GraphDatabase,
  projectName: string,
  indexedFiles: IndexedFile[],
): void {
  // Get all Route nodes — if there are none, nothing to match against.
  const routes = db.getNodesByLabel(projectName, 'Route')
  if (routes.length === 0) return

  const edges: Omit<GraphEdge, 'id'>[] = []

  for (const file of indexedFiles) {
    if (!file.parsed) continue

    const fileQn = `${projectName}.${file.relativePath.replace(/\//g, '.').replace(/\.[^.]+$/, '')}`

    // Pre-filter definitions that can enclose a call (functions and methods).
    const enclosingDefs = file.parsed.definitions.filter(
      (d) => d.kind === 'Function' || d.kind === 'Method',
    )

    for (const call of file.parsed.calls) {
      // Build the fully-qualified call name (receiver.method or just callee).
      const fullCallName = call.receiverName
        ? `${call.receiverName}.${call.calleeName}`
        : call.calleeName

      // Check if this matches a known HTTP client pattern.
      const methods =
        HTTP_CALL_PATTERNS[fullCallName] ?? HTTP_CALL_PATTERNS[call.calleeName]
      if (!methods) continue

      // Find the enclosing function/method for this call site.
      const enclosingDef = enclosingDefs.find(
        (d) => call.startLine >= d.startLine && call.startLine <= d.endLine,
      )
      if (!enclosingDef) continue

      const callerQn = `${fileQn}.${enclosingDef.name}`

      // Match against every Route node.
      for (const route of routes) {
        const routeProps = route.props as Record<string, unknown>
        const routeMethod = routeProps.method as string
        const routePath = routeProps.path as string

        // Method must match (or the pattern is a wildcard '*').
        const methodMatch =
          methods.includes('*') || methods.includes(routeMethod)
        if (!methodMatch) continue

        // ── Confidence scoring ─────────────────────────────────────────
        // Base: 0.3 (method match only).
        // Boosted by +0.2 for each non-parameter route-path segment that
        // appears in the caller function name.
        let confidence = 0.3

        const callerLower = enclosingDef.name.toLowerCase()
        const routePathParts = routePath.split('/').filter(Boolean)
        for (const part of routePathParts) {
          if (part.startsWith(':')) continue // Skip path parameters
          if (callerLower.includes(part.toLowerCase())) {
            confidence += 0.2
          }
        }

        confidence = Math.min(confidence, 1.0)

        // Only create an edge when confidence is meaningful.
        if (confidence >= 0.3) {
          edges.push({
            project: projectName,
            source_id: callerQn,
            target_id: route.id,
            type: 'HTTP_CALLS',
            props: {
              confidence,
              url_path: routePath,
              http_method: routeMethod,
            },
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
