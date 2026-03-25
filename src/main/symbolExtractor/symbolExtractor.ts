import type { ExtractedSymbol } from './symbolExtractorTypes'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 500 * 1024  // 500 KB
const MAX_SIGNATURE_LENGTH = 120
const MULTILINE_LOOKAHEAD = 5   // lines to look ahead for closing paren

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strip single-line and block comments from source code.
 * Preserves line numbers by replacing comment content with spaces.
 */
function stripComments(source: string): string {
  // Replace block comments with whitespace (preserving newlines for line numbers)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return match.replace(/[^\n]/g, ' ')
  })
  // Replace single-line comments with empty
  result = result.replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
  return result
}

// ---------------------------------------------------------------------------
// Signature extraction helpers
// ---------------------------------------------------------------------------

/**
 * Given lines and a starting line index where `(` begins the signature,
 * extract the parameter list and optional return type annotation.
 * Looks ahead up to MULTILINE_LOOKAHEAD lines to handle multi-line sigs.
 * Returns null if no `(` found within the relevant portion.
 */
function extractSignature(lines: string[], lineIndex: number, afterName: string): string | null {
  // `afterName` is the text after the function/method name on the same line
  // We need to find `(` and then capture to `{` or `=>`

  let collected = afterName
  let searchLine = lineIndex

  // If the opening paren isn't on this line, peek ahead
  let parenPos = collected.indexOf('(')
  if (parenPos === -1) {
    // Look ahead a few lines
    for (let i = 1; i <= MULTILINE_LOOKAHEAD && (lineIndex + i) < lines.length; i++) {
      collected = collected + ' ' + lines[lineIndex + i]
      parenPos = collected.indexOf('(')
      if (parenPos !== -1) {
        searchLine = lineIndex + i
        break
      }
    }
  }

  if (parenPos === -1) return null

  // Now we have `(` at parenPos. Collect enough text to find the end of the
  // parameter list (matching close paren) plus optional return type.
  let text = collected.slice(parenPos)

  // If the text doesn't have a closing `)`, look ahead for more lines
  let depth = 0
  let closeParen = -1
  for (let ci = 0; ci < text.length; ci++) {
    if (text[ci] === '(') depth++
    else if (text[ci] === ')') {
      depth--
      if (depth === 0) {
        closeParen = ci
        break
      }
    }
  }

  if (closeParen === -1) {
    // Try to gather more lines
    let linesAdded = 0
    let extraLine = searchLine + 1
    while (closeParen === -1 && linesAdded < MULTILINE_LOOKAHEAD && extraLine < lines.length) {
      text = text + ' ' + lines[extraLine]
      // Re-scan from where we left off
      depth = 0
      for (let ci = 0; ci < text.length; ci++) {
        if (text[ci] === '(') depth++
        else if (text[ci] === ')') {
          depth--
          if (depth === 0) {
            closeParen = ci
            break
          }
        }
      }
      linesAdded++
      extraLine++
    }
  }

  if (closeParen === -1) {
    // Couldn't find close paren — return just the params so far, truncated
    const raw = text.replace(/\s+/g, ' ').trim()
    return raw.length > MAX_SIGNATURE_LENGTH ? raw.slice(0, MAX_SIGNATURE_LENGTH) : raw
  }

  // Capture up to `{` or `=>` after the closing paren
  const afterParen = text.slice(closeParen + 1)
  const braceOrArrow = afterParen.search(/\{|=>/)
  let sig: string
  if (braceOrArrow !== -1) {
    sig = text.slice(0, closeParen + 1) + afterParen.slice(0, braceOrArrow)
  } else {
    sig = text.slice(0, closeParen + 1) + afterParen
  }

  // Normalise whitespace
  sig = sig.replace(/\s+/g, ' ').trim()

  // Truncate
  if (sig.length > MAX_SIGNATURE_LENGTH) {
    sig = sig.slice(0, MAX_SIGNATURE_LENGTH)
  }

  return sig || null
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
  // Skip declaration files
  if (filePath.endsWith('.d.ts')) {
    return []
  }

  // Skip files over the size limit
  if (content.length > MAX_FILE_SIZE) {
    return []
  }

  const stripped = stripComments(content)
  const lines = stripped.split('\n')
  const symbols: ExtractedSymbol[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // -------------------------------------------------------------------------
    // Skip lines that don't start an export statement
    // (allow leading decorators: lines starting with @)
    // -------------------------------------------------------------------------

    // Handle decorator lines: if line starts with @, look for the export on
    // subsequent lines. We'll handle this by skipping decorator lines and
    // letting the export line be processed on its own iteration.
    if (trimmed.startsWith('@')) {
      continue
    }

    if (!trimmed.startsWith('export')) {
      continue
    }

    // -------------------------------------------------------------------------
    // export default function name / export default class Name
    // -------------------------------------------------------------------------
    const defaultFnMatch = trimmed.match(/^export\s+default\s+(?:async\s+)?function\s*(\w*)/)
    if (defaultFnMatch) {
      const name = defaultFnMatch[1] || 'default'
      const afterKeyword = trimmed.slice(trimmed.indexOf('function') + 'function'.length)
      const sig = extractSignature(lines, i, afterKeyword)
      symbols.push({ name, kind: 'function', signature: sig, isDefault: true, line: i + 1 })
      continue
    }

    const defaultClassMatch = trimmed.match(/^export\s+default\s+(?:abstract\s+)?class\s+(\w+)/)
    if (defaultClassMatch) {
      symbols.push({ name: defaultClassMatch[1], kind: 'class', signature: null, isDefault: true, line: i + 1 })
      continue
    }

    // export default (anonymous)
    if (/^export\s+default\s+/.test(trimmed) && !defaultFnMatch && !defaultClassMatch) {
      // Skip unnamed default exports (objects, expressions)
      continue
    }

    // -------------------------------------------------------------------------
    // export async function / export function
    // -------------------------------------------------------------------------
    const namedFnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/)
    if (namedFnMatch) {
      const name = namedFnMatch[1]
      const fnKwPos = trimmed.search(/function\s+\w+/)
      const afterFnKw = trimmed.slice(fnKwPos + 'function'.length)
      const afterName = afterFnKw.replace(/^\s*\w+/, '')  // strip the name
      const sig = extractSignature(lines, i, afterName)
      symbols.push({ name, kind: 'function', signature: sig, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export abstract class / export class
    // -------------------------------------------------------------------------
    const classMatch = trimmed.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/)
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', signature: null, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export interface
    // -------------------------------------------------------------------------
    const interfaceMatch = trimmed.match(/^export\s+interface\s+(\w+)/)
    if (interfaceMatch) {
      symbols.push({ name: interfaceMatch[1], kind: 'interface', signature: null, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export type Name = ...
    // -------------------------------------------------------------------------
    const typeMatch = trimmed.match(/^export\s+type\s+(\w+)/)
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', signature: null, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export enum
    // -------------------------------------------------------------------------
    const enumMatch = trimmed.match(/^export\s+(?:const\s+)?enum\s+(\w+)/)
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: 'enum', signature: null, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export const name = ... (arrow function or value)
    // -------------------------------------------------------------------------
    const constMatch = trimmed.match(/^export\s+const\s+(\w+)/)
    if (constMatch) {
      const name = constMatch[1]
      // Check if it's an arrow function: look for `= ... =>`
      const afterConst = trimmed.slice(trimmed.indexOf('const') + 5)
      const afterName = afterConst.replace(/^\s*\w+/, '')  // strip the name
      // Check if this const is assigned an arrow function or regular function
      const isArrowFn = /=\s*(?:async\s+)?\(|=\s*(?:async\s+)?\w+\s*=>/.test(afterName)
      const isFunctionKw = /=\s*(?:async\s+)?function/.test(afterName)

      if (isArrowFn || isFunctionKw) {
        // Extract signature from the arrow/function portion
        const sig = extractSignature(lines, i, afterName)
        symbols.push({ name, kind: 'function', signature: sig, isDefault: false, line: i + 1 })
      } else {
        symbols.push({ name, kind: 'const', signature: null, isDefault: false, line: i + 1 })
      }
      continue
    }

    // -------------------------------------------------------------------------
    // export let / export var (treat as const-like)
    // -------------------------------------------------------------------------
    const letVarMatch = trimmed.match(/^export\s+(?:let|var)\s+(\w+)/)
    if (letVarMatch) {
      symbols.push({ name: letVarMatch[1], kind: 'const', signature: null, isDefault: false, line: i + 1 })
      continue
    }

    // -------------------------------------------------------------------------
    // export { name1, name2 } from '...'   or   export { orig as name }
    // -------------------------------------------------------------------------
    const reExportMatch = trimmed.match(/^export\s+\{([^}]+)\}\s+from\s+['"]/)
    if (reExportMatch) {
      const specifiers = reExportMatch[1]
      // Parse each specifier: "orig as name" or just "name"
      const parts = specifiers.split(',')
      for (const part of parts) {
        const spec = part.trim()
        if (!spec) continue
        // Skip namespace: `* as ns` handled separately
        const asMatch = spec.match(/(\w+)\s+as\s+(\w+)/)
        if (asMatch) {
          // export { original as renamed } — the exported name is `renamed`
          symbols.push({ name: asMatch[2], kind: 'unknown', signature: null, isDefault: false, line: i + 1 })
        } else {
          const nameMatch = spec.match(/^(\w+)$/)
          if (nameMatch) {
            symbols.push({ name: nameMatch[1], kind: 'unknown', signature: null, isDefault: false, line: i + 1 })
          }
        }
      }
      continue
    }

    // -------------------------------------------------------------------------
    // export { name1, name2 }  (local re-exports, no `from`)
    // -------------------------------------------------------------------------
    const localReExportMatch = trimmed.match(/^export\s+\{([^}]+)\}(?!\s+from)/)
    if (localReExportMatch) {
      const specifiers = localReExportMatch[1]
      const parts = specifiers.split(',')
      for (const part of parts) {
        const spec = part.trim()
        if (!spec) continue
        const asMatch = spec.match(/(\w+)\s+as\s+(\w+)/)
        if (asMatch) {
          symbols.push({ name: asMatch[2], kind: 'unknown', signature: null, isDefault: false, line: i + 1 })
        } else {
          const nameMatch = spec.match(/^(\w+)$/)
          if (nameMatch) {
            symbols.push({ name: nameMatch[1], kind: 'unknown', signature: null, isDefault: false, line: i + 1 })
          }
        }
      }
      continue
    }

    // -------------------------------------------------------------------------
    // export * from '...'  — namespace re-export, skip (no specific symbol)
    // -------------------------------------------------------------------------
    // (already handled by not matching any of the above patterns)
  }

  return symbols
}
