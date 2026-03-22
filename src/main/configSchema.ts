/**
 * configSchema.ts — electron-store JSON schema definition for AppConfig.
 *
 * Extracted from config.ts to keep each file under the 300-line limit.
 */

import { tailSchema } from './configSchemaTail'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const schema: any = {
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
  glassOpacity: {
    type: 'number',
    default: 0,
    minimum: 0,
    maximum: 100
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
        title: { type: 'string' },
        isClaude: { type: 'boolean' },
        isCodex: { type: 'boolean' },
        claudeSessionId: { type: 'string' },
        codexThreadId: { type: 'string' }
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
      effort: { type: 'string', default: 'medium' },
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
      effort: 'medium',
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
  codexCliSettings: {
    type: 'object',
    properties: {
      model: { type: 'string', default: '' },
      reasoningEffort: { type: 'string', default: 'medium' },
      sandbox: { type: 'string', default: 'workspace-write' },
      approvalPolicy: { type: 'string', default: 'on-request' },
      profile: { type: 'string', default: '' },
      addDirs: { type: 'array', items: { type: 'string' }, default: [] },
      search: { type: 'boolean', default: false },
      skipGitRepoCheck: { type: 'boolean', default: false },
      dangerouslyBypassApprovalsAndSandbox: { type: 'boolean', default: false }
    },
    default: {
      model: '',
      reasoningEffort: 'medium',
      sandbox: 'workspace-write',
      approvalPolicy: 'on-request',
      profile: '',
      addDirs: [],
      search: false,
      skipGitRepoCheck: false,
      dangerouslyBypassApprovalsAndSandbox: false
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
  },
  claudeAutoLaunch: {
    type: 'boolean',
    default: false
  },
  approvalRequired: {
    type: 'array',
    items: { type: 'string' },
    default: []
  },
  approvalTimeout: {
    type: 'number',
    minimum: 0,
    maximum: 300,
    default: 0
  },
  ...tailSchema
}
