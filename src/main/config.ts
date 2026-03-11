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
