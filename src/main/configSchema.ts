/**
 * configSchema.ts — electron-store JSON schema definition for AppConfig.
 *
 * Extracted from config.ts to keep each file under the 300-line limit.
 */

import { middleSchema } from './configSchemaMiddle';
import { tailSchema } from './configSchemaTail';

export const schema: Record<string, unknown> = {
  recentProjects: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  defaultProjectRoot: {
    type: 'string',
    default: '',
  },
  activeTheme: {
    type: 'string',
    default: 'modern',
  },
  activeFileIconTheme: {
    type: 'string',
    default: '',
  },
  activeProductIconTheme: {
    type: 'string',
    default: '',
  },
  hooksServerPort: {
    type: 'number',
    minimum: 1024,
    maximum: 65535,
    default: 3333,
  },
  terminalFontSize: {
    type: 'number',
    minimum: 8,
    maximum: 32,
    default: 14,
  },
  autoInstallHooks: {
    type: 'boolean',
    default: true,
  },
  shell: {
    type: 'string',
    default: '',
  },
  panelSizes: {
    type: 'object',
    properties: {
      leftSidebar: { type: 'number', default: 260 },
      rightSidebar: { type: 'number', default: 340 },
      terminal: { type: 'number', default: 220 },
    },
    default: {
      leftSidebar: 260,
      rightSidebar: 340,
      terminal: 220,
    },
  },
  windowBounds: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      width: { type: 'number', default: 1280 },
      height: { type: 'number', default: 800 },
      isMaximized: { type: 'boolean', default: false },
    },
    default: {
      width: 1280,
      height: 800,
      isMaximized: false,
    },
  },
  fontUI: {
    type: 'string',
    default: '',
  },
  fontMono: {
    type: 'string',
    default: '',
  },
  fontSizeUI: {
    type: 'number',
    minimum: 11,
    maximum: 18,
    default: 13,
  },
  keybindings: {
    type: 'object',
    default: {},
  },
  showBgGradient: {
    type: 'boolean',
    default: true,
  },
  glassOpacity: {
    type: 'number',
    default: 0,
    minimum: 0,
    maximum: 100,
  },
  customThemeColors: {
    type: 'object',
    default: {},
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
        codexThreadId: { type: 'string' },
      },
    },
    default: [],
  },
  customCSS: {
    type: 'string',
    default: '',
  },
  bookmarks: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  fileTreeIgnorePatterns: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  profiles: {
    type: 'object',
    default: {},
  },
  multiRoots: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  windowSessions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        projectRoots: { type: 'array', items: { type: 'string' }, default: [] },
        bounds: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            isMaximized: { type: 'boolean' },
          },
        },
      },
    },
    default: [],
  },
  customPrompt: {
    type: 'string',
    default: '',
  },
  promptPreset: {
    type: 'string',
    default: 'default',
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
      dangerouslySkipPermissions: { type: 'boolean', default: false },
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
      dangerouslySkipPermissions: false,
    },
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
      dangerouslyBypassApprovalsAndSandbox: { type: 'boolean', default: false },
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
      dangerouslyBypassApprovalsAndSandbox: false,
    },
  },
  notifications: {
    type: 'object',
    properties: {
      level: { type: 'string', default: 'all' },
      alwaysNotify: { type: 'boolean', default: false },
    },
    default: {
      level: 'all',
      alwaysNotify: false,
    },
  },
  ...middleSchema,
  activeLayoutName: {
    type: 'string',
    default: 'Default',
  },
  extensionsEnabled: {
    type: 'boolean',
    default: true,
  },
  disabledExtensions: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  lspEnabled: {
    type: 'boolean',
    default: false,
  },
  inlineCompletionsEnabled: {
    type: 'boolean',
    default: false,
  },
  lspServers: {
    type: 'object',
    default: {},
  },
  claudeAutoLaunch: {
    type: 'boolean',
    default: false,
  },
  approvalRequired: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  approvalTimeout: {
    type: 'number',
    minimum: 0,
    maximum: 300,
    default: 0,
  },
  ...tailSchema,
};
