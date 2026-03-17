/**
 * languageStrategies.ts — Language-specific import extraction, resolution,
 * and module entry point detection for the top 10 programming languages.
 *
 * Self-contained utility: no imports from other project files.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LanguageStrategy {
  /** Language identifier (matches IndexedRepoFile.language field) */
  language: string
  /** File extensions this strategy handles (with leading dot) */
  extensions: string[]
  /** Extract import specifiers from source content. Returns raw specifier strings. */
  extractImports(content: string): string[]
  /**
   * Resolve an import specifier to an actual file path.
   * @param specifier — the raw import string (e.g. "foo.bar", "../utils", "crate::foo")
   * @param fromFileRelPath — relative path of the importing file (forward slashes)
   * @param knownPaths — Set of all known file relative paths in the repo
   * @returns the resolved file's relative path, or null if unresolvable
   */
  resolveImport(specifier: string, fromFileRelPath: string, knownPaths: Set<string>): string | null
  /** Is this file a module entry point (barrel file equivalent)? */
  isModuleEntryPoint(filePath: string): boolean
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Resolve a relative import path against the importing file's directory. */
function resolveRelativePath(fromFileRelPath: string, importPath: string): string {
  const dirParts = fromFileRelPath.split('/').slice(0, -1)
  const importParts = importPath.split('/')
  const resolved = [...dirParts]
  for (const part of importParts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

/** Try path directly, then with each candidate suffix, against known paths. */
function tryMatch(basePath: string, knownPaths: Set<string>, suffixes: string[]): string | null {
  if (knownPaths.has(basePath)) return basePath
  for (const suffix of suffixes) {
    const candidate = basePath + suffix
    if (knownPaths.has(candidate)) return candidate
  }
  return null
}

/** Extract the basename from a forward-slash path. */
function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? ''
}

/** Extract the directory portion from a forward-slash path. */
function dirname(filePath: string): string {
  const parts = filePath.split('/').slice(0, -1)
  return parts.join('/')
}

// ---------------------------------------------------------------------------
// 1. TypeScript / JavaScript
// ---------------------------------------------------------------------------

/**
 * Configured path aliases from tsconfig.json `paths` entries.
 * Each entry maps a prefix (e.g. "@main/") to a replacement directory (e.g. "src/main/").
 * Set via `configureTypeScriptAliases()`.
 */
let tsPathAliases: Array<{ prefix: string; replacement: string }> = []

const typescriptJavascript: LanguageStrategy = {
  language: 'typescript-javascript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // import/export ... from '...'
    const fromRe = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    while ((m = fromRe.exec(content)) !== null) {
      results.push(m[1])
    }

    // require('...')
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((m = requireRe.exec(content)) !== null) {
      results.push(m[1])
    }

    // import('...')
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((m = dynamicRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    // Try expanding path aliases (e.g. "@main/foo" → "src/main/foo")
    for (const alias of tsPathAliases) {
      if (specifier.startsWith(alias.prefix)) {
        const expanded = alias.replacement + specifier.slice(alias.prefix.length)
        const extSuffixes = ['.ts', '.tsx', '.js', '.jsx']
        const indexSuffixes = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']
        const match = tryMatch(expanded, knownPaths, [...extSuffixes, ...indexSuffixes])
        if (match) return match
      }
    }

    // Skip bare package imports (not relative, not aliased)
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null

    const resolved = resolveRelativePath(fromFileRelPath, specifier)
    const extSuffixes = ['.ts', '.tsx', '.js', '.jsx']
    const indexSuffixes = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx']
    return tryMatch(resolved, knownPaths, [...extSuffixes, ...indexSuffixes])
  },

  isModuleEntryPoint(filePath) {
    const base = basename(filePath)
    return /^index\.(ts|tsx|js|jsx)$/.test(base)
  },
}

// ---------------------------------------------------------------------------
// 2. Python
// ---------------------------------------------------------------------------

const python: LanguageStrategy = {
  language: 'python',
  extensions: ['.py', '.pyi'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // from foo.bar import ... (including relative: from .foo import, from ..utils import)
    const fromRe = /^(?:from\s+(\.{0,3}[\w.]*))\s+import\s/gm
    let m: RegExpExecArray | null
    while ((m = fromRe.exec(content)) !== null) {
      if (m[1]) results.push(m[1])
    }

    // import foo.bar [as X] — can have multiple comma-separated
    const importRe = /^import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/gm
    while ((m = importRe.exec(content)) !== null) {
      const segment = m[1]
      // Split on commas, strip "as X" aliases
      const parts = segment.split(',')
      for (const part of parts) {
        const cleaned = part.trim().replace(/\s+as\s+\w+/, '').trim()
        if (cleaned) results.push(cleaned)
      }
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const suffixes = ['.py', '.pyi']
    const initSuffixes = ['/__init__.py', '/__init__.pyi']

    // Handle relative imports (leading dots)
    const dotMatch = specifier.match(/^(\.+)(.*)$/)
    if (dotMatch) {
      const dots = dotMatch[1]
      const rest = dotMatch[2] ?? ''

      // Each dot goes up one directory from the file's package
      const dir = dirname(fromFileRelPath)
      const dirParts = dir.split('/').filter(p => p !== '')

      // First dot = current package, each extra dot = one level up
      const levelsUp = dots.length - 1
      const baseParts = dirParts.slice(0, dirParts.length - levelsUp)

      // Convert the remaining dotted module path to path segments
      const moduleParts = rest ? rest.split('.') : []
      const fullPath = [...baseParts, ...moduleParts].join('/')

      if (!fullPath) return null
      return tryMatch(fullPath, knownPaths, [...suffixes, ...initSuffixes])
    }

    // Absolute import: foo.bar -> foo/bar.py or foo/bar/__init__.py
    const asPath = specifier.replace(/\./g, '/')
    return tryMatch(asPath, knownPaths, [...suffixes, ...initSuffixes])
  },

  isModuleEntryPoint(filePath) {
    const base = basename(filePath)
    return base === '__init__.py' || base === '__init__.pyi'
  },
}

// ---------------------------------------------------------------------------
// 3. Java
// ---------------------------------------------------------------------------

const java: LanguageStrategy = {
  language: 'java',
  extensions: ['.java'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // import [static] com.example.Foo[.method];
    const importRe = /^import\s+(?:static\s+)?([\w.]+)\s*;/gm
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
      let spec = m[1]
      // For static imports, drop the trailing method/field name
      if (/^import\s+static\s/.test(m[0])) {
        const lastDot = spec.lastIndexOf('.')
        if (lastDot > 0) spec = spec.substring(0, lastDot)
      }
      results.push(spec)
    }

    return results
  },

  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    // com.example.Foo -> com/example/Foo.java
    const asPath = specifier.replace(/\./g, '/')
    const suffixes = ['.java']

    // Try direct path
    const direct = tryMatch(asPath, knownPaths, suffixes)
    if (direct) return direct

    // Try common Java source roots
    const roots = ['src/main/java/', 'src/']
    for (const root of roots) {
      const candidate = tryMatch(root + asPath, knownPaths, suffixes)
      if (candidate) return candidate
    }
    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 4. Kotlin
// ---------------------------------------------------------------------------

const kotlin: LanguageStrategy = {
  language: 'kotlin',
  extensions: ['.kt', '.kts'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // import com.example.Foo (no semicolon required in Kotlin)
    const importRe = /^import\s+([\w.]+)/gm
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const asPath = specifier.replace(/\./g, '/')
    const suffixes = ['.kt', '.kts']

    const direct = tryMatch(asPath, knownPaths, suffixes)
    if (direct) return direct

    const roots = ['src/main/kotlin/', 'src/']
    for (const root of roots) {
      const candidate = tryMatch(root + asPath, knownPaths, suffixes)
      if (candidate) return candidate
    }
    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 5. Go
// ---------------------------------------------------------------------------

const go: LanguageStrategy = {
  language: 'go',
  extensions: ['.go'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // Single import: import "path/to/pkg"
    const singleRe = /^import\s+"([^"]+)"/gm
    let m: RegExpExecArray | null
    while ((m = singleRe.exec(content)) !== null) {
      results.push(m[1])
    }

    // Grouped imports: import ( ... )
    const groupRe = /^import\s*\(([^)]*)\)/gm
    while ((m = groupRe.exec(content)) !== null) {
      const block = m[1]
      const lineRe = /["']([^"']+)["']/g
      let lineMatch: RegExpExecArray | null
      while ((lineMatch = lineRe.exec(block)) !== null) {
        results.push(lineMatch[1])
      }
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    // Relative imports: ./foo or ../foo
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const resolved = resolveRelativePath(fromFileRelPath, specifier)
      // Go imports are directory-level — find any .go file in that directory
      const prefix = resolved + '/'
      for (const p of knownPaths) {
        if (p.startsWith(prefix) && p.endsWith('.go') && !p.substring(prefix.length).includes('/')) {
          return p
        }
      }
      return null
    }

    // Package imports — match the last segment as a directory name
    const lastSegment = specifier.split('/').pop()
    if (!lastSegment) return null

    // Try to find a directory matching the import path tail
    const candidateDir = specifier + '/'
    for (const p of knownPaths) {
      if (p.endsWith('.go') && p.includes(candidateDir)) {
        // Verify the .go file is directly inside the directory (not a subdirectory)
        const afterDir = p.substring(p.indexOf(candidateDir) + candidateDir.length)
        if (!afterDir.includes('/')) return p
      }
    }

    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 6. Rust
// ---------------------------------------------------------------------------

const rust: LanguageStrategy = {
  language: 'rust',
  extensions: ['.rs'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // use crate::foo::bar; / use super::foo; / use self::foo;
    // Handles multi-path use: use crate::foo::{bar, baz}; by capturing up to the brace
    const useRe = /^use\s+((?:crate|super|self)(?:::\w+)+)/gm
    let m: RegExpExecArray | null
    while ((m = useRe.exec(content)) !== null) {
      results.push(m[1])
    }

    // mod foo; (module declarations that pull in another file)
    const modRe = /^mod\s+(\w+)\s*;/gm
    while ((m = modRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const rsSuffixes = ['.rs', '/mod.rs']

    // mod foo; — same directory, foo.rs or foo/mod.rs
    if (!specifier.includes('::')) {
      const dir = dirname(fromFileRelPath)
      const base = dir ? dir + '/' + specifier : specifier
      return tryMatch(base, knownPaths, rsSuffixes)
    }

    const parts = specifier.split('::')
    const prefix = parts[0]

    if (prefix === 'crate') {
      // crate::foo::bar -> src/foo/bar.rs or src/foo/bar/mod.rs
      const pathParts = parts.slice(1)
      const asPath = 'src/' + pathParts.join('/')
      return tryMatch(asPath, knownPaths, rsSuffixes)
    }

    if (prefix === 'super') {
      // super::foo -> go up one directory, then foo.rs or foo/mod.rs
      const dir = dirname(fromFileRelPath)
      const parentDir = dirname(dir)
      const pathParts = parts.slice(1)
      const asPath = parentDir ? parentDir + '/' + pathParts.join('/') : pathParts.join('/')
      return tryMatch(asPath, knownPaths, rsSuffixes)
    }

    if (prefix === 'self') {
      // self::foo -> same directory, foo.rs or foo/mod.rs
      const dir = dirname(fromFileRelPath)
      const pathParts = parts.slice(1)
      const asPath = dir ? dir + '/' + pathParts.join('/') : pathParts.join('/')
      return tryMatch(asPath, knownPaths, rsSuffixes)
    }

    return null
  },

  isModuleEntryPoint(filePath) {
    const base = basename(filePath)
    return base === 'mod.rs' || base === 'lib.rs' || base === 'main.rs'
  },
}

// ---------------------------------------------------------------------------
// 7. C / C++
// ---------------------------------------------------------------------------

const cCpp: LanguageStrategy = {
  language: 'c-cpp',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // #include "path/to/file.h" — quoted includes only, skip <system> includes
    const includeRe = /^#include\s+"([^"]+)"/gm
    let m: RegExpExecArray | null
    while ((m = includeRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    // The specifier IS the path — try exact match first
    if (knownPaths.has(specifier)) return specifier

    // Try relative to the file's directory
    const resolved = resolveRelativePath(fromFileRelPath, specifier)
    if (knownPaths.has(resolved)) return resolved

    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 8. Ruby
// ---------------------------------------------------------------------------

const ruby: LanguageStrategy = {
  language: 'ruby',
  extensions: ['.rb'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // require_relative './foo' or require_relative "../bar"
    const relativeRe = /require_relative\s+['"]([^'"]+)['"]/g
    let m: RegExpExecArray | null
    while ((m = relativeRe.exec(content)) !== null) {
      results.push('relative:' + m[1])
    }

    // require 'foo' or require "foo" (skip require_relative, already matched)
    const requireRe = /(?<!_)require\s+['"]([^'"]+)['"]/g
    while ((m = requireRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const suffixes = ['.rb']

    // require_relative paths (tagged with prefix)
    if (specifier.startsWith('relative:')) {
      const relPath = specifier.substring('relative:'.length)
      const resolved = resolveRelativePath(fromFileRelPath, relPath)
      return tryMatch(resolved, knownPaths, suffixes)
    }

    // require paths — try relative to repo root, then under lib/
    const direct = tryMatch(specifier, knownPaths, suffixes)
    if (direct) return direct

    const withLib = tryMatch('lib/' + specifier, knownPaths, suffixes)
    if (withLib) return withLib

    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 9. PHP
// ---------------------------------------------------------------------------

const php: LanguageStrategy = {
  language: 'php',
  extensions: ['.php'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // use App\Foo\Bar [as Alias];
    const useRe = /^use\s+([\w\\]+)\s*(?:as\s+\w+\s*)?;/gm
    let m: RegExpExecArray | null
    while ((m = useRe.exec(content)) !== null) {
      results.push('use:' + m[1])
    }

    // require_once / require / include_once / include 'path.php'
    const pathRe = /(?:require_once|require|include_once|include)\s+['"]([^'"]+)['"]/g
    while ((m = pathRe.exec(content)) !== null) {
      results.push(m[1])
    }

    return results
  },

  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const suffixes = ['.php']

    // PSR-4 use statements (tagged with prefix)
    if (specifier.startsWith('use:')) {
      const namespace = specifier.substring('use:'.length)
      const asPath = namespace.replace(/\\/g, '/')

      const direct = tryMatch(asPath, knownPaths, suffixes)
      if (direct) return direct

      // Try common PSR-4 root directories
      const roots = ['src/', 'app/']
      for (const root of roots) {
        const candidate = tryMatch(root + asPath, knownPaths, suffixes)
        if (candidate) return candidate
      }

      // Try skipping the first namespace segment (often the vendor prefix)
      const parts = asPath.split('/')
      if (parts.length > 1) {
        const withoutVendor = parts.slice(1).join('/')
        const candidate = tryMatch(withoutVendor, knownPaths, suffixes)
        if (candidate) return candidate

        for (const root of roots) {
          const candidate = tryMatch(root + withoutVendor, knownPaths, suffixes)
          if (candidate) return candidate
        }
      }

      return null
    }

    // require/include paths — try direct match, then with .php suffix
    return tryMatch(specifier, knownPaths, suffixes)
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

// ---------------------------------------------------------------------------
// 10. C#
// ---------------------------------------------------------------------------

const csharp: LanguageStrategy = {
  language: 'csharp',
  extensions: ['.cs'],

  extractImports(content: string): string[] {
    const results: string[] = []

    // using Namespace.SubNamespace; — skip 'using static', 'using System.*'
    const usingRe = /^using\s+([\w.]+)\s*;/gm
    let m: RegExpExecArray | null
    while ((m = usingRe.exec(content)) !== null) {
      const ns = m[1]
      // Skip 'static' keyword (appears as first segment after 'using')
      if (ns === 'static' || ns.startsWith('static ')) continue
      // Skip System namespaces
      if (ns.startsWith('System.') || ns === 'System') continue
      results.push(ns)
    }

    return results
  },

  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    // C# namespaces don't reliably map to file paths — best-effort resolution
    const asPath = specifier.replace(/\./g, '/')
    const suffixes = ['.cs']

    const direct = tryMatch(asPath, knownPaths, suffixes)
    if (direct) return direct

    const withSrc = tryMatch('src/' + asPath, knownPaths, suffixes)
    if (withSrc) return withSrc

    return null
  },

  isModuleEntryPoint(_filePath) {
    return false
  },
}

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
]

/** Extension -> strategy lookup, built at module load time. */
const extensionMap = new Map<string, LanguageStrategy>()
for (const strategy of allStrategies) {
  for (const ext of strategy.extensions) {
    extensionMap.set(ext, strategy)
  }
}

/** Language name -> strategy lookup, built at module load time. */
const languageMap = new Map<string, LanguageStrategy>()
for (const strategy of allStrategies) {
  languageMap.set(strategy.language, strategy)
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

/** Get strategy by file extension (with leading dot). Returns null for unsupported. */
export function getStrategyForExtension(ext: string): LanguageStrategy | null {
  return extensionMap.get(ext) ?? null
}

/** Get strategy by language name. Returns null for unsupported. */
export function getStrategyForLanguage(lang: string): LanguageStrategy | null {
  return languageMap.get(lang) ?? null
}

/** Get all importable extensions across all strategies. */
export function getAllImportableExtensions(): Set<string> {
  return new Set(extensionMap.keys())
}

/**
 * Configure TypeScript path aliases for import resolution.
 * Parses tsconfig-style `paths` entries like `{ "@main/*": ["src/main/*"] }`
 * into prefix/replacement pairs. Call once at startup before building the import graph.
 */
export function configureTypeScriptAliases(
  pathsEntries: Record<string, string[]>,
): void {
  tsPathAliases = []
  for (const [pattern, targets] of Object.entries(pathsEntries)) {
    if (targets.length === 0) continue
    // Strip the trailing /* wildcard to get the prefix
    const prefix = pattern.endsWith('/*') ? pattern.slice(0, -1) : pattern
    const target = targets[0]
    const replacement = target.endsWith('/*') ? target.slice(0, -1) : target
    tsPathAliases.push({ prefix, replacement })
  }
  if (tsPathAliases.length > 0) {
    console.log(
      `[context-layer] Configured ${tsPathAliases.length} path alias(es): ` +
      tsPathAliases.map(a => `${a.prefix} → ${a.replacement}`).join(', ')
    )
  }
}
