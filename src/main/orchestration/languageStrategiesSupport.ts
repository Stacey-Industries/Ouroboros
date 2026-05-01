import type { LanguageStrategy } from './languageStrategies';
import { basename, dirname, resolveRelativePath, tryMatch } from './languageStrategies';

function forEachLine(content: string, visitor: (line: string) => void): void {
  for (const line of content.split('\n')) visitor(line);
}

function firstToken(text: string): string {
  const trimmed = text.trim();
  const spaceIndex = trimmed.indexOf(' ');
  return spaceIndex >= 0 ? trimmed.substring(0, spaceIndex) : trimmed;
}

function resolveRustCratePath(
  parts: string[],
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  return tryMatch('src/' + parts.slice(1).join('/'), knownPaths, suffixes);
}

function resolveRustSuperPath(
  parts: string[],
  fromFileRelPath: string,
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  const dir = dirname(fromFileRelPath);
  const parentDir = dirname(dir);
  const pathParts = parts.slice(1).join('/');
  return tryMatch((parentDir ? parentDir + '/' : '') + pathParts, knownPaths, suffixes);
}

function resolveRustSelfPath(
  parts: string[],
  fromFileRelPath: string,
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  const dir = dirname(fromFileRelPath);
  return tryMatch((dir ? dir + '/' : '') + parts.slice(1).join('/'), knownPaths, suffixes);
}

export const rust: LanguageStrategy = {
  language: 'rust',
  extensions: ['.rs'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    forEachLine(content, (line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('use ')) {
        const spec = trimmed.slice(4).trim();
        if (spec.startsWith('crate::') || spec.startsWith('super::') || spec.startsWith('self::')) {
          const end = spec.indexOf(';');
          results.push((end >= 0 ? spec.slice(0, end) : spec).trim());
        }
      }
      if (trimmed.startsWith('mod ')) {
        const modName = firstToken(trimmed.slice(4));
        if (modName) results.push(modName);
      }
    });
    return results;
  },
  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const rsSuffixes = ['.rs', '/mod.rs'];
    if (!specifier.includes('::')) {
      const dir = dirname(fromFileRelPath);
      return tryMatch((dir ? dir + '/' : '') + specifier, knownPaths, rsSuffixes);
    }
    const parts = specifier.split('::');
    if (parts[0] === 'crate') return resolveRustCratePath(parts, knownPaths, rsSuffixes);
    if (parts[0] === 'super')
      return resolveRustSuperPath(parts, fromFileRelPath, knownPaths, rsSuffixes);
    if (parts[0] === 'self')
      return resolveRustSelfPath(parts, fromFileRelPath, knownPaths, rsSuffixes);
    return null;
  },
  isModuleEntryPoint(filePath) {
    const base = basename(filePath);
    return base === 'mod.rs' || base === 'lib.rs' || base === 'main.rs';
  },
};

export const cCpp: LanguageStrategy = {
  language: 'c-cpp',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    const includeRe = /^#include\s+"([^"]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = includeRe.exec(content)) !== null) results.push(m[1]);
    return results;
  },
  resolveImport(specifier, fromFileRelPath, knownPaths) {
    if (knownPaths.has(specifier)) return specifier;
    const resolved = resolveRelativePath(fromFileRelPath, specifier);
    return knownPaths.has(resolved) ? resolved : null;
  },
  isModuleEntryPoint() {
    return false;
  },
};

export const ruby: LanguageStrategy = {
  language: 'ruby',
  extensions: ['.rb'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    const relativeRe = /require_relative\s+['"]([^'"]+)['"]/g;
    const requireRe = /(?<!_)require\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = relativeRe.exec(content)) !== null) results.push('relative:' + m[1]);
    while ((m = requireRe.exec(content)) !== null) results.push(m[1]);
    return results;
  },
  resolveImport(specifier, fromFileRelPath, knownPaths) {
    const suffixes = ['.rb'];
    if (specifier.startsWith('relative:')) {
      const relPath = specifier.substring('relative:'.length);
      return tryMatch(resolveRelativePath(fromFileRelPath, relPath), knownPaths, suffixes);
    }
    const direct = tryMatch(specifier, knownPaths, suffixes);
    if (direct) return direct;
    return tryMatch('lib/' + specifier, knownPaths, suffixes);
  },
  isModuleEntryPoint() {
    return false;
  },
};

function resolvePhpUsePath(
  asPath: string,
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  const direct = tryMatch(asPath, knownPaths, suffixes);
  if (direct) return direct;
  for (const root of ['src/', 'app/']) {
    const candidate = tryMatch(root + asPath, knownPaths, suffixes);
    if (candidate) return candidate;
  }
  return null;
}

function resolvePhpUseWithoutVendor(
  asPath: string,
  knownPaths: Set<string>,
  suffixes: string[],
): string | null {
  const parts = asPath.split('/');
  if (parts.length <= 1) return null;
  const withoutVendor = parts.slice(1).join('/');
  const direct = tryMatch(withoutVendor, knownPaths, suffixes);
  if (direct) return direct;
  for (const root of ['src/', 'app/']) {
    const candidate = tryMatch(root + withoutVendor, knownPaths, suffixes);
    if (candidate) return candidate;
  }
  return null;
}

