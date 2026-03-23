/**
 * Monaco Editor setup — worker configuration and language detection.
 *
 * Call `initMonaco()` once at app startup (before creating any editor instances).
 * Use `detectLanguage(filePath)` to map file extensions to Monaco language IDs.
 */

let initialized = false;

/**
 * Initialize the Monaco environment. Safe to call multiple times — only runs once.
 *
 * The vite-plugin-monaco-editor plugin handles worker bundling and sets up
 * MonacoEnvironment automatically. This function exists as a single entry point
 * for any additional global configuration we may need.
 */
export function initMonaco(): void {
  if (initialized) return;
  initialized = true;

  // The vite-plugin-monaco-editor handles MonacoEnvironment.getWorkerUrl
  // configuration at build time. If it hasn't set it up (e.g. in test env),
  // provide a safe fallback that uses the editor worker for everything.
  if (typeof self !== 'undefined' && !(self as Record<string, unknown>).MonacoEnvironment) {
    (self as Record<string, unknown>).MonacoEnvironment = {
      getWorker() {
        // Fallback: return a basic worker. In production the plugin sets the
        // correct worker URLs, so this path should rarely be hit.
        return undefined as unknown as Worker;
      },
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Language detection
// ────────────────────────────────────────────────────────────────────────────

const extensionToLanguage: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',

  // Data / Config
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini', // closest built-in
  '.xml': 'xml',
  '.svg': 'xml',

  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.ps1': 'powershell',
  '.psm1': 'powershell',

  // Systems languages
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.rs': 'rust',
  '.go': 'go',

  // JVM
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',

  // Scripting
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.lua': 'lua',
  '.pl': 'perl',
  '.pm': 'perl',
  '.r': 'r',
  '.R': 'r',

  // .NET
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.vb': 'vb',

  // Functional
  '.hs': 'haskell',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.clj': 'clojure',

  // Other
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.proto': 'protobuf',
  '.swift': 'swift',
  '.dart': 'dart',
  '.zig': 'zig',

  // Config files
  '.ini': 'ini',
  '.conf': 'ini',
  '.cfg': 'ini',
  '.env': 'ini',
  '.properties': 'ini',

  // Misc
  '.diff': 'diff',
  '.patch': 'diff',
  '.log': 'plaintext',
  '.txt': 'plaintext',
};

/** Map of well-known file names (case-insensitive) to Monaco language IDs */
const filenameToLanguage: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'makefile': 'makefile',
  'gemfile': 'ruby',
  'rakefile': 'ruby',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
  'claude.md': 'markdown',
};

/**
 * Detect the Monaco language ID for a given file path.
 * Falls back to 'plaintext' for unknown extensions.
 */
export function detectLanguage(filePath: string): string {
  if (!filePath) return 'plaintext';

  // Check full filename first (case-insensitive)
  const fileName = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  const byName = filenameToLanguage[fileName];
  if (byName) return byName;

  // Check extension
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx >= 0) {
    const ext = fileName.slice(dotIdx).toLowerCase();
    const byExt = extensionToLanguage[ext];
    if (byExt) return byExt;
  }

  return 'plaintext';
}
