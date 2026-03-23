/**
 * treeSitterLoader.ts — Lazy initialization of web-tree-sitter + grammar loading.
 *
 * web-tree-sitter requires a WASM binary for the core runtime (`tree-sitter.wasm`)
 * and one WASM binary per language grammar. This module handles both.
 *
 * Uses web-tree-sitter@0.22.x API where Parser is the default export and
 * Parser.Language is a nested namespace (not a separate named export).
 */

import path from 'path';
import Parser from 'web-tree-sitter';

import log from '../logger';

// Track initialization state
let parserReady = false;
let initPromise: Promise<void> | null = null;

// Cache loaded language grammars: grammar name → Parser.Language
const languageCache = new Map<string, Parser.Language>();

// Pending loads to prevent double-loading the same grammar concurrently
const pendingLanguageLoads = new Map<string, Promise<Parser.Language>>();

// Map file extensions to tree-sitter-wasms grammar file names
const EXT_TO_GRAMMAR: Record<string, string> = {
  '.ts': 'tree-sitter-typescript',
  '.tsx': 'tree-sitter-tsx',
  '.js': 'tree-sitter-javascript',
  '.jsx': 'tree-sitter-javascript',
  '.mjs': 'tree-sitter-javascript',
  '.cjs': 'tree-sitter-javascript',
  '.mts': 'tree-sitter-typescript',
  '.cts': 'tree-sitter-typescript',
  '.py': 'tree-sitter-python',
  '.go': 'tree-sitter-go',
  '.rs': 'tree-sitter-rust',
  '.java': 'tree-sitter-java',
  '.c': 'tree-sitter-c',
  '.cpp': 'tree-sitter-cpp',
  '.cc': 'tree-sitter-cpp',
  '.cxx': 'tree-sitter-cpp',
  '.h': 'tree-sitter-c',
  '.hpp': 'tree-sitter-cpp',
  '.hxx': 'tree-sitter-cpp',
  '.css': 'tree-sitter-css',
  '.json': 'tree-sitter-json',
  '.yaml': 'tree-sitter-yaml',
  '.yml': 'tree-sitter-yaml',
  '.toml': 'tree-sitter-toml',
  '.rb': 'tree-sitter-ruby',
  '.php': 'tree-sitter-php',
  '.swift': 'tree-sitter-swift',
  '.kt': 'tree-sitter-kotlin',
  '.cs': 'tree-sitter-c_sharp',
  '.sh': 'tree-sitter-bash',
  '.bash': 'tree-sitter-bash',
  '.zsh': 'tree-sitter-bash',
  '.html': 'tree-sitter-html',
  '.sql': 'tree-sitter-sql',
  '.lua': 'tree-sitter-lua',
  '.dart': 'tree-sitter-dart',
  '.ex': 'tree-sitter-elixir',
  '.exs': 'tree-sitter-elixir',
  '.zig': 'tree-sitter-zig',
  '.elm': 'tree-sitter-elm',
};

/**
 * Resolve the filesystem path to a grammar WASM file.
 * tree-sitter-wasms stores them at: node_modules/tree-sitter-wasms/out/<name>.wasm
 */
function getGrammarWasmPath(grammarName: string): string {
  const wasmDir = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out');
  return path.join(wasmDir, `${grammarName}.wasm`);
}

/**
 * Initialize the tree-sitter WASM runtime.
 * Must be called once before any parsing. Safe to call multiple times (idempotent).
 */
export async function initTreeSitter(): Promise<void> {
  if (parserReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // web-tree-sitter@0.22.x: the wasm file is 'tree-sitter.wasm' (not 'web-tree-sitter.wasm')
    const treeSitterDir = path.dirname(require.resolve('web-tree-sitter'));
    const treeSitterWasmPath = path.join(treeSitterDir, 'tree-sitter.wasm');

    await Parser.init({
      locateFile: () => treeSitterWasmPath,
    });
    parserReady = true;
  })();

  try {
    await initPromise;
  } catch (err) {
    // Reset so a subsequent call can retry instead of being stuck on a rejected promise
    initPromise = null;
    parserReady = false;
    throw err;
  }
}

/**
 * Load a grammar by name, with dedup for concurrent calls.
 */
async function loadLanguage(grammarName: string): Promise<Parser.Language> {
  const cached = languageCache.get(grammarName);
  if (cached) return cached;

  // Dedup concurrent loads for the same grammar
  const pending = pendingLanguageLoads.get(grammarName);
  if (pending) return pending;

  const promise = (async () => {
    const wasmPath = getGrammarWasmPath(grammarName);
    const language = await Parser.Language.load(wasmPath);
    languageCache.set(grammarName, language);
    pendingLanguageLoads.delete(grammarName);
    return language;
  })();

  pendingLanguageLoads.set(grammarName, promise);

  try {
    return await promise;
  } catch (err) {
    pendingLanguageLoads.delete(grammarName);
    throw err;
  }
}

/**
 * Get the grammar name for a file extension, or null if unsupported.
 */
export function getGrammarForExtension(ext: string): string | null {
  // eslint-disable-next-line security/detect-object-injection
  return EXT_TO_GRAMMAR[ext] ?? null;
}

/**
 * Get a Parser.Language for the given file extension.
 * Returns null if the extension is not supported or the grammar fails to load.
 */
export async function getLanguageForExtension(ext: string): Promise<Parser.Language | null> {
  // eslint-disable-next-line security/detect-object-injection
  const grammarName = EXT_TO_GRAMMAR[ext];
  if (!grammarName) return null;

  try {
    await initTreeSitter();
    return await loadLanguage(grammarName);
  } catch (err) {
    log.warn(`Failed to load grammar for ${ext}:`, err);
    return null;
  }
}

/**
 * Create a new Parser instance configured for the given file's extension.
 * Returns null if the language is not supported.
 */
export async function createParserForFile(filePath: string): Promise<Parser | null> {
  const ext = path.extname(filePath).toLowerCase();
  const language = await getLanguageForExtension(ext);
  if (!language) return null;

  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/**
 * Returns the set of file extensions that have grammar support.
 */
export function getSupportedExtensions(): Set<string> {
  return new Set(Object.keys(EXT_TO_GRAMMAR));
}
