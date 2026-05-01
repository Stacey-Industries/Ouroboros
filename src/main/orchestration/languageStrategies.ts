/**
 * languageStrategies.ts — Language-specific import extraction, resolution,
 * and module entry point detection for the top 10 programming languages.
 *
 * Languages 1-5 (TS/JS, Python, Java, Kotlin, Go) are defined here.
 * Languages 6-10 (Rust, C/C++, Ruby, PHP, C#) are in languageStrategiesSupport.ts.
 */

import log from '../logger';
import { cCpp, csharp, java, kotlin, php, ruby, rust } from './languageStrategiesSupport';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LanguageStrategy {
  /** Language identifier (matches IndexedRepoFile.language field) */
  language: string;
  /** File extensions this strategy handles (with leading dot) */
  extensions: string[];
  /** Extract import specifiers from source content. Returns raw specifier strings. */
  extractImports(content: string): string[];
  /**
   * Resolve an import specifier to an actual file path.
   * @param specifier — the raw import string (e.g. "foo.bar", "../utils", "crate::foo")
   * @param fromFileRelPath — relative path of the importing file (forward slashes)
   * @param knownPaths — Set of all known file relative paths in the repo
   * @returns the resolved file's relative path, or null if unresolvable
   */
  resolveImport(specifier: string, fromFileRelPath: string, knownPaths: Set<string>): string | null;
  /** Is this file a module entry point (barrel file equivalent)? */
  isModuleEntryPoint(filePath: string): boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers (exported for use by languageStrategiesSupport.ts)
// ---------------------------------------------------------------------------

/** Resolve a relative import path against the importing file's directory. */
export function resolveRelativePath(fromFileRelPath: string, importPath: string): string {
  const dirParts = fromFileRelPath.split('/').slice(0, -1);
  const importParts = importPath.split('/');
  const resolved = [...dirParts];
  for (const part of importParts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

/** Try path directly, then with each candidate suffix, against known paths. */
export function tryMatch(
  basePath: string,
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  if (knownPaths.has(basePath)) return basePath;
  for (const suffix of suffixes) {
    const candidate = basePath + suffix;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

/** Extract the basename from a forward-slash path. */
export function basename(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] ?? '';
}

/** Extract the directory portion from a forward-slash path. */
export function dirname(filePath: string): string {
  const parts = filePath.split('/').slice(0, -1);
  return parts.join('/');
}

// ---------------------------------------------------------------------------
// 1. TypeScript / JavaScript
// ---------------------------------------------------------------------------

/**
 * Configured path aliases from tsconfig.json `paths` entries.
 * Set via `configureTypeScriptAliases()`.
 */
let tsPathAliases: Array<{ prefix: string; replacement: string }> = [];

const TS_EXT_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx'];
const TS_INDEX_SUFFIXES = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function forEachLine(content: string, visitor: (line: string) => void): void {
  for (const line of content.split('\n')) {
    visitor(line);
  }
}

function extractTsFromImports(content: string, results: string[]): void {
  const fromRe = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(content)) !== null) {
    results.push(m[1]);
  }
}

function extractTsRequires(content: string, results: string[]): void {
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = requireRe.exec(content)) !== null) {
    results.push(m[1]);
  }
}

function extractTsDynamicImports(content: string, results: string[]): void {
  const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = dynamicRe.exec(content)) !== null) {
    results.push(m[1]);
  }
}

