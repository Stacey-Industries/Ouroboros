import path from 'path'

import { spawnClaude } from '../claudeMdGeneratorSupport'
import log from '../logger'
import { extractSymbols } from '../symbolExtractor/symbolExtractor'
import type { ExtractedSymbol } from '../symbolExtractor/symbolExtractorTypes'
import type { ModuleAISummary, ModuleStructuralSummary } from './contextLayerTypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummarizationContext {
  module: ModuleStructuralSummary
  sourceSnippets: Array<{ relativePath: string; content: string }>
  dependencyContext: string[]
  projectContext: { languages: string[]; frameworks: string[] }
}

export interface SummarizationResult {
  success: boolean
  summary?: ModuleAISummary
  error?: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  extractedSymbols?: ExtractedSymbol[]  // populated on both success and failure (when extraction runs)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a code documentation assistant. Given a module's structure and source code snippets, produce a JSON object with three fields:

1. "description": A 1-2 sentence summary of what this module does and why it exists. Be specific — mention the technology, the user-facing behavior, or the system role. Do NOT use vague phrases like "handles various functionality".

2. "keyResponsibilities": An array of 3-5 short strings, each describing one concrete thing this module is responsible for. Each should be actionable and specific enough that someone could search the code for it.

3. "gotchas": An array of 0-3 strings noting constraints, edge cases, or non-obvious behaviors. Only include genuine gotchas — if there are none, return an empty array. Do NOT invent problems.

Return ONLY the JSON object, no markdown fences, no explanation.`

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

/**
 * Extract exported symbols from the already-read source snippets.
 * Skips .d.ts files and test files (those are not useful for module description).
 * Deduplicates by name+kind.
 */
function extractModuleSymbols(
  sourceSnippets: Array<{ relativePath: string; content: string }>
): ExtractedSymbol[] {
  const allSymbols: ExtractedSymbol[] = []
  for (const snippet of sourceSnippets) {
    if (snippet.relativePath.endsWith('.d.ts')) continue
    if (/\.(test|spec)\.[^.]+$/.test(snippet.relativePath)) continue
    const symbols = extractSymbols(snippet.relativePath, snippet.content)
    allSymbols.push(...symbols)
  }

  // Deduplicate by name+kind
  const seen = new Set<string>()
  return allSymbols.filter(s => {
    const key = `${s.name}:${s.kind}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Approximate token count using the ~4 chars per token heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Check if a module meets the minimum threshold for summarization. */
export function shouldSummarize(structural: ModuleStructuralSummary): boolean {
  return structural.fileCount >= 3 || structural.totalLines >= 50
}

// ---------------------------------------------------------------------------
// selectSourceSnippets helpers
// ---------------------------------------------------------------------------

type SnippetFile = { relativePath: string; size: number; language: string; imports: string[] }
type SnippetResult = { relativePath: string; absolutePath: string }

function makeAdder(
  workspaceRoot: string,
  seen: Set<string>,
  selected: SnippetResult[],
  maxSnippets: number,
) {
  return (rel: string) => {
    if (seen.has(rel) || selected.length >= maxSnippets) return
    seen.add(rel)
    selected.push({ relativePath: rel, absolutePath: path.join(workspaceRoot, rel) })
  }
}

function addEntryPoints(
  files: SnippetFile[],
  moduleBasename: string,
  add: (rel: string) => void,
): void {
  const entryPointPatterns = ['index.ts', 'index.tsx', 'index.js', 'index.jsx']
  for (const file of files) {
    const basename = path.basename(file.relativePath).toLowerCase()
    if (entryPointPatterns.includes(basename)) {
      add(file.relativePath)
    } else if (basename === `${moduleBasename}.ts` || basename === `${moduleBasename}.tsx`) {
      add(file.relativePath)
    }
  }
}

function addBySize(files: SnippetFile[], add: (rel: string) => void, maxSnippets: number, selected: SnippetResult[]): void {
  const bySize = [...files].sort((a, b) => b.size - a.size)
  for (const file of bySize) {
    if (selected.length >= maxSnippets) break
    add(file.relativePath)
  }
}

function addTypeDefinitions(files: SnippetFile[], add: (rel: string) => void, maxSnippets: number, selected: SnippetResult[]): void {
  for (const file of files) {
    if (selected.length >= maxSnippets) break
    const basename = path.basename(file.relativePath)
    if (
      basename.endsWith('.d.ts') ||
      basename.endsWith('types.ts') ||
      basename.endsWith('Types.ts')
    ) {
      add(file.relativePath)
    }
  }
}

/**
 * Select the most informative source files from a module for the API call.
 * Priority: entry points > largest files > type definitions.
 */
export function selectSourceSnippets(options: {
  files: SnippetFile[]
  workspaceRoot: string
  moduleRootPath: string
  maxSnippets?: number
  maxCharsPerSnippet?: number
}): SnippetResult[] {
  const { files, workspaceRoot, moduleRootPath, maxSnippets = 5 } = options
  if (files.length === 0) return []

  const selected: SnippetResult[] = []
  const seen = new Set<string>()
  const add = makeAdder(workspaceRoot, seen, selected, maxSnippets)

  addEntryPoints(files, path.basename(moduleRootPath).toLowerCase(), add)
  addBySize(files, add, maxSnippets, selected)
  addTypeDefinitions(files, add, maxSnippets, selected)

  return selected.slice(0, maxSnippets)
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function appendSymbolsSection(lines: string[], extractedSymbols: ExtractedSymbol[]): void {
  const sorted = [...extractedSymbols].sort((a, b) => {
    if (a.kind === 'unknown' && b.kind !== 'unknown') return 1
    if (a.kind !== 'unknown' && b.kind === 'unknown') return -1
    return a.name.localeCompare(b.name)
  })
  const top = sorted.slice(0, 30)
  lines.push('')
  lines.push(`## Exported Symbols (${extractedSymbols.length})`)
  for (const s of top) {
    lines.push(s.signature ? `- ${s.kind} ${s.name}${s.signature}` : `- ${s.kind} ${s.name}`)
  }
}

function buildUserMessage(context: SummarizationContext, extractedSymbols?: ExtractedSymbol[]): string {
  const { module: mod, sourceSnippets, dependencyContext, projectContext } = context
  const exportsLine = mod.exports.length > 0
    ? mod.exports.slice(0, 10).join(', ')
    : 'no public exports'

  const lines: string[] = [
    `Module: ${mod.module.label} (${mod.module.rootPath})`,
    `Pattern: ${mod.module.pattern}`,
    `Files: ${mod.fileCount}, Lines: ~${mod.totalLines}`,
    `Languages: ${mod.languages.join(', ')}`,
    `Exports: ${exportsLine}`,
    `Dependencies: ${dependencyContext.join(', ')}`,
    `Project: ${projectContext.languages.join(', ')} / ${projectContext.frameworks.join(', ')}`,
  ]

  if (extractedSymbols && extractedSymbols.length > 0) {
    appendSymbolsSection(lines, extractedSymbols)
  }

  if (sourceSnippets.length > 0) {
    lines.push('')
    lines.push('--- Source Code ---')
    for (const snippet of sourceSnippets) {
      lines.push(`### ${snippet.relativePath}`)
      lines.push(snippet.content)
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RawSummaryResponse {
  description: string
  keyResponsibilities: string[]
  gotchas: string[]
}

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim()
  // Strip ```json ... ``` or ``` ... ``` (no multiline flag — match entire string)
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }
  return cleaned
}

function extractParsedJson(cleaned: string): unknown {
  try {
    return JSON.parse(cleaned)
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]) } catch { /* fall through */ }
    }
    return null
  }
}

