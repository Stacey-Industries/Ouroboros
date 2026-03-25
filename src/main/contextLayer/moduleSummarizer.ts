import path from 'path'
import type { ModuleAISummary, ModuleStructuralSummary } from './contextLayerTypes'
import { spawnClaude } from '../claudeMdGeneratorSupport'
import { extractSymbols } from '../symbolExtractor/symbolExtractor'
import type { ExtractedSymbol } from '../symbolExtractor/symbolExtractorTypes'

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

/**
 * Select the most informative source files from a module for the API call.
 * Priority: entry points > largest files > type definitions.
 */
export function selectSourceSnippets(options: {
  files: Array<{ relativePath: string; size: number; language: string; imports: string[] }>
  workspaceRoot: string
  moduleRootPath: string
  maxSnippets?: number
  maxCharsPerSnippet?: number
}): Array<{ relativePath: string; absolutePath: string }> {
  const { files, workspaceRoot, moduleRootPath, maxSnippets = 5 } = options
  if (files.length === 0) return []

  const selected: Array<{ relativePath: string; absolutePath: string }> = []
  const seen = new Set<string>()

  const add = (rel: string) => {
    if (seen.has(rel)) return
    seen.add(rel)
    selected.push({
      relativePath: rel,
      absolutePath: path.join(workspaceRoot, rel),
    })
  }

  // 1. Entry points first: index.ts, index.tsx, or file matching module root basename
  const moduleBasename = path.basename(moduleRootPath).toLowerCase()
  const entryPointPatterns = ['index.ts', 'index.tsx', 'index.js', 'index.jsx']
  for (const file of files) {
    const basename = path.basename(file.relativePath).toLowerCase()
    if (entryPointPatterns.includes(basename)) {
      add(file.relativePath)
    } else if (basename === `${moduleBasename}.ts` || basename === `${moduleBasename}.tsx`) {
      add(file.relativePath)
    }
  }

  // 2. Largest source files by size
  const bySize = [...files].sort((a, b) => b.size - a.size)
  for (const file of bySize) {
    if (selected.length >= maxSnippets) break
    add(file.relativePath)
  }

  // 3. Type definition files (*.d.ts, *types.ts, *Types.ts)
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

  return selected.slice(0, maxSnippets)
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

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

  // Add extracted symbols section if available
  if (extractedSymbols && extractedSymbols.length > 0) {
    // Prioritise non-unknown kinds first, then sort alphabetically
    const sorted = [...extractedSymbols].sort((a, b) => {
      if (a.kind === 'unknown' && b.kind !== 'unknown') return 1
      if (a.kind !== 'unknown' && b.kind === 'unknown') return -1
      return a.name.localeCompare(b.name)
    })
    const top = sorted.slice(0, 30)
    lines.push('')
    lines.push(`## Exported Symbols (${extractedSymbols.length})`)
    for (const s of top) {
      if (s.signature) {
        lines.push(`- ${s.kind} ${s.name}${s.signature}`)
      } else {
        lines.push(`- ${s.kind} ${s.name}`)
      }
    }
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

function parseAndValidateResponse(text: string): RawSummaryResponse | null {
  if (!text || text.trim().length === 0) return null

  const cleaned = stripMarkdownFences(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Try to extract a JSON object from the text (model may have added preamble/suffix)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        return null
      }
    } else {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null

  const obj = parsed as Record<string, unknown>

  // Validate description
  if (typeof obj.description !== 'string' || obj.description.length === 0) return null
  const description = obj.description.length > 500
    ? obj.description.slice(0, 500)
    : obj.description

  // Validate keyResponsibilities
  if (!Array.isArray(obj.keyResponsibilities)) return null
  const responsibilities = obj.keyResponsibilities
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 5)
    .map((s) => s.length > 200 ? s.slice(0, 200) : s)
  if (responsibilities.length === 0) return null

  // Validate gotchas
  const rawGotchas = Array.isArray(obj.gotchas) ? obj.gotchas : []
  const gotchas = rawGotchas
    .filter((item): item is string => typeof item === 'string')
    .slice(0, 3)
    .map((s) => s.length > 200 ? s.slice(0, 200) : s)

  return { description, keyResponsibilities: responsibilities, gotchas }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyError(error: unknown): string {
  if (error && typeof error === 'object') {
    const statusCode = (error as { status?: number }).status
    if (statusCode === 401 || statusCode === 403) return 'no_auth'
    if (statusCode === 429) return 'rate_limited'

    const message = (error as { message?: string }).message ?? ''
    if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('fetch failed')) {
      return 'network_error'
    }
    if (message.includes('401') || message.includes('403') || message.includes('Unauthorized') || message.includes('authentication')) {
      return 'no_auth'
    }
    if (message.includes('429') || message.includes('rate')) {
      return 'rate_limited'
    }

    return message || 'unknown_error'
  }

  return String(error)
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

export async function summarizeModule(context: SummarizationContext): Promise<SummarizationResult> {
  const startTime = Date.now()

  // Extract symbols from the already-read source snippets (before building the prompt)
  const extractedSymbols = extractModuleSymbols(context.sourceSnippets)

  const userMessage = buildUserMessage(context, extractedSymbols)
  let lastError: string | undefined

  // Attempt up to 2 tries (initial + 1 retry for parse failures)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, inputTokens, outputTokens } = await callCli(userMessage)
      const parsed = parseAndValidateResponse(text)

      if (parsed) {
        const summaryText = JSON.stringify(parsed)
        const summary: ModuleAISummary = {
          description: parsed.description,
          keyResponsibilities: parsed.keyResponsibilities,
          gotchas: parsed.gotchas,
          generatedAt: Date.now(),
          generatedFrom: context.module.contentHash,
          tokenCount: estimateTokens(summaryText),
        }

        console.log(`[context-layer] Summarized module "${context.module.module.label}" (~${inputTokens} in, ~${outputTokens} out)`)

        return {
          success: true,
          summary,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - startTime,
          extractedSymbols,
        }
      }

      // Parse failed — retry if this was the first attempt
      lastError = 'invalid_response'
      if (attempt === 0) {
        console.log(`[context-layer] Parse failed for module "${context.module.module.label}", retrying... Raw response (first 300 chars): ${text.slice(0, 300)}`)
      }
    } catch (error) {
      const classified = classifyError(error)

      // Do NOT retry auth errors or rate limits — let the queue handle those
      if (classified === 'no_auth' || classified === 'rate_limited' || classified === 'network_error') {
        console.log(`[context-layer] CLI error for module "${context.module.module.label}": ${classified}`)
        return {
          success: false,
          error: classified,
          durationMs: Date.now() - startTime,
          extractedSymbols,
        }
      }

      lastError = classified
      if (attempt === 0) {
        console.log(`[context-layer] Error for module "${context.module.module.label}": ${classified}, retrying...`)
      }
    }
  }

  // Both attempts failed
  console.log(`[context-layer] Failed to summarize module "${context.module.module.label}" after 2 attempts`)
  return {
    success: false,
    error: lastError === 'invalid_response' ? 'parse_failure' : lastError,
    durationMs: Date.now() - startTime,
    extractedSymbols,
  }
}