const typescriptJavascript: LanguageStrategy = {
  language: 'typescript-javascript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],

  extractImports(content: string): string[] {
    const results: string[] = [];
    extractTsFromImports(content, results);
    extractTsRequires(content, results);
    extractTsDynamicImports(content, results);
    return results;
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    for (const alias of tsPathAliases) {
      if (specifier.startsWith(alias.prefix)) {
        const expanded = alias.replacement + specifier.slice(alias.prefix.length);
        const allSuffixes = [...TS_EXT_SUFFIXES, ...TS_INDEX_SUFFIXES];
        const match = tryMatch(expanded, knownPaths, allSuffixes);
        if (match) return match;
      }
    }

    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;

    const resolved = resolveRelativePath(fromFileRelPath, specifier);
    const allSuffixes = [...TS_EXT_SUFFIXES, ...TS_INDEX_SUFFIXES];
    return tryMatch(resolved, knownPaths, allSuffixes);
  },

  isModuleEntryPoint(filePath) {
    const base = basename(filePath);
    return (
      base === 'index.ts' || base === 'index.tsx' || base === 'index.js' || base === 'index.jsx'
    );
  },
};

// ---------------------------------------------------------------------------
// 2. Python
// ---------------------------------------------------------------------------

function extractPythonFromImports(content: string, results: string[]): void {
  forEachLine(content, (line) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('from ')) return;
    const importIndex = trimmed.indexOf(' import ');
    if (importIndex < 0) return;
    const specifier = trimmed.slice('from '.length, importIndex).trim();
    if (specifier) results.push(specifier);
  });
}

function extractPythonImports(content: string, results: string[]): void {
  forEachLine(content, (line) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('import ')) return;
    const specifiers = trimmed.slice('import '.length).split(',');
    for (const part of specifiers) {
      const cleaned = part.trim();
      const asIndex = cleaned.indexOf(' as ');
      const resolved = (asIndex >= 0 ? cleaned.slice(0, asIndex) : cleaned).trim();
      if (resolved) results.push(resolved);
    }
  });
}

interface PythonRelativeImportOpts {
  specifier: string;
  fromFileRelPath: string;
  knownPaths: Set<string>;
  suffixes: string[];
  initSuffixes: string[];
}

function resolvePythonRelativeImport(opts: PythonRelativeImportOpts): string | null {
  const { specifier, fromFileRelPath, knownPaths, suffixes, initSuffixes } = opts;
  let dotCount = 0;
  while (dotCount < specifier.length && specifier.charAt(dotCount) === '.') {
    dotCount += 1;
  }
  if (dotCount === 0) return null;

  const rest = specifier.slice(dotCount);
  const dir = dirname(fromFileRelPath);
  const dirParts = dir.split('/').filter((p) => p !== '');
  const levelsUp = dotCount - 1;
  const baseParts = dirParts.slice(0, dirParts.length - levelsUp);
  const moduleParts = rest ? rest.split('.') : [];
  const fullPath = [...baseParts, ...moduleParts].join('/');

  if (!fullPath) return null;
  return tryMatch(fullPath, knownPaths, [...suffixes, ...initSuffixes]);
}

const python: LanguageStrategy = {
  language: 'python',
  extensions: ['.py', '.pyi'],

  extractImports(content: string): string[] {
    const results: string[] = [];
    extractPythonFromImports(content, results);
    extractPythonImports(content, results);
    return results;
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const suffixes = ['.py', '.pyi'];
    const initSuffixes = ['/__init__.py', '/__init__.pyi'];

    const relativeResult = resolvePythonRelativeImport({
      specifier,
      fromFileRelPath,
      knownPaths,
      suffixes,
      initSuffixes,
    });
    if (relativeResult !== null) return relativeResult;
    // If dotMatch didn't match, it's not a relative import — check absolute
    if (specifier.startsWith('.')) return null;

    const asPath = specifier.replace(/\./g, '/');
    return tryMatch(asPath, knownPaths, [...suffixes, ...initSuffixes]);
  },

  isModuleEntryPoint(filePath) {
    const base = basename(filePath);
    return base === '__init__.py' || base === '__init__.pyi';
  },
};

// ---------------------------------------------------------------------------
// 3. Go (Java and Kotlin moved to languageStrategiesSupport.ts)
// ---------------------------------------------------------------------------

