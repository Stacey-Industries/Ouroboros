import Store from 'electron-store'

export interface PanelSizes {
  leftSidebar: number
  rightSidebar: number
  terminal: number
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

export interface TerminalSessionSnapshot {
  cwd: string
  title: string
}

export interface ClaudeCliSettings {
  /** Permission mode: 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' */
  permissionMode: string
  /** Model override: '' means CLI default. e.g. 'sonnet', 'opus', 'haiku', or full model ID */
  model: string
  /** Effort level: '' | 'low' | 'medium' | 'high' | 'max' */
  effort: string
  /** Extra system prompt appended to default */
  appendSystemPrompt: string
  /** Verbose output */
  verbose: boolean
  /** Max budget in USD (0 = unlimited) */
  maxBudgetUsd: number
  /** Allowed tools (comma-separated, empty = all) */
  allowedTools: string
  /** Disallowed tools (comma-separated, empty = none) */
  disallowedTools: string
  /** Additional directories to allow tool access */
  addDirs: string[]
  /** Enable Claude in Chrome integration */
  chrome: boolean
  /** Use git worktree for sessions */
  worktree: boolean
  /** Dangerously skip all permission checks */
  dangerouslySkipPermissions: boolean
}

export interface NotificationSettings {
  /** 'all' | 'errors-only' | 'none' */
  level: string
  /** Whether to notify even when the app is focused */
  alwaysNotify: boolean
}

export interface AgentTemplate {
  id: string
  name: string
  icon?: string
  /** Supports {{projectRoot}}, {{projectName}}, {{openFile}}, {{openFileName}} */
  promptTemplate: string
  /** Optional per-template CLI overrides (merged with global settings) */
  cliOverrides?: Partial<ClaudeCliSettings>
}

export interface WorkspaceLayout {
  name: string
  panelSizes: PanelSizes
  visiblePanels: {
    leftSidebar: boolean
    rightSidebar: boolean
    terminal: boolean
  }
  rightSidebarTab?: string
  builtIn?: boolean
}

export interface AppConfig {
  recentProjects: string[]
  defaultProjectRoot: string
  activeTheme: 'retro' | 'modern' | 'warp' | 'cursor' | 'kiro' | 'custom'
  hooksServerPort: number
  terminalFontSize: number
  autoInstallHooks: boolean
  shell: string
  panelSizes: PanelSizes
  windowBounds: WindowBounds
  fontUI: string
  fontMono: string
  fontSizeUI: number
  keybindings: Record<string, string>
  showBgGradient: boolean
  customThemeColors: Record<string, string>
  terminalSessions: TerminalSessionSnapshot[]
  customCSS: string
  /** Absolute paths pinned to the top of the file tree */
  bookmarks: string[]
  /** Extra ignore patterns (exact names or glob-like prefixes) merged with the hardcoded list */
  fileTreeIgnorePatterns: string[]
  /**
   * Named profiles — each value is a partial config snapshot that can be applied
   * over the current config to switch between saved setups.
   */
  profiles: Record<string, Partial<Omit<AppConfig, 'profiles'>>>
  /** All open project roots for multi-root workspace support */
  multiRoots: string[]
  /** Empty string = use shell default PS1 */
  customPrompt: string
  /** 'default' | 'minimal' | 'powerline' | 'git' | 'custom' */
  promptPreset: string
  /** Claude CLI launch settings */
  claudeCliSettings: ClaudeCliSettings
  /** Desktop notification preferences for agent events */
  notifications: NotificationSettings
  /** Pre-configured Claude Code launch profiles */
  agentTemplates: AgentTemplate[]
  /** Saved workspace layouts (panel arrangements) */
  workspaceLayouts: WorkspaceLayout[]
  /** Name of the currently active workspace layout */
  activeLayoutName: string
  /** Global toggle for the extension system */
  extensionsEnabled: boolean
  /** Names of extensions that have been explicitly disabled */
  disabledExtensions: string[]
  /** Whether LSP integration is enabled */
  lspEnabled: boolean
  /** Custom language server commands keyed by language id (e.g. { "rust": "rust-analyzer" }) */
  lspServers: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema: any = {
  recentProjects: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  defaultProjectRoot: {
    type: 'string',
    default: ''
  },
  activeTheme: {
    type: 'string',
    enum: ['retro', 'modern', 'warp', 'cursor', 'kiro', 'custom'],
    default: 'modern'
  },
  hooksServerPort: {
    type: 'number',
    minimum: 1024,
    maximum: 65535,
    default: 3333
  },
  terminalFontSize: {
    type: 'number',
    minimum: 8,
    maximum: 32,
    default: 14
  },
  autoInstallHooks: {
    type: 'boolean',
    default: true
  },
  shell: {
    type: 'string',
    default: ''
  },
  panelSizes: {
    type: 'object',
    properties: {
      leftSidebar: { type: 'number', default: 260 },
      rightSidebar: { type: 'number', default: 340 },
      terminal: { type: 'number', default: 220 }
    },
    default: {
      leftSidebar: 260,
      rightSidebar: 340,
      terminal: 220
    }
  },
  windowBounds: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number', default: 1280 },
      height: { type: 'number', default: 800 },
      isMaximized: { type: 'boolean', default: false }
    },
    default: {
      width: 1280,
      height: 800,
      isMaximized: false
    }
  },
  fontUI: {
    type: 'string',
    default: ''
  },
  fontMono: {
    type: 'string',
    default: ''
  },
  fontSizeUI: {
    type: 'number',
    minimum: 11,
    maximum: 18,
    default: 13
  },
  keybindings: {
    type: 'object',
    default: {}
  },
  showBgGradient: {
    type: 'boolean',
    default: true
  },
  customThemeColors: {
    type: 'object',
    default: {}
  },
  terminalSessions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        cwd: { type: 'string' },
        title: { type: 'string' }
      }
    },
    default: []
  },
  customCSS: {
    type: 'string',
    default: ''
  },
  bookmarks: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  fileTreeIgnorePatterns: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  profiles: {
    type: 'object',
    default: {}
  },
  multiRoots: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  customPrompt: {
    type: 'string',
    default: ''
  },
  promptPreset: {
    type: 'string',
    default: 'default'
  },
  claudeCliSettings: {
    type: 'object',
    properties: {
      permissionMode: { type: 'string', default: 'default' },
      model: { type: 'string', default: '' },
      effort: { type: 'string', default: '' },
      appendSystemPrompt: { type: 'string', default: '' },
      verbose: { type: 'boolean', default: false },
      maxBudgetUsd: { type: 'number', default: 0 },
      allowedTools: { type: 'string', default: '' },
      disallowedTools: { type: 'string', default: '' },
      addDirs: { type: 'array', items: { type: 'string' }, default: [] },
      chrome: { type: 'boolean', default: false },
      worktree: { type: 'boolean', default: false },
      dangerouslySkipPermissions: { type: 'boolean', default: false }
    },
    default: {
      permissionMode: 'default',
      model: '',
      effort: '',
      appendSystemPrompt: '',
      verbose: false,
      maxBudgetUsd: 0,
      allowedTools: '',
      disallowedTools: '',
      addDirs: [],
      chrome: false,
      worktree: false,
      dangerouslySkipPermissions: false
    }
  },
  notifications: {
    type: 'object',
    properties: {
      level: { type: 'string', default: 'all' },
      alwaysNotify: { type: 'boolean', default: false }
    },
    default: {
      level: 'all',
      alwaysNotify: false
    }
  },
  agentTemplates: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        icon: { type: 'string' },
        promptTemplate: { type: 'string' },
        cliOverrides: { type: 'object' }
      }
    },
    default: [
      { id: 'builtin:review-pr', name: 'Review PR', icon: '\ud83d\udd0d', promptTemplate: 'Review the current PR for bugs, logic errors, and improvements. Show a summary of findings.' },
      { id: 'builtin:write-tests', name: 'Write Tests', icon: '\u2705', promptTemplate: 'Write comprehensive tests for {{openFile}}. Cover edge cases and error paths.' },
      { id: 'builtin:explain', name: 'Explain Codebase', icon: '\ud83d\udcda', promptTemplate: 'Give me a high-level overview of this codebase — architecture, key patterns, and how the main components fit together.' },
      { id: 'builtin:refactor', name: 'Refactor File', icon: '\u2728', promptTemplate: 'Refactor {{openFile}} to improve readability, performance, and maintainability. Explain what you changed and why.' },
      { id: 'builtin:fix-build', name: 'Fix Build', icon: '\ud83d\udee0\ufe0f', promptTemplate: 'Run the build, identify any errors, and fix them. Show me what you changed.' }
    ]
  },
  workspaceLayouts: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        panelSizes: {
          type: 'object',
          properties: {
            leftSidebar: { type: 'number' },
            rightSidebar: { type: 'number' },
            terminal: { type: 'number' }
          }
        },
        visiblePanels: {
          type: 'object',
          properties: {
            leftSidebar: { type: 'boolean' },
            rightSidebar: { type: 'boolean' },
            terminal: { type: 'boolean' }
          }
        },
        rightSidebarTab: { type: 'string' },
        builtIn: { type: 'boolean' }
      }
    },
    default: [
      {
        name: 'Default',
        panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 250 },
        visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
        builtIn: true
      },
      {
        name: 'Monitoring',
        panelSizes: { leftSidebar: 0, rightSidebar: 400, terminal: 250 },
        visiblePanels: { leftSidebar: false, rightSidebar: true, terminal: true },
        builtIn: true
      },
      {
        name: 'Review',
        panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 0 },
        visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: false },
        builtIn: true
      }
    ]
  },
  activeLayoutName: {
    type: 'string',
    default: 'Default'
  },
  extensionsEnabled: {
    type: 'boolean',
    default: true
  },
  disabledExtensions: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  lspEnabled: {
    type: 'boolean',
    default: false
  },
  lspServers: {
    type: 'object',
    default: {}
  }
}

export const store = new Store<AppConfig>({ schema })

export function getConfig(): AppConfig {
  return store.store
}

export function getConfigValue<K extends keyof AppConfig>(key: K): AppConfig[K] {
  return store.get(key)
}

export function setConfigValue<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
  store.set(key, value)
}

export function addRecentProject(projectPath: string): void {
  const recent = store.get('recentProjects') as string[]
  const filtered = recent.filter((p) => p !== projectPath)
  const updated = [projectPath, ...filtered].slice(0, 10)
  store.set('recentProjects', updated)
}
