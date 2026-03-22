import type { SessionMemoryEntry } from './sessionMemory'

const EXTRACTION_PROMPT_TEMPLATE = `Extract persistent facts, decisions, patterns, and preferences from this session that would be useful in future sessions on this codebase.

Only extract information that is:
- Specific to this project (not general programming knowledge)
- Likely to remain relevant across sessions
- Actionable (helps make decisions or avoid mistakes)

Do NOT extract: debugging details, file contents, or things obvious from reading code.

<session>
{SESSION_SUMMARY}
</session>

Respond with a JSON array of objects, each with:
- "type": one of "decision", "pattern", "fact", "preference", "error_resolution"
- "content": the memory text (be specific — include file paths, function names)
- "relevantFiles": array of file paths this relates to`

type PartialMemoryEntry = Omit<SessionMemoryEntry, 'id' | 'timestamp' | 'sessionId' | 'confidence'>

const VALID_TYPES = new Set(['decision', 'pattern', 'fact', 'preference', 'error_resolution'])

export function buildMemoryExtractionPrompt(sessionSummary: string): string {
  return EXTRACTION_PROMPT_TEMPLATE.replace('{SESSION_SUMMARY}', sessionSummary)
}

export function parseMemoryExtractionResponse(response: string): PartialMemoryEntry[] | null {
  try {
    let text = response.trim()
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (fenceMatch) text = fenceMatch[1].trim()

    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return null

    const valid: PartialMemoryEntry[] = []
    for (const item of parsed) {
      if (
        typeof item.content === 'string' &&
        item.content.length > 0 &&
        VALID_TYPES.has(item.type) &&
        Array.isArray(item.relevantFiles)
      ) {
        valid.push({
          type: item.type,
          content: item.content,
          relevantFiles: item.relevantFiles.filter((f: unknown) => typeof f === 'string'),
        })
      }
    }

    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function formatMemoriesForContext(memories: SessionMemoryEntry[]): string {
  if (memories.length === 0) return ''

  const lines = ['## Session Memory (from prior sessions)']
  for (const m of memories) {
    const files = m.relevantFiles.length > 0
      ? ` (relevant: ${m.relevantFiles.join(', ')})`
      : ''
    lines.push(`- [${m.type}] ${m.content}${files}`)
  }
  return lines.join('\n')
}
