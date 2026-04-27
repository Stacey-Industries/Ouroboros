/**
 * claudeMdGeneratorLeanPrompt.ts — Builds the lean CLAUDE.md generation prompt.
 *
 * The lean prompt explicitly excludes derivable content (file-role tables,
 * subdirectory indexes, import/export dependency lists, architecture flow
 * diagrams) and instructs the model to OMIT rather than speculate.
 *
 * Quotes inline warnings as supporting evidence when present.
 */

import type { InlineWarning } from './claudeMdGeneratorInlineWarnings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeanPromptInput {
  dirPath: string;
  relPath: string;
  codeSamples: string;
  inlineWarnings: InlineWarning[];
  targetMaxLines: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildExcludeSection(): string {
  return `## EXCLUDE — Do NOT generate these
The following content types are EXCLUDED. Omit them entirely, even if you could derive them from the code:
- File-role tables (e.g. "| File | Role |" tables listing every file in the directory)
- Subdirectory indexes (lists of child directories with one-line descriptions)
- Import/export dependency lists (what this module imports or exports)
- Architecture flow diagrams (ASCII trees of component hierarchies)
- Generic advice that applies to any codebase ("use error handling", "keep files small")

These are graph-derivable or redundant. Putting them in CLAUDE.md creates stale duplicates.

`;
}

function buildIncludeSection(): string {
  return `## INCLUDE — What belongs in CLAUDE.md
Only include tribal knowledge a developer cannot derive by reading the code:
- Gotchas: load-bearing patterns that look wrong but must stay as-is
- Design decisions with rationale ("we chose X because Y; do not refactor to Z")
- "Do not refactor this" warnings with the reason
- Non-obvious invariants (ordering constraints, lifecycle sequencing, timing assumptions)
- Failure modes that are silent or hard to reproduce
- Cross-cutting concerns that are invisible when reading files in isolation

`;
}

function buildOmitDirective(): string {
  return `## Primary guardrail
**OMIT rather than speculate.** If you are not certain a gotcha exists, leave the section empty.
An empty "## Gotchas" section is correct. An invented gotcha is harmful.

`;
}

function buildSizeDirective(targetMaxLines: number): string {
  return `## Size target
Target under ${targetMaxLines} lines. Prefer fewer, denser lines over comprehensive coverage.
A 20-line CLAUDE.md that captures 3 real gotchas is better than a 150-line one with padding.

`;
}

function formatWarnings(warnings: InlineWarning[]): string {
  if (warnings.length === 0) return '';

  const lines = warnings.map((w) => `  - [${w.kind}] ${w.file}:${w.line} — ${w.text}`);

  return `## Inline warnings found in source (use as supporting evidence)
Quote these when they anchor a gotcha. Do not invent gotchas not supported by one of these entries.
${lines.join('\n')}

`;
}

function buildOutputRules(): string {
  return `## Output rules
- Your FIRST character must be \`#\` (a markdown heading) or \`<!--\` (an HTML comment).
- Do NOT preface the output with prose ("Here's the content:", "The file contains:", etc.).
- Do NOT wrap output in markdown fences.
- Do NOT include \`★ Insight\` blocks or meta-commentary.
- The file content you emit will be used verbatim.

`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a lean generation prompt for CLAUDE.md content.
 * The prompt enforces "OMIT rather than speculate" and excludes derivable content.
 */
export function buildLeanPrompt(input: LeanPromptInput): string {
  const { relPath, codeSamples, inlineWarnings, targetMaxLines } = input;

  let prompt = `You are generating a CLAUDE.md file for a directory in a production codebase.

## Directory
Path: ${relPath}/

`;

  if (codeSamples) {
    prompt += `## Code samples (first ~50 lines of largest files)\n${codeSamples}\n\n`;
  }

  prompt += buildExcludeSection();
  prompt += buildIncludeSection();
  prompt += buildOmitDirective();
  prompt += buildSizeDirective(targetMaxLines);
  prompt += formatWarnings(inlineWarnings);

  if (inlineWarnings.length === 0) {
    prompt += `No inline warnings were found in this directory's source files.
Leave "## Gotchas" empty rather than inventing content.

`;
  }

  prompt += buildOutputRules();

  return prompt;
}