function resolveGoRelativeImport(
  specifier: string,
  fromFileRelPath: string,
  knownPaths: Set<string>,
): string | null {
  const resolved = resolveRelativePath(fromFileRelPath, specifier);
  const prefix = resolved + '/';
  for (const p of knownPaths) {
    const isDirectChild = !p.substring(prefix.length).includes('/');
    if (p.startsWith(prefix) && p.endsWith('.go') && isDirectChild) {
      return p;
    }
  }
  return null;
}

function resolveGoPackageImport(specifier: string, knownPaths: Set<string>): string | null {
  const lastSegment = specifier.split('/').pop();
  if (!lastSegment) return null;

  const candidateDir = specifier + '/';
  for (const p of knownPaths) {
    if (!p.endsWith('.go') || !p.includes(candidateDir)) continue;
    const afterDir = p.substring(p.indexOf(candidateDir) + candidateDir.length);
    if (!afterDir.includes('/')) return p;
  }
  return null;
}

const go: LanguageStrategy = {
  language: 'go',
  extensions: ['.go'],

  extractImports(content: string): string[] {
    const results: string[] = [];

    const singleRe = /^import\s+"([^"]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = singleRe.exec(content)) !== null) {
      results.push(m[1]);
    }

    const groupRe = /^import\s*\(([^)]*)\)/gm;
    while ((m = groupRe.exec(content)) !== null) {
      const block = m[1];
      const lineRe = /["']([^"']+)["']/g;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRe.exec(block)) !== null) {
        results.push(lineMatch[1]);
      }
    }

    return results;
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return resolveGoRelativeImport(specifier, fromFileRelPath, knownPaths);
    }
    return resolveGoPackageImport(specifier, knownPaths);
  },

  isModuleEntryPoint() {
    return false;
  },
};

// ---------------------------------------------------------------------------
// Strategy registry
// ---------------------------------------------------------------------------

const allStrategies: LanguageStrategy[] = [
  typescriptJavascript,
  python,
  java,
  kotlin,
  go,
  rust,
  cCpp,
  ruby,
  php,
  csharp,
];

/** Extension -> strategy lookup, built at module load time. */
const extensionMap = new Map<string, LanguageStrategy>();
for (const strategy of allStrategies) {
  for (const ext of strategy.extensions) {
    extensionMap.set(ext, strategy);
  }
}

/** Language name -> strategy lookup, built at module load time. */
const languageMap = new Map<string, LanguageStrategy>();
for (const strategy of allStrategies) {
  languageMap.set(strategy.language, strategy);
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/** Get strategy by file extension (with leading dot). Returns null for unsupported. */
export function getStrategyForExtension(ext: string): LanguageStrategy | null {
  return extensionMap.get(ext) ?? null;
}

/** Get strategy by language name. Returns null for unsupported. */
export function getStrategyForLanguage(lang: string): LanguageStrategy | null {
  return languageMap.get(lang) ?? null;
}

/** Get all importable extensions across all strategies. */
export function getAllImportableExtensions(): Set<string> {
  return new Set(extensionMap.keys());
}

/**
 * Configure TypeScript path aliases for import resolution.
 * Parses tsconfig-style `paths` entries like `{ "@main/*": ["src/main/*"] }`
 * into prefix/replacement pairs.
 */
export function configureTypeScriptAliases(pathsEntries: Record<string, string[]>): void {
  tsPathAliases = [];
  for (const [pattern, targets] of Object.entries(pathsEntries)) {
    if (targets.length === 0) continue;
    const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern;
    const target = targets[0];
    const replacement = target.endsWith('/*') ? target.slice(0, -1) : target;
    tsPathAliases.push({ prefix, replacement });
  }
  if (tsPathAliases.length > 0) {
    log.info(
      `Configured ${tsPathAliases.length} path alias(es): ` +
        tsPathAliases.map((a) => `${a.prefix} → ${a.replacement}`).join(', '),
    );
  }
}
