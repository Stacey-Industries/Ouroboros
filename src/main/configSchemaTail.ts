import {
  AGENT_CHAT_CONTEXT_BEHAVIORS,
  AGENT_CHAT_DEFAULT_VIEWS,
  AGENT_CHAT_PROVIDERS,
  AGENT_CHAT_SETTINGS_DEFAULTS,
  AGENT_CHAT_VERIFICATION_PROFILES,
} from './agentChat/settingsResolver';

export const tailSchema = {
  workspaceSnapshots: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        commitHash: { type: 'string' },
        sessionId: { type: 'string' },
        sessionLabel: { type: 'string' },
        timestamp: { type: 'number' },
        type: { type: 'string' },
        fileCount: { type: 'number' },
      },
    },
    default: [],
  },
  commandBlocksEnabled: {
    type: 'boolean',
    default: true,
  },
  promptPattern: {
    type: 'string',
    default: '',
  },
  terminalCursorStyle: {
    type: 'string',
    enum: ['block', 'underline', 'bar'],
    default: 'block',
  },
  formatOnSave: {
    type: 'boolean',
    default: false,
  },
  contextLayer: {
    type: 'object',
    default: {
      enabled: true,
      maxModules: 50,
      maxSizeBytes: 204800,
      debounceMs: 5000,
      autoSummarize: true,
      moduleDepthLimit: 6,
    },
    properties: {
      enabled: { type: 'boolean', default: true },
      maxModules: { type: 'number', default: 50 },
      maxSizeBytes: { type: 'number', default: 204800 },
      debounceMs: { type: 'number', default: 5000 },
      autoSummarize: { type: 'boolean', default: true },
      moduleDepthLimit: { type: 'number', default: 6 },
    },
  },
  installedVsxExtensions: {
    type: 'array',
    items: { type: 'object' },
    default: [],
  },
  disabledVsxExtensions: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  agentChatSettings: {
    type: 'object',
    additionalProperties: false,
    properties: {
      defaultProvider: {
        type: 'string',
        enum: [...AGENT_CHAT_PROVIDERS],
        default: AGENT_CHAT_SETTINGS_DEFAULTS.defaultProvider,
      },
      defaultVerificationProfile: {
        type: 'string',
        enum: [...AGENT_CHAT_VERIFICATION_PROFILES],
        default: AGENT_CHAT_SETTINGS_DEFAULTS.defaultVerificationProfile,
      },
      contextBehavior: {
        type: 'string',
        enum: [...AGENT_CHAT_CONTEXT_BEHAVIORS],
        default: AGENT_CHAT_SETTINGS_DEFAULTS.contextBehavior,
      },
      showAdvancedControls: {
        type: 'boolean',
        default: AGENT_CHAT_SETTINGS_DEFAULTS.showAdvancedControls,
      },
      openDetailsOnFailure: {
        type: 'boolean',
        default: AGENT_CHAT_SETTINGS_DEFAULTS.openDetailsOnFailure,
      },
      defaultView: {
        type: 'string',
        enum: [...AGENT_CHAT_DEFAULT_VIEWS],
        default: AGENT_CHAT_SETTINGS_DEFAULTS.defaultView,
      },
    },
    default: { ...AGENT_CHAT_SETTINGS_DEFAULTS },
  },
  webAccessPort: {
    type: 'number',
    minimum: 1024,
    maximum: 65535,
    default: 7890,
  },
  webAccessToken: {
    type: 'string',
    default: '',
  },
  webAccessPassword: {
    type: 'string',
    default: '',
  },
  modelProviders: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        models: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              provider: { type: 'string' },
              capabilities: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        enabled: { type: 'boolean' },
        builtIn: { type: 'boolean' },
      },
    },
    default: [],
  },
  modelSlots: {
    type: 'object',
    properties: {
      terminal: { type: 'string', default: '' },
      agentChat: { type: 'string', default: '' },
      claudeMdGeneration: { type: 'string', default: '' },
      inlineCompletion: { type: 'string', default: '' },
    },
    default: {
      terminal: '',
      agentChat: '',
      claudeMdGeneration: '',
      inlineCompletion: '',
    },
  },
  authOnboardingDismissed: {
    type: 'boolean',
    default: false,
  },
  claudeMdSettings: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: false },
      triggerMode: {
        type: 'string',
        enum: ['post-session', 'post-commit', 'manual'],
        default: 'manual',
      },
      model: { type: 'string', enum: ['haiku', 'sonnet', 'opus'], default: 'sonnet' },
      autoCommit: { type: 'boolean', default: false },
      generateRoot: { type: 'boolean', default: true },
      generateSubdirs: { type: 'boolean', default: true },
      excludeDirs: { type: 'array', items: { type: 'string' }, default: [] },
    },
    default: {
      enabled: false,
      triggerMode: 'manual',
      model: 'sonnet',
      autoCommit: false,
      generateRoot: true,
      generateSubdirs: true,
      excludeDirs: [],
    },
  },
  routerSettings: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: true },
      layer1Enabled: { type: 'boolean', default: true },
      layer2Enabled: { type: 'boolean', default: true },
      layer3Enabled: { type: 'boolean', default: true },
      layer2ConfidenceThreshold: { type: 'number', default: 0.6 },
      paranoidMode: { type: 'boolean', default: false },
      /** Fraction of routing decisions sampled for LLM judge scoring (0 = disabled). */
      llmJudgeSampleRate: { type: 'number', minimum: 0, maximum: 1, default: 0 },
    },
    default: {
      enabled: true,
      layer1Enabled: true,
      layer2Enabled: true,
      layer3Enabled: true,
      layer2ConfidenceThreshold: 0.6,
      paranoidMode: false,
      llmJudgeSampleRate: 0,
    },
  },
  routerLastRetrainCount: {
    type: 'number',
    default: 0,
  },
  internalMcpEnabled: {
    type: 'boolean',
    default: true,
  },
  autoCheckpoint: {
    type: 'boolean',
    default: true,
  },
  trustedWorkspaces: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  usePtyHost: {
    type: 'boolean',
    default: false,
  },
  useExtensionHost: {
    type: 'boolean',
    default: false,
  },
  useMcpHost: {
    type: 'boolean',
    default: false,
  },
  /** Wave 6 (#116) — token-by-token streaming for Ctrl+K inline edits. Default off. */
  streamingInlineEdit: {
    type: 'boolean',
    default: false,
  },
  /** Wave 6 (#103) — max concurrent background agent jobs. Default 2. */
  backgroundJobsMaxConcurrent: {
    type: 'number',
    minimum: 1,
    maximum: 10,
    default: 2,
  },
  /** Wave 8 (#115) — persist PTY session descriptors to SQLite for cross-restart restore. Default off. */
  persistTerminalSessions: {
    type: 'boolean',
    default: false,
  },
  /** Wave 14 (Package 4) — codebase graph GC settings */
  codebaseGraph: {
    type: 'object',
    additionalProperties: false,
    properties: {
      gcEnabled: { type: 'boolean', default: true },
      gcDaysThreshold: { type: 'number', minimum: 1, maximum: 3650, default: 90 },
    },
    default: {
      gcEnabled: true,
      gcDaysThreshold: 90,
    },
  },
  /** Phase C — System 2 graph engine feature flag. Default OFF: System 1 runs the show. */
  system2: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: false },
    },
    default: {
      enabled: false,
    },
  },
};