function parsePhpUseSpecifier(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('use ')) return null;
  const spec = trimmed.slice(4).trim();
  const semicolon = spec.indexOf(';');
  const namespace = (semicolon >= 0 ? spec.slice(0, semicolon) : spec).trim();
  const asIndex = namespace.toLowerCase().indexOf(' as ');
  const resolved = (asIndex >= 0 ? namespace.slice(0, asIndex) : namespace).trim();
  return resolved ? 'use:' + resolved : null;
}

function parsePhpRequirePath(line: string): string | null {
  const trimmed = line.trimStart();
  for (const prefix of ['require_once', 'require', 'include_once', 'include']) {
    if (!trimmed.startsWith(prefix)) continue;
    const doubleQuoteIndex = trimmed.indexOf('"');
    const singleQuoteIndex = trimmed.indexOf("'");
    const start =
      doubleQuoteIndex >= 0 && (singleQuoteIndex < 0 || doubleQuoteIndex < singleQuoteIndex)
        ? doubleQuoteIndex
        : singleQuoteIndex;
    if (start < 0) return null;
    const quote = trimmed.charAt(start);
    const end = trimmed.indexOf(quote, start + 1);
    return end >= 0 ? trimmed.slice(start + 1, end) : null;
  }
  return null;
}

function addPhpImportsFromLine(line: string, results: string[]): void {
  const useSpecifier = parsePhpUseSpecifier(line);
  if (useSpecifier) results.push(useSpecifier);
  const requirePath = parsePhpRequirePath(line);
  if (requirePath) results.push(requirePath);
}

export const php: LanguageStrategy = {
  language: 'php',
  extensions: ['.php'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    forEachLine(content, (line) => addPhpImportsFromLine(line, results));
    return results;
  },
  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const suffixes = ['.php'];
    if (specifier.startsWith('use:')) {
      const namespace = specifier.substring('use:'.length);
      const asPath = namespace.replace(/\\/g, '/');
      return (
        resolvePhpUsePath(asPath, knownPaths, suffixes) ??
        resolvePhpUseWithoutVendor(asPath, knownPaths, suffixes)
      );
    }
    return tryMatch(specifier, knownPaths, suffixes);
  },
  isModuleEntryPoint() {
    return false;
  },
};

export const java: LanguageStrategy = {
  language: 'java',
  extensions: ['.java'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    forEachLine(content, (line) => {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith('import ')) return;
      let spec = trimmed.slice('import '.length).trim();
      const semiIndex = spec.indexOf(';');
      if (semiIndex >= 0) spec = spec.slice(0, semiIndex).trim();
      if (spec.startsWith('static ')) {
        spec = spec.slice('static '.length).trim();
        const lastDot = spec.lastIndexOf('.');
        if (lastDot > 0) spec = spec.slice(0, lastDot);
      }
      if (spec) results.push(spec);
    });
    return results;
  },
  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const asPath = specifier.replace(/\./g, '/');
    const suffixes = ['.java'];
    const direct = tryMatch(asPath, knownPaths, suffixes);
    if (direct) return direct;
    for (const root of ['src/main/java/', 'src/']) {
      const candidate = tryMatch(root + asPath, knownPaths, suffixes);
      if (candidate) return candidate;
    }
    return null;
  },
  isModuleEntryPoint() {
    return false;
  },
};

export const kotlin: LanguageStrategy = {
  language: 'kotlin',
  extensions: ['.kt', '.kts'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    const importRe = /^import\s+([\w.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) results.push(m[1]);
    return results;
  },
  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const asPath = specifier.replace(/\./g, '/');
    const suffixes = ['.kt', '.kts'];
    const direct = tryMatch(asPath, knownPaths, suffixes);
    if (direct) return direct;
    for (const root of ['src/main/kotlin/', 'src/']) {
      const candidate = tryMatch(root + asPath, knownPaths, suffixes);
      if (candidate) return candidate;
    }
    return null;
  },
  isModuleEntryPoint() {
    return false;
  },
};

export const csharp: LanguageStrategy = {
  language: 'csharp',
  extensions: ['.cs'],
  extractImports(content: string): string[] {
    const results: string[] = [];
    const usingRe = /^using\s+([\w.]+)\s*;/gm;
    let m: RegExpExecArray | null;
    while ((m = usingRe.exec(content)) !== null) {
      const ns = m[1];
      if (ns === 'static' || ns.startsWith('static ')) continue;
      if (ns.startsWith('System.') || ns === 'System') continue;
      results.push(ns);
    }
    return results;
  },
  resolveImport(specifier, _fromFileRelPath, knownPaths) {
    const asPath = specifier.replace(/\./g, '/');
    const suffixes = ['.cs'];
    const direct = tryMatch(asPath, knownPaths, suffixes);
    if (direct) return direct;
    return tryMatch('src/' + asPath, knownPaths, suffixes);
  },
  isModuleEntryPoint() {
    return false;
  },
};
