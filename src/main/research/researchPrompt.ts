/**
 * researchPrompt.ts — Pure function that builds the research subagent prompt.
 *
 * Extracted so the prompt can be unit-tested independently of the spawn logic.
 * No side effects — safe to call at any time.
 */

export interface ResearchPromptInput {
  topic: string;
  library?: string;
  version?: string;
}

/**
 * Builds the stdin prompt that is piped to `claude --print --model sonnet`.
 *
 * The prompt instructs the subagent to:
 *   1. Use Context7, web search, and reference tools to gather sources.
 *   2. Synthesise a 1.5–2 K token summary.
 *   3. Return a single JSON object matching the specified schema.
 *
 * The subagent must NOT stream — it must emit one JSON blob on stdout.
 */
export function buildResearchPrompt(input: ResearchPromptInput): string {
  const { topic, library, version } = input;
  const libraryLine = library
    ? `Library: ${library}${version ? ` (version: ${version})` : ''}\n`
    : '';

  return `You are a research assistant. Your job is to research the following topic and return structured JSON.

Research Topic: ${topic}
${libraryLine}
## Instructions

1. Use available tools to gather accurate, current information:
   - Context7 (ctx7): fetch official library documentation
   - Web search: find recent blog posts, changelogs, GitHub issues
   - Reference tools: check MDN, RFC docs, or official specs when applicable

2. Write a clear, developer-focused summary of 1500–2000 tokens. Cover:
   - Core concepts relevant to the topic
   - Key API patterns or configuration options
   - Common pitfalls and how to avoid them
   - Version-specific notes if a version was specified

3. Include 2–5 code snippets or concrete examples that directly illustrate the topic.

4. Cite all sources with a URL and short title.

5. Assess your confidence: "high" if you found first-party official docs, "medium" if mainly third-party or blog sources, "low" if sources were sparse or potentially outdated.

## Output format

Respond with ONLY a single JSON object — no markdown fences, no prose outside the JSON:

{
  "sources": [
    { "url": "https://...", "title": "Source title" }
  ],
  "summary": "Synthesised explanation here (1500–2000 tokens)...",
  "relevantSnippets": [
    { "content": "code or text snippet", "source": "source label or URL" }
  ],
  "confidenceHint": "high" | "medium" | "low"
}

Do not include any other keys. Do not wrap the JSON in markdown fences.`;
}
