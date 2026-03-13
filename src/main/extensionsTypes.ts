import vm from 'vm'

export type ActivationEvent =
  | '*'
  | 'onStartup'
  | 'onFileOpen'
  | 'onLanguage'
  | 'onCommand'
  | 'onSessionStart'
  | 'onSessionEnd'
  | 'onTerminalCreate'
  | 'onGitCommit'

export interface ExtensionManifest {
  name: string
  version: string
  description: string
  author: string
  main: string
  permissions: string[]
  activationEvents?: string[]
}

export type ExtensionStatus = 'active' | 'inactive' | 'pending' | 'error'

export interface ExtensionInfo {
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  status: ExtensionStatus
  permissions: string[]
  activationEvents: string[]
  errorMessage?: string
}

export interface LoadedExtension {
  manifest: ExtensionManifest
  dir: string
  enabled: boolean
  status: ExtensionStatus
  errorMessage?: string
  log: string[]
  registeredCommands: Map<string, (...args: unknown[]) => unknown>
  context: vm.Context | null
}

export interface ExtensionActionResult {
  success: boolean
  error?: string
}

export interface ExtensionLogResult extends ExtensionActionResult {
  log?: string[]
}

export const VALID_PERMISSIONS = new Set([
  'files.read',
  'files.write',
  'terminal.write',
  'config.read',
  'config.write',
  'ui.notify',
  'commands.register',
])

export const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.ps1': 'powershell',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.vue': 'vue',
  '.svelte': 'svelte',
}
