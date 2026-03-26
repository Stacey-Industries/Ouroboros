import {
  parseConstExport,
  parseDefaultExport,
  parseExportSpecifiers,
  parseNamedFunction,
} from './symbolExtractorHelpers'
import type { ExtractedSymbol } from './symbolExtractorTypes'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 500 * 1024  // 500 KB

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strip single-line and block comments from source code.
 * Preserves line numbers by replacing comment content with spaces.
 */
function stripComments(source: string): string {
  let result = source.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return match.replace(/[^\n]/g, ' ')
  })
  result = result.replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
  return result
}

// ---------------------------------------------------------------------------
// Simple export matchers (class, interface, type, enum, let/var, re-exports)
// ---------------------------------------------------------------------------

function parseClassOrInterface(trimmed: string, i: number): ExtractedSymbol | null {
  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional group; no catastrophic backtracking risk
  const classMatch = trimmed.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/)
  if (classMatch) return { name: classMatch[1], kind: 'class', signature: null, isDefault: false, line: i + 1 }

  const ifaceMatch = trimmed.match(/^export\s+interface\s+(\w+)/)
  if (ifaceMatch) return { name: ifaceMatch[1], kind: 'interface', signature: null, isDefault: false, line: i + 1 }

  return null
}

function parseTypeOrEnum(trimmed: string, i: number): ExtractedSymbol | null {
  const typeMatch = trimmed.match(/^export\s+type\s+(\w+)/)
  if (typeMatch) return { name: typeMatch[1], kind: 'type', signature: null, isDefault: false, line: i + 1 }

  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional group; no catastrophic backtracking risk
  const enumMatch = trimmed.match(/^export\s+(?:const\s+)?enum\s+(\w+)/)
  if (enumMatch) return { name: enumMatch[1], kind: 'enum', signature: null, isDefault: false, line: i + 1 }

  return null
}

function parseLetVar(trimmed: string, i: number): ExtractedSymbol | null {
  const letVarMatch = trimmed.match(/^export\s+(?:let|var)\s+(\w+)/)
  if (!letVarMatch) return null
  return { name: letVarMatch[1], kind: 'const', signature: null, isDefault: false, line: i + 1 }
}

function parseReExports(trimmed: string, i: number): ExtractedSymbol[] | null {
  // export { name1, name2 } from '...'
  const reExportMatch = trimmed.match(/^export\s+\{([^}]+)\}\s+from\s+['"]/)
  if (reExportMatch) return parseExportSpecifiers(reExportMatch[1], i + 1)

  // export { name1, name2 }  (local re-exports, no `from`)
  const localReExportMatch = trimmed.match(/^export\s+\{([^}]+)\}(?!\s+from)/)
  if (localReExportMatch) return parseExportSpecifiers(localReExportMatch[1], i + 1)

  return null
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extract exported symbols from TypeScript/JavaScript file content.
 *
 * @param filePath - Relative or absolute path used to determine file type
 * @param content  - UTF-8 file content
 * @returns Array of extracted symbols (empty if .d.ts file or >500KB)
 */
export function extractSymbols(filePath: string, content: string): ExtractedSymbol[] {
  if (filePath.endsWith('.d.ts')) return []
  if (content.length > MAX_FILE_SIZE) return []

  const stripped = stripComments(content)
  const lines = stripped.split('\n')
  const symbols: ExtractedSymbol[] = []

  for (let i = 0; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded loop index
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('@')) continue
    if (!trimmed.startsWith('export')) continue

    const result = processExportLine(trimmed, lines, i)
    if (result === 'continue') continue
    if (Array.isArray(result)) {
      for (const sym of result) symbols.push(sym)
    } else if (result) {
      symbols.push(result)
    }
  }

  return symbols
}

/** Process a single export line. Returns symbol(s), 'continue', or null. */
function processExportLine(
  trimmed: string,
  lines: string[],
  i: number,
): ExtractedSymbol | ExtractedSymbol[] | 'continue' | null {
  // export default ...
  if (/^export\s+default\s+/.test(trimmed)) {
    const result = parseDefaultExport(trimmed, lines, i)
    if (result === 'skip') return 'continue'
    if (result) return result
    return 'continue'
  }

  // export async function / export function
  const namedFn = parseNamedFunction(trimmed, lines, i)
  if (namedFn) return namedFn

  // export class / export interface
  const classOrIface = parseClassOrInterface(trimmed, i)
  if (classOrIface) return classOrIface

  // export type / export enum
  const typeOrEnum = parseTypeOrEnum(trimmed, i)
  if (typeOrEnum) return typeOrEnum

  // export const
  const constSym = parseConstExport(trimmed, lines, i)
  if (constSym) return constSym

  // export let / export var
  const letVar = parseLetVar(trimmed, i)
  if (letVar) return letVar

  // export { ... } from / export { ... }
  const reExports = parseReExports(trimmed, i)
  if (reExports) return reExports

  return null
}
