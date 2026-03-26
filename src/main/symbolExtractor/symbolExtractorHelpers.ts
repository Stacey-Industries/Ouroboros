/**
 * symbolExtractorHelpers.ts — Helper functions extracted from symbolExtractor.ts
 */

import type { ExtractedSymbol } from './symbolExtractorTypes'

const MAX_SIGNATURE_LENGTH = 120
const MULTILINE_LOOKAHEAD = 5

// ─── Paren finding ────────────────────────────────────────────────────────────

/** Scan text for matching closing paren. Returns close-paren index or -1. */
function findCloseParen(text: string): number {
  let depth = 0
  for (let ci = 0; ci < text.length; ci++) {
    // eslint-disable-next-line security/detect-object-injection -- ci is a bounded loop index
    if (text[ci] === '(') depth++
    // eslint-disable-next-line security/detect-object-injection -- ci is a bounded loop index
    else if (text[ci] === ')') {
      depth--
      if (depth === 0) return ci
    }
  }
  return -1
}

/** Gather more lines until we find the closing paren, up to MULTILINE_LOOKAHEAD extra lines. */
function gatherToCloseParen(
  text: string,
  searchLine: number,
  lines: string[],
): { text: string; closeParen: number } {
  let accumulated = text
  let closeParen = findCloseParen(accumulated)
  let linesAdded = 0
  let extraLine = searchLine + 1

  while (closeParen === -1 && linesAdded < MULTILINE_LOOKAHEAD && extraLine < lines.length) {
    // eslint-disable-next-line security/detect-object-injection -- extraLine is a bounded loop counter
    accumulated = accumulated + ' ' + lines[extraLine]
    closeParen = findCloseParen(accumulated)
    linesAdded++
    extraLine++
  }

  return { text: accumulated, closeParen }
}

/** Truncate and normalise a signature string. */
function truncateSig(raw: string): string {
  const normalised = raw.replace(/\s+/g, ' ').trim()
  return normalised.length > MAX_SIGNATURE_LENGTH ? normalised.slice(0, MAX_SIGNATURE_LENGTH) : normalised
}

// ─── Signature extraction ─────────────────────────────────────────────────────

/** Find opening paren; may peek ahead up to MULTILINE_LOOKAHEAD lines. */
function locateOpenParen(
  afterName: string,
  lineIndex: number,
  lines: string[],
): { collected: string; parenPos: number; searchLine: number } {
  let collected = afterName
  let searchLine = lineIndex
  let parenPos = collected.indexOf('(')

  if (parenPos === -1) {
    for (let i = 1; i <= MULTILINE_LOOKAHEAD && (lineIndex + i) < lines.length; i++) {
       
      collected = collected + ' ' + lines[lineIndex + i]
      parenPos = collected.indexOf('(')
      if (parenPos !== -1) {
        searchLine = lineIndex + i
        break
      }
    }
  }

  return { collected, parenPos, searchLine }
}

