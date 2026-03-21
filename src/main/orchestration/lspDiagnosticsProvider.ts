/**
 * lspDiagnosticsProvider.ts -- Main-thread diagnostics provider for repoIndexer.
 *
 * This module reads LSP server state to build diagnostics summaries.
 * It imports from lspState (which uses BrowserWindow from Electron),
 * so it MUST NOT be imported in worker threads.
 *
 * Pass `buildLspDiagnosticsSummary` as the `diagnosticsProvider` option
 * to `buildRepoIndexSnapshot` from main-thread callers.
 */

import { uriToFilePath } from '../lspHelpers'
import { servers } from '../lspState'
import type {
  DiagnosticMessage,
  DiagnosticsFileSummary,
  DiagnosticsSummary,
} from './types'

const MAX_MESSAGES_PER_FILE = 10
const MAX_MESSAGES_TOTAL = 50
const SEVERITY_PRIORITY: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
}

function normalizePathForCompare(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const normalizedFile = normalizePathForCompare(filePath)
  const normalizedRoot = normalizePathForCompare(rootPath)
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}/`)
}

/** Collect per-file diagnostic counts and messages from running LSP servers. */
function collectDiagnostics(
  rootPath: string,
): { byFile: Map<string, DiagnosticsFileSummary>; messagesByFile: Map<string, DiagnosticMessage[]> } {
  const byFile = new Map<string, DiagnosticsFileSummary>()
  const messagesByFile = new Map<string, DiagnosticMessage[]>()

  for (const server of servers.values()) {
    if (normalizePathForCompare(server.root) !== normalizePathForCompare(rootPath) || server.status !== 'running') {
      continue
    }
    for (const [uri, diagnostics] of server.diagnosticsCache.entries()) {
      const filePath = uriToFilePath(uri)
      if (!isPathInsideRoot(filePath, rootPath)) continue
      const existing = byFile.get(filePath) ?? { filePath, errors: 0, warnings: 0, infos: 0, hints: 0 }
      const messages = messagesByFile.get(filePath) ?? []
      for (const d of diagnostics) {
        if (d.severity === 'error') existing.errors += 1
        else if (d.severity === 'warning') existing.warnings += 1
        else if (d.severity === 'hint') existing.hints += 1
        else existing.infos += 1
        messages.push({
          severity: d.severity,
          line: d.range.startLine + 1,
          character: d.range.startChar,
          message: d.message,
        })
      }
      byFile.set(filePath, existing)
      messagesByFile.set(filePath, messages)
    }
  }

  return { byFile, messagesByFile }
}

/** Sort and cap messages per file at MAX_MESSAGES_PER_FILE. */
function capMessagesPerFile(
  byFile: Map<string, DiagnosticsFileSummary>,
  messagesByFile: Map<string, DiagnosticMessage[]>,
): void {
  for (const [filePath, messages] of messagesByFile) {
    messages.sort(
      (l, r) => (SEVERITY_PRIORITY[l.severity] ?? 3) - (SEVERITY_PRIORITY[r.severity] ?? 3) || l.line - r.line,
    )
    const summary = byFile.get(filePath)
    if (summary) summary.messages = messages.slice(0, MAX_MESSAGES_PER_FILE)
  }
}

/** Enforce global message cap across all files, prioritizing error-heavy files. */
function capMessagesGlobal(files: DiagnosticsFileSummary[]): void {
  let total = 0
  const sorted = [...files].sort(
    (l, r) => r.errors - l.errors || r.warnings - l.warnings || l.filePath.localeCompare(r.filePath),
  )
  for (const file of sorted) {
    if (!file.messages?.length) continue
    if (total >= MAX_MESSAGES_TOTAL) { file.messages = []; continue }
    const remaining = MAX_MESSAGES_TOTAL - total
    if (file.messages.length > remaining) file.messages = file.messages.slice(0, remaining)
    total += file.messages.length
  }
}

/**
 * Build a diagnostics summary from live LSP server state.
 * Only usable on the main thread (imports electron via lspState).
 */
export function buildLspDiagnosticsSummary(rootPath: string, generatedAt: number): DiagnosticsSummary {
  const { byFile, messagesByFile } = collectDiagnostics(rootPath)
  capMessagesPerFile(byFile, messagesByFile)
  const files = Array.from(byFile.values()).sort((l, r) => l.filePath.localeCompare(r.filePath))
  capMessagesGlobal(files)

  return {
    files,
    totalErrors: files.reduce((t, f) => t + f.errors, 0),
    totalWarnings: files.reduce((t, f) => t + f.warnings, 0),
    totalInfos: files.reduce((t, f) => t + f.infos, 0),
    totalHints: files.reduce((t, f) => t + f.hints, 0),
    generatedAt,
  }
}