function truncateStrings(arr: unknown[], max: number, maxLen: number): string[] {
  return (arr as unknown[])
    .filter((item): item is string => typeof item === 'string')
    .slice(0, max)
    .map((s) => s.length > maxLen ? s.slice(0, maxLen) : s)
}

function extractDescription(obj: Record<string, unknown>): string | null {
  if (typeof obj.description !== 'string' || obj.description.length === 0) return null
  return obj.description.length > 500 ? obj.description.slice(0, 500) : obj.description
}

function extractResponsibilities(obj: Record<string, unknown>): string[] | null {
  if (!Array.isArray(obj.keyResponsibilities)) return null
  const items = truncateStrings(obj.keyResponsibilities, 5, 200)
  return items.length === 0 ? null : items
}

function parseAndValidateResponse(text: string): RawSummaryResponse | null {
  if (!text || text.trim().length === 0) return null

  const parsed = extractParsedJson(stripMarkdownFences(text))
  if (!parsed || typeof parsed !== 'object') return null

  const obj = parsed as Record<string, unknown>
  const description = extractDescription(obj)
  if (!description) return null

  const responsibilities = extractResponsibilities(obj)
  if (!responsibilities) return null

  const gotchas = truncateStrings(Array.isArray(obj.gotchas) ? obj.gotchas : [], 3, 200)

  return { description, keyResponsibilities: responsibilities, gotchas }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyByStatusCode(status: number | undefined): string | null {
  if (status === 401 || status === 403) return 'no_auth'
  if (status === 429) return 'rate_limited'
  return null
}

function isNetworkError(msg: string): boolean {
  return msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')
}

function isAuthError(msg: string): boolean {
  return msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('authentication')
}

function classifyByMessage(message: string): string {
  if (isNetworkError(message)) return 'network_error'
  if (isAuthError(message)) return 'no_auth'
  if (message.includes('429') || message.includes('rate')) return 'rate_limited'
  return message || 'unknown_error'
}

function classifyError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)

  const byStatus = classifyByStatusCode((error as { status?: number }).status)
  if (byStatus) return byStatus

  return classifyByMessage((error as { message?: string }).message ?? '')
}

