import { useMemo } from 'react';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'method'
  | 'variable'
  | 'heading';

export interface OutlineSymbol {
  name: string;
  kind: SymbolKind;
  /** 0-based line index */
  line: number;
  /** Nesting depth (0 = top-level) */
  depth: number;
}

// ── Language → symbol extraction ─────────────────────────────────────────────

function extractJsTsSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  // Patterns for JS/TS (applied per line)
  const patterns: Array<{ re: RegExp; kind: SymbolKind }> = [
    // export default function foo / export default async function
    {
      re: /^(?:export\s+default\s+)?(?:export\s+)?async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
      kind: 'function',
    },
    // function foo
    {
      re: /^(?:export\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
      kind: 'function',
    },
    // class Foo / abstract class Foo
    {
      re: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
      kind: 'class',
    },
    // interface Foo
    {
      re: /^(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
      kind: 'interface',
    },
    // type Foo =
    {
      re: /^(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=<]/,
      kind: 'type',
    },
    // enum Foo
    {
      re: /^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
      kind: 'class',
    },
    // const/let/var foo = () => / const foo = async () =>
    {
      re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\(/,
      kind: 'function',
    },
    // const/let/var foo = async function
    {
      re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function/,
      kind: 'function',
    },
  ];

  // Method patterns — inside class body (indented)
  const methodPatterns: Array<{ re: RegExp; kind: SymbolKind }> = [
    // async foo() / foo() — method declarations
    {
      re: /^(\s+)(?:(?:public|private|protected|static|override|abstract|async)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
      kind: 'method',
    },
    // get/set accessor
    {
      re: /^(\s+)(?:(?:public|private|protected|static)\s+)*(?:get|set)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
      kind: 'method',
    },
  ];

  // Detect class range to classify indented items as methods
  const classRanges: Array<{ start: number; indent: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (/^(?:export\s+)?(?:abstract\s+)?class\s+/.test(trimmed)) {
      const indent = lines[i].length - trimmed.length;
      classRanges.push({ start: i, indent });
    }
  }

  function insideClass(lineIdx: number, lineIndent: number): boolean {
    for (const cr of classRanges) {
      if (lineIdx > cr.start && lineIndent > cr.indent) return true;
    }
    return false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineIndent = line.length - trimmed.length;

    // Skip comments and blank lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    let matched = false;

    // Top-level patterns (only match at indent 0 or export)
    if (lineIndent === 0) {
      for (const { re, kind } of patterns) {
        const m = trimmed.match(re);
        if (m) {
          symbols.push({ name: m[1], kind, line: i, depth: 0 });
          matched = true;
          break;
        }
      }
    }

    // Method patterns (inside class body)
    if (!matched && lineIndent > 0 && insideClass(i, lineIndent)) {
      for (const { re, kind } of methodPatterns) {
        const m = line.match(re);
        if (m) {
          const name = m[2] ?? m[1];
          // Skip constructor noise and common non-method tokens
          if (/^(if|for|while|switch|return|const|let|var|new|import|export)$/.test(name)) continue;
          symbols.push({ name, kind, line: i, depth: 1 });
          matched = true;
          break;
        }
      }
    }
  }

  return symbols;
}

function extractPythonSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed) continue;

    const indent = line.length - trimmed.length;

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', line: i, depth: indent > 0 ? 1 : 0 });
      continue;
    }

    const defMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (defMatch) {
      const kind: SymbolKind = indent > 0 ? 'method' : 'function';
      symbols.push({ name: defMatch[1], kind, line: i, depth: indent > 0 ? 1 : 0 });
    }
  }

  return symbols;
}

function extractCssSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // @media / @keyframes / @layer
    const atMatch = trimmed.match(/^(@(?:media|keyframes|layer|supports|import|charset)[^{;]*)/);
    if (atMatch) {
      symbols.push({ name: atMatch[1].trim(), kind: 'type', line: i, depth: 0 });
      continue;
    }

    // .selector { or #id { or element { — selector lines ending with {
    if (trimmed.endsWith('{')) {
      const selector = trimmed.slice(0, -1).trim();
      if (selector && !selector.startsWith('//') && !selector.startsWith('*')) {
        const kind: SymbolKind = selector.startsWith('.') || selector.startsWith('#') ? 'class' : 'variable';
        symbols.push({ name: selector, kind, line: i, depth: 0 });
      }
    }
  }

  return symbols;
}

function extractMarkdownSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      const depth = m[1].length - 1; // h1 → 0, h2 → 1, etc.
      symbols.push({ name: m[2].trim(), kind: 'heading', line: i, depth });
    }
  }

  return symbols;
}

function extractRustSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const indent = line.length - trimmed.length;

    const fnMatch = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (fnMatch) {
      const kind: SymbolKind = indent > 0 ? 'method' : 'function';
      symbols.push({ name: fnMatch[1], kind, line: i, depth: indent > 0 ? 1 : 0 });
      continue;
    }

    const structMatch = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (structMatch) {
      symbols.push({ name: structMatch[1], kind: 'class', line: i, depth: 0 });
      continue;
    }

    const enumMatch = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: 'class', line: i, depth: 0 });
      continue;
    }

    const implMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_:]*\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
    if (implMatch) {
      symbols.push({ name: `impl ${implMatch[1]}`, kind: 'interface', line: i, depth: 0 });
      continue;
    }

    const traitMatch = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (traitMatch) {
      symbols.push({ name: traitMatch[1], kind: 'interface', line: i, depth: 0 });
    }
  }

  return symbols;
}

function extractGoSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const fnMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (fnMatch) {
      // Receiver method vs top-level function
      const isMethod = trimmed.match(/^func\s+\(/);
      symbols.push({ name: fnMatch[1], kind: isMethod ? 'method' : 'function', line: i, depth: isMethod ? 1 : 0 });
      continue;
    }

    const typeMatch = trimmed.match(/^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:struct|interface)/);
    if (typeMatch) {
      const kind: SymbolKind = trimmed.includes('struct') ? 'class' : 'interface';
      symbols.push({ name: typeMatch[1], kind, line: i, depth: 0 });
    }
  }

  return symbols;
}

// ── Dispatch by language ──────────────────────────────────────────────────────

function extractSymbols(content: string, language: string): OutlineSymbol[] {
  if (!content.trim()) return [];

  const lines = content.split('\n');

  switch (language) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
    case 'jsx':
      return extractJsTsSymbols(lines);
    case 'python':
      return extractPythonSymbols(lines);
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return extractCssSymbols(lines);
    case 'markdown':
    case 'mdx':
      return extractMarkdownSymbols(lines);
    case 'rust':
      return extractRustSymbols(lines);
    case 'go':
      return extractGoSymbols(lines);
    default:
      return [];
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useSymbolOutline — extracts structural symbols from file content.
 *
 * Memoized: only recomputes when content or language changes.
 * Returns an empty array if the language is unsupported or content is empty.
 */
export function useSymbolOutline(
  content: string | null,
  language: string
): OutlineSymbol[] {
  return useMemo(() => {
    if (!content) return [];
    return extractSymbols(content, language);
  }, [content, language]);
}
