/**
 * claudeMdGeneratorInlineWarnings.ts — Scans .ts/.tsx files in a directory
 * for inline warning comments and eslint-disable lines with reasons.
 *
 * Non-recursive (matches buildFileListing scope in claudeMdGeneratorSupport.ts).
 * Returns structured { file, line, kind, text } entries for use in prompts.
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InlineWarningKind = 'NOTE' | 'WARNING' | 'DO_NOT' | 'HACK' | 'ESLINT_REASON';

export interface InlineWarning {
  file: string;
  line: number;
  kind: InlineWarningKind;
  text: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx']);

// Pattern order matters — check eslint-disable before NOTE/WARNING/HACK so
// a line like "// eslint-disable-next-line ... -- reason: ..." is classified
// as ESLINT_REASON rather than accidentally matching another kind.
const PATTERNS: Array<{ kind: InlineWarningKind; regex: RegExp }> = [
  { kind: 'ESLINT_REASON', regex: /\/\/\s*eslint-disable[^\n]*(?:—|--)\s*reason:\s*(.+)$/i },
  { kind: 'DO_NOT', regex: /\/\/\s*DO NOT[:\s]+(.+)$/i },
  { kind: 'WARNING', regex: /\/\/\s*WARNING[:\s]+(.+)$/i },
  { kind: 'HACK', regex: /\/\/\s*HACK[:\s]+(.+)$/i },
  { kind: 'NOTE', regex: /\/\/\s*NOTE[:\s]+(.+)$/i },
];

// ---------------------------------------------------------------------------
// Per-file extraction
// ---------------------------------------------------------------------------

function extractFromLine(
  lineText: string,
  lineNumber: number,
  fileName: string,
): InlineWarning | null {
  for (const { kind, regex } of PATTERNS) {
    const match = lineText.match(regex);
    if (match) {
      return { file: fileName, line: lineNumber, kind, text: match[1].trim() };
    }
  }
  return null;
}

async function extractFromFile(filePath: string, fileName: string): Promise<InlineWarning[]> {
  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from directory listing
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return [];
  }

  const warnings: InlineWarning[] = [];
  const lines = content.split('\n');

  for (const [i, lineText] of lines.entries()) {
    const warning = extractFromLine(lineText, i + 1, fileName);
    if (warning) warnings.push(warning);
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans all .ts and .tsx files (non-recursive) in dirPath and returns
 * structured inline warning entries for use in CLAUDE.md prompts.
 */
export async function collectInlineWarnings(dirPath: string): Promise<InlineWarning[]> {
  let entries: import('fs').Dirent<string>[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath from project directory discovery
    entries = (await fs.readdir(dirPath, { withFileTypes: true })) as import('fs').Dirent<string>[];
  } catch {
    return [];
  }

  const results: InlineWarning[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SCANNED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const fileWarnings = await extractFromFile(path.join(dirPath, entry.name), entry.name);
    results.push(...fileWarnings);
  }

  return results;
}