// ---------------------------------------------------------------------------
// Main summarization function
// ---------------------------------------------------------------------------

async function callCli(
  userMessage: string,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const prompt = `${SYSTEM_PROMPT}\n\n---\n\n${userMessage}`
  const text = await spawnClaude(prompt, 'haiku')
  // CLI text mode doesn't report token usage — estimate from char counts
  const inputTokens = estimateTokens(prompt)
  const outputTokens = estimateTokens(text)
  return { text, inputTokens, outputTokens }
}

interface CliCallResult { inputTokens: number; outputTokens: number; startTime: number }

function buildSuccessResult(
  parsed: RawSummaryResponse,
  context: SummarizationContext,
  cli: CliCallResult,
  extractedSymbols: ExtractedSymbol[],
): SummarizationResult {
  const { inputTokens, outputTokens, startTime } = cli
  const summaryText = JSON.stringify(parsed)
  const summary: ModuleAISummary = {
    description: parsed.description,
    keyResponsibilities: parsed.keyResponsibilities,
    gotchas: parsed.gotchas,
    generatedAt: Date.now(),
    generatedFrom: context.module.contentHash,
    tokenCount: estimateTokens(summaryText),
  }
  log.info(`[context-layer] Summarized module "${context.module.module.label}" (~${inputTokens} in, ~${outputTokens} out)`)
  return { success: true, summary, inputTokens, outputTokens, durationMs: Date.now() - startTime, extractedSymbols }
}

export async function summarizeModule(context: SummarizationContext): Promise<SummarizationResult> {
  const startTime = Date.now()

  const extractedSymbols = extractModuleSymbols(context.sourceSnippets)
  const userMessage = buildUserMessage(context, extractedSymbols)
  let lastError: string | undefined

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, inputTokens, outputTokens } = await callCli(userMessage)
      const parsed = parseAndValidateResponse(text)

      if (parsed) {
        return buildSuccessResult(parsed, context, { inputTokens, outputTokens, startTime }, extractedSymbols)
      }

      lastError = 'invalid_response'
      if (attempt === 0) {
        log.info(`[context-layer] Parse failed for module "${context.module.module.label}", retrying... Raw response (first 300 chars): ${text.slice(0, 300)}`)
      }
    } catch (error) {
      const classified = classifyError(error)

      if (classified === 'no_auth' || classified === 'rate_limited' || classified === 'network_error') {
        log.info(`[context-layer] CLI error for module "${context.module.module.label}": ${classified}`)
        return { success: false, error: classified, durationMs: Date.now() - startTime, extractedSymbols }
      }

      lastError = classified
      if (attempt === 0) {
        log.info(`[context-layer] Error for module "${context.module.module.label}": ${classified}, retrying...`)
      }
    }
  }

  log.info(`[context-layer] Failed to summarize module "${context.module.module.label}" after 2 attempts`)
  return {
    success: false,
    error: lastError === 'invalid_response' ? 'parse_failure' : lastError,
    durationMs: Date.now() - startTime,
    extractedSymbols,
  }
}