/** Build final signature string from text, closeParen position, and afterParen. */
function buildSigFromParen(text: string, closeParen: number): string {
  const afterParen = text.slice(closeParen + 1)
  const braceOrArrow = afterParen.search(/\{|=>/)
  let sig: string
  if (braceOrArrow !== -1) {
    sig = text.slice(0, closeParen + 1) + afterParen.slice(0, braceOrArrow)
  } else {
    sig = text.slice(0, closeParen + 1) + afterParen
  }
  return truncateSig(sig)
}

/**
 * Given lines and a starting line index where `(` begins the signature,
 * extract the parameter list and optional return type annotation.
 */
export function extractSignature(lines: string[], lineIndex: number, afterName: string): string | null {
  const { collected, parenPos, searchLine } = locateOpenParen(afterName, lineIndex, lines)
  if (parenPos === -1) return null

  let text = collected.slice(parenPos)
  let closeParen = findCloseParen(text)

  if (closeParen === -1) {
    const gathered = gatherToCloseParen(text, searchLine, lines)
    text = gathered.text
    closeParen = gathered.closeParen
  }

  if (closeParen === -1) {
    return truncateSig(text) || null
  }

  return buildSigFromParen(text, closeParen) || null
}

// ─── Export statement parsers ─────────────────────────────────────────────────

/** Handle `export default function` / `export default class` / `export default ...`. */
export function parseDefaultExport(
  trimmed: string,
  lines: string[],
  i: number,
): ExtractedSymbol | null | 'skip' {
  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional groups; anchored at ^ prevents catastrophic backtracking
  const defaultFnMatch = trimmed.match(/^export\s+default\s+(?:async\s+)?function\s*(\w*)/)
  if (defaultFnMatch) {
    const name = defaultFnMatch[1] || 'default'
    const afterKeyword = trimmed.slice(trimmed.indexOf('function') + 'function'.length)
    const sig = extractSignature(lines, i, afterKeyword)
    return { name, kind: 'function', signature: sig, isDefault: true, line: i + 1 }
  }

  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional group; anchored at ^ prevents catastrophic backtracking
  const defaultClassMatch = trimmed.match(/^export\s+default\s+(?:abstract\s+)?class\s+(\w+)/)
  if (defaultClassMatch) {
    return { name: defaultClassMatch[1], kind: 'class', signature: null, isDefault: true, line: i + 1 }
  }

  if (/^export\s+default\s+/.test(trimmed)) return 'skip'
  return null
}

/** Handle `export async function` / `export function`. */
export function parseNamedFunction(
  trimmed: string,
  lines: string[],
  i: number,
): ExtractedSymbol | null {
  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional group; anchored at ^ prevents catastrophic backtracking
  const namedFnMatch = trimmed.match(/^export\s+(?:async\s+)?function\s+(\w+)/)
  if (!namedFnMatch) return null

  const name = namedFnMatch[1]
  const fnKwPos = trimmed.search(/function\s+\w+/)
  const afterFnKw = trimmed.slice(fnKwPos + 'function'.length)
  const afterName = afterFnKw.replace(/^\s*\w+/, '')
  const sig = extractSignature(lines, i, afterName)
  return { name, kind: 'function', signature: sig, isDefault: false, line: i + 1 }
}

/** Handle `export const name = ...` (arrow or regular function, or plain const). */
export function parseConstExport(
  trimmed: string,
  lines: string[],
  i: number,
): ExtractedSymbol | null {
  const constMatch = trimmed.match(/^export\s+const\s+(\w+)/)
  if (!constMatch) return null

  const name = constMatch[1]
  const afterConst = trimmed.slice(trimmed.indexOf('const') + 5)
  const afterName = afterConst.replace(/^\s*\w+/, '')
  // eslint-disable-next-line security/detect-unsafe-regex -- intentional: matches arrow function patterns
  const isArrowFn = /=\s*(?:async\s+)?\(|=\s*(?:async\s+)?\w+\s*=>/.test(afterName)
  // eslint-disable-next-line security/detect-unsafe-regex -- non-backtracking optional group; anchored pattern prevents catastrophic backtracking
  const isFunctionKw = /=\s*(?:async\s+)?function/.test(afterName)

  if (isArrowFn || isFunctionKw) {
    return { name, kind: 'function', signature: extractSignature(lines, i, afterName), isDefault: false, line: i + 1 }
  }
  return { name, kind: 'const', signature: null, isDefault: false, line: i + 1 }
}

/** Parse `export { orig as name }` or `export { name }` specifiers. */
export function parseExportSpecifiers(
  specifiers: string,
  lineNumber: number,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = []
  const parts = specifiers.split(',')

  for (const part of parts) {
    const spec = part.trim()
    if (!spec) continue

    const asMatch = spec.match(/(\w+)\s+as\s+(\w+)/)
    if (asMatch) {
      symbols.push({ name: asMatch[2], kind: 'unknown', signature: null, isDefault: false, line: lineNumber })
      continue
    }
    const nameMatch = spec.match(/^(\w+)$/)
    if (nameMatch) {
      symbols.push({ name: nameMatch[1], kind: 'unknown', signature: null, isDefault: false, line: lineNumber })
    }
  }

  return symbols
}
