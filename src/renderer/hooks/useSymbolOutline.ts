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

interface NamedPattern {
  re: RegExp;
  kind: SymbolKind;
  nameGroup?: number;
}

type SymbolExtractor = (lines: string[]) => OutlineSymbol[];

const JS_TS_TOP_LEVEL_PATTERNS: NamedPattern[] = [
  {
    re: /^(?:export\s+default\s+)?(?:export\s+)?async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    kind: 'function',
  },
  {
    re: /^(?:export\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    kind: 'function',
  },
  {
    re: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    kind: 'class',
  },
  {
    re: /^(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    kind: 'interface',
  },
  {
    re: /^(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=<]/,
    kind: 'type',
  },
  {
    re: /^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
    kind: 'class',
  },
  {
    re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\(/,
    kind: 'function',
  },
  {
    re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function/,
    kind: 'function',
  },
];

const JS_TS_METHOD_PATTERNS: NamedPattern[] = [
  {
    re: /^(\s+)(?:(?:public|private|protected|static|override|abstract|async)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
    kind: 'method',
    nameGroup: 2,
  },
  {
    re: /^(\s+)(?:(?:public|private|protected|static)\s+)*(?:get|set)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
    kind: 'method',
    nameGroup: 2,
  },
];

const RUST_PATTERNS: Array<{
  re: RegExp;
  createSymbol: (match: RegExpMatchArray, line: number, indent: number) => OutlineSymbol;
}> = [
  {
    re: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/,
    createSymbol: (match, line, indent) => ({
      name: match[1],
      kind: indent > 0 ? 'method' : 'function',
      line,
      depth: indent > 0 ? 1 : 0,
    }),
  },
  {
    re: /^(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/,
    createSymbol: (match, line) => ({ name: match[1], kind: 'class', line, depth: 0 }),
  },
  {
    re: /^(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)/,
    createSymbol: (match, line) => ({ name: match[1], kind: 'class', line, depth: 0 }),
  },
  {
    re: /^impl(?:<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_:]*\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/,
    createSymbol: (match, line) => ({ name: `impl ${match[1]}`, kind: 'interface', line, depth: 0 }),
  },
  {
    re: /^(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)/,
    createSymbol: (match, line) => ({ name: match[1], kind: 'interface', line, depth: 0 }),
  },
];

function getTrimmedLineInfo(line: string): { trimmed: string; indent: number } {
  const trimmed = line.trimStart();
  return { trimmed, indent: line.length - trimmed.length };
}

function isBlankOrComment(trimmed: string): boolean {
  return !trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function matchNamedPattern(text: string, patterns: NamedPattern[]): { kind: SymbolKind; name: string } | null {
  for (const { re, kind, nameGroup = 1 } of patterns) {
    const match = text.match(re);
    if (match?.[nameGroup]) return { kind, name: match[nameGroup] };
  }

  return null;
}

function buildSymbol(
  match: { kind: SymbolKind; name: string } | null,
  line: number,
  depth: number,
): OutlineSymbol | null {
  return match ? { name: match.name, kind: match.kind, line, depth } : null;
}

function buildClassRanges(lines: string[]): Array<{ start: number; indent: number }> {
  return lines.reduce<Array<{ start: number; indent: number }>>((ranges, line, index) => {
    const { trimmed, indent } = getTrimmedLineInfo(line);
    if (/^(?:export\s+)?(?:abstract\s+)?class\s+/.test(trimmed)) ranges.push({ start: index, indent });
    return ranges;
  }, []);
}

function isInsideClass(
  lineIndex: number,
  lineIndent: number,
  classRanges: Array<{ start: number; indent: number }>,
): boolean {
  return classRanges.some((classRange) => lineIndex > classRange.start && lineIndent > classRange.indent);
}

function extractJsTsMethodSymbol(line: string, lineNumber: number): OutlineSymbol | null {
  const match = matchNamedPattern(line, JS_TS_METHOD_PATTERNS);
  if (!match || /^(if|for|while|switch|return|const|let|var|new|import|export)$/.test(match.name)) {
    return null;
  }

  return buildSymbol(match, lineNumber, 1);
}

function extractJsTsSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  const classRanges = buildClassRanges(lines);

  for (const [index, line] of lines.entries()) {
    const { trimmed, indent } = getTrimmedLineInfo(line);
    if (isBlankOrComment(trimmed)) continue;

    const topLevelSymbol =
      indent === 0 ? buildSymbol(matchNamedPattern(trimmed, JS_TS_TOP_LEVEL_PATTERNS), index, 0) : null;
    if (topLevelSymbol) {
      symbols.push(topLevelSymbol);
      continue;
    }

    if (indent > 0 && isInsideClass(index, indent, classRanges)) {
      const methodSymbol = extractJsTsMethodSymbol(line, index);
      if (methodSymbol) symbols.push(methodSymbol);
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

    const atMatch = trimmed.match(/^(@(?:media|keyframes|layer|supports|import|charset)[^{;]*)/);
    if (atMatch) {
      symbols.push({ name: atMatch[1].trim(), kind: 'type', line: i, depth: 0 });
      continue;
    }

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
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) symbols.push({ name: match[2].trim(), kind: 'heading', line: i, depth: match[1].length - 1 });
  }

  return symbols;
}

function extractRustSymbol(trimmed: string, line: number, indent: number): OutlineSymbol | null {
  for (const pattern of RUST_PATTERNS) {
    const match = trimmed.match(pattern.re);
    if (match) return pattern.createSymbol(match, line, indent);
  }

  return null;
}

function extractRustSymbols(lines: string[]): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const { trimmed, indent } = getTrimmedLineInfo(lines[i]);
    if (!trimmed || trimmed.startsWith('//')) continue;

    const symbol = extractRustSymbol(trimmed, i, indent);
    if (symbol) symbols.push(symbol);
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
      const isMethod = trimmed.startsWith('func (');
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

const LANGUAGE_EXTRACTORS: Record<string, SymbolExtractor> = {
  typescript: extractJsTsSymbols,
  tsx: extractJsTsSymbols,
  javascript: extractJsTsSymbols,
  jsx: extractJsTsSymbols,
  python: extractPythonSymbols,
  css: extractCssSymbols,
  scss: extractCssSymbols,
  sass: extractCssSymbols,
  less: extractCssSymbols,
  markdown: extractMarkdownSymbols,
  mdx: extractMarkdownSymbols,
  rust: extractRustSymbols,
  go: extractGoSymbols,
};

function extractSymbols(content: string, language: string): OutlineSymbol[] {
  if (!content.trim()) return [];

  const extractor = LANGUAGE_EXTRACTORS[language];
  return extractor ? extractor(content.split('\n')) : [];
}

/**
 * useSymbolOutline extracts structural symbols from file content.
 *
 * Memoized: only recomputes when content or language changes.
 * Returns an empty array if the language is unsupported or content is empty.
 */
export function useSymbolOutline(
  content: string | null,
  language: string,
): OutlineSymbol[] {
  return useMemo(() => {
    if (!content) return [];
    return extractSymbols(content, language);
  }, [content, language]);
}
