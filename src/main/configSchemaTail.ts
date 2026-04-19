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
  /** Wave 6 (#103) — max concurrent background agent jobs. Default 2. */
  backgroundJobsMaxConcurrent: {
    type: 'number',
    minimum: 1,
    maximum: 10,
    default: 2,
  },
  /** Wave 8 (#115) — persist PTY session descriptors to SQLite for cross-restart restore. Default off. */
  persistTerminalSessions: { type: 'boolean', default: false },
  /** Wave 14 (Package 4) — codebase graph GC settings */
  codebaseGraph: { type: 'object', additionalProperties: false, properties: { gcEnabled: { type: 'boolean', default: true }, gcDaysThreshold: { type: 'number', minimum: 1, maximum: 3650, default: 90 } }, default: { gcEnabled: true, gcDaysThreshold: 90 } },
  /** Wave 15 — structured telemetry feature flag and retention policy */
  telemetry: { type: 'object', properties: { structured: { type: 'boolean', default: false }, retentionDays: { type: 'number', default: 30 } } },
  /** Wave 16 — persisted Session records (loose schema; TS interface enforces shape) */
  sessionsData: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 16 — session feature flags */
  sessions: { type: 'object', properties: { worktreePerSession: { type: 'boolean', default: false } }, default: { worktreePerSession: false } },
  /** Wave 17/20 — layout preset engine + chat-primary. Wave 28 — dragAndDrop, customLayouts. Wave 32 — mobilePrimary. */
  layout: { type: 'object', properties: { presets: { type: 'object', properties: { v2: { type: 'boolean', default: true } }, default: { v2: true } }, chatPrimary: { type: 'boolean', default: true }, dragAndDrop: { type: 'boolean', default: true }, customLayoutsPerSession: { type: 'object', additionalProperties: true, default: {} }, customLayoutsMru: { type: 'array', items: { type: 'string' }, default: [] }, globalCustomPresets: { type: 'array', items: { type: 'object' }, default: [] }, /** Wave 32 Phase A — enable mobile-primary layout when viewport < 768px. Default false (soak gate). */ mobilePrimary: { type: 'boolean', default: false } }, default: { presets: { v2: true }, chatPrimary: true, dragAndDrop: true, customLayoutsPerSession: {}, customLayoutsMru: [], globalCustomPresets: [], mobilePrimary: false } },
  /** Wave 18 — edit provenance tracking feature flag */
  provenanceTracking: { type: 'boolean', default: true },
  /** Wave 21 Phase D — user-created session folders */
  sessionFolders: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 22 Phase B/E — chat message density + desktop notifications (Phase E)
   *  Wave 23 Phase A — sideChats + branchingPolish feature flags */
  chat: { type: 'object', additionalProperties: false, default: { density: 'comfortable', desktopNotifications: true, sideChats: true, branchingPolish: true }, properties: { density: { type: 'string', enum: ['comfortable', 'compact'], default: 'comfortable' }, desktopNotifications: { type: 'boolean', default: true }, sideChats: { type: 'boolean', default: true }, branchingPolish: { type: 'boolean', default: true } } },
  /** Wave 25 Phase E — workspace read-list: project root → file paths auto-pinned at session open */
  workspaceReadLists: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, default: {} },
  /** Wave 26 Phase A — user profiles (built-ins are merged at read time, never stored) */
  profiles: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 26 Phase A — per-project default profile: projectRoot → profileId */
  workspaceProfileDefaults: { type: 'object', additionalProperties: { type: 'string' }, default: {} },
  /** Wave 26 Phase E — persisted approval memory (allow/deny patterns) */
  approvalMemory: { type: 'object', properties: { alwaysAllow: { type: 'array', items: { type: 'object' }, default: [] }, alwaysDeny: { type: 'array', items: { type: 'object' }, default: [] } }, default: { alwaysAllow: [], alwaysDeny: [] } },
  /** Wave 27 — subagent UX feature flags */
  agentic: { type: 'object', additionalProperties: false, properties: { subagentUx: { type: 'boolean', default: true } }, default: { subagentUx: true } },
  /** Wave 29 Phase A — diff review enhanced UX (keyboard shortcuts + rollback) */
  review: { type: 'object', additionalProperties: false, properties: { enhanced: { type: 'boolean', default: true } }, default: { enhanced: true } },
  /** Wave 33a Phase A+B — mobile client pairing + device registry. Default off.
   *  Phase E adds resumeTtlSec: TTL in seconds for orphaned resumable in-flight calls.
   *  Wave 34 Phase F adds pushToken + pushPlatform per device (server-side only, never sent to renderer). */
  mobileAccess: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean', default: false }, pairedDevices: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, refreshTokenHash: { type: 'string' }, fingerprint: { type: 'string' }, capabilities: { type: 'array', items: { type: 'string' } }, issuedAt: { type: 'string' }, lastSeenAt: { type: 'string' }, pushToken: { type: 'string' }, pushPlatform: { type: 'string', enum: ['android', 'ios'] } } }, default: [] }, desktopFingerprint: { type: 'string' }, resumeTtlSec: { type: 'number', minimum: 30, maximum: 3600, default: 300 } }, default: { enabled: false, pairedDevices: [], resumeTtlSec: 300 } },
  /** Wave 34 Phase A — cross-device session dispatch queue + settings. Default off.
   *  Phase F adds optional fcmServiceAccountPath for push delivery. */
  sessionDispatch: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean', default: false }, maxConcurrent: { type: 'integer', minimum: 1, maximum: 3, default: 1 }, jobTimeoutMs: { type: 'integer', minimum: 0, default: 1_800_000 }, queue: { type: 'array', items: { type: 'object' }, default: [] }, fcmServiceAccountPath: { type: 'string', default: '' } }, default: { enabled: false, maxConcurrent: 1, jobTimeoutMs: 1_800_000, queue: [], fcmServiceAccountPath: '' } },
  /** Wave 19 — context scoring flags; Wave 24 adds decisionLogging + rerankerEnabled */
  context: {
    type: 'object', additionalProperties: false,
    properties: {
      provenanceWeights: { type: 'boolean', default: true },
      pagerank: { type: 'boolean', default: true },
      pagerankSeeds: {
        type: 'object',
        additionalProperties: false,
        properties: { pinned: { type: 'number', default: 0.5 }, symbol: { type: 'number', default: 0.3 }, user_edit: { type: 'number', default: 0.2 } },
        default: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
      },
      decisionLogging: { type: 'boolean', default: true }, // Wave 24 Phase A
      rerankerEnabled: { type: 'boolean', default: false }, // Wave 24 Phase C — off by default; Claude CLI cold-start ~1-3s exceeds the 500ms target. Opt-in via config.
      /** Wave 31 Phase E — lean packet mode: drop project_structure, cap relevant_code to 6 files. */
      packetMode: { type: 'string', enum: ['full', 'lean'], default: 'full' },
      /** Wave 31 Phase D — learned ranker: use classifier score for top-N. Default false (shadow mode only). */
      learnedRanker: { type: 'boolean', default: false },
    },
    default: { provenanceWeights: true, pagerank: true, pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 }, decisionLogging: true, rerankerEnabled: false, packetMode: 'full', learnedRanker: false },
  },
  /** Wave 35 Phase A — per-user theming overrides (accent, verbs, fonts, custom tokens). Applied after theme bootstrap. */
  theming: { type: 'object', additionalProperties: false, properties: { accentOverride: { type: 'string' }, verbOverride: { type: 'string' }, thinkingVerbs: { type: 'array', items: { type: 'string' } }, spinnerChars: { type: 'string' }, fonts: { type: 'object', properties: { editor: { type: 'string' }, chat: { type: 'string' }, terminal: { type: 'string' } }, default: {} }, customTokens: { type: 'object', additionalProperties: { type: 'string' }, default: {} } }, default: {} },
  /** Wave 36 Phase A — non-Claude session providers. Default false. */ providers: { type: 'object', additionalProperties: false, properties: { multiProvider: { type: 'boolean', default: false } }, default: { multiProvider: false } },
  /** Wave 37 Phase B — ecosystem moat: prompt-diff snapshot. Wave 37 Phase C — lastExport metadata. Wave 37 Phase D — systemPrompt from marketplace bundle install.
   *  Wave 41 Phase C — rulesAndSkillsInstallEnabled feature flag (default false — stub not yet wired). */
  ecosystem: { type: 'object', additionalProperties: false, properties: { lastSeenSnapshot: { type: 'object', properties: { cliVersion: { type: 'string' }, capturedAt: { type: 'number' }, promptHash: { type: 'string' }, promptText: { type: 'string' } } }, lastExport: { type: 'object', properties: { path: { type: 'string' }, at: { type: 'number' }, rows: { type: 'number' } } }, systemPrompt: { type: 'string', default: '' }, /** Wave 41 Phase C — explicit feature gate for rules-and-skills install path. Default false until wired. */ rulesAndSkillsInstallEnabled: { type: 'boolean', default: false } }, default: {} },
  /** Wave 41 Phase C — marketplace behaviour flags. */
  marketplace: { type: 'object', additionalProperties: false, properties: { /** Allow install to proceed even when the revocation list cannot be fetched (e.g. offline). Default false (fail-closed). */ allowInstallOnRevocationFetchFailure: { type: 'boolean', default: false } }, default: { allowInstallOnRevocationFetchFailure: false } },
  /** Wave 38 Phase A+C — platform-level settings: onboarding gate, language, update channel, crash reporter, changelog gate.
   *  Phase C adds dismissedEmptyStates for persistent "don't show again" dismiss.
   *  Wave 41 Phase K adds crashReports.allowInsecure (default false) to allow http: webhook URLs in debug scenarios. */
  platform: { type: 'object', additionalProperties: false, properties: { onboarding: { type: 'object', properties: { completed: { type: 'boolean', default: false } }, default: {} }, language: { type: 'string', enum: ['en', 'es'], default: 'en' }, updateChannel: { type: 'string', enum: ['stable', 'beta'], default: 'stable' }, crashReports: { type: 'object', properties: { enabled: { type: 'boolean', default: false }, webhookUrl: { type: 'string', default: '' }, /** Wave 41 Phase K — permit http: webhook URLs (debug only; default false). */ allowInsecure: { type: 'boolean', default: false } }, default: { enabled: false, allowInsecure: false } }, lastSeenVersion: { type: 'string', default: '' }, /** Wave 38 Phase C — persistent dismissed empty-state keys. */ dismissedEmptyStates: { type: 'object', additionalProperties: { type: 'boolean' }, default: {} } }, default: {} },
};
