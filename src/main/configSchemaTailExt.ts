/**
 * configSchemaTailExt.ts — Second half of tailSchema, split from configSchemaTail.ts
 * to keep both files under the ESLint max-lines limit.
 *
 * Merged back into tailSchema via object spread in configSchemaTail.ts.
 */

import { tailSchemaExt2 } from './configSchemaTailExt2';

export const tailSchemaExt = {
  /** Wave 17 — layout preset engine. Wave 28 — dragAndDrop, customLayouts. Wave 32 — mobilePrimary.
   *  Wave 42 — immersiveChat. Wave 43 — chatPrimary retired. Wave 44 — chatSidebarMode.
   *  Wave 59 Phase A — chatWorkbench retired; workbench IS the chat shell. */
  layout: {
    type: 'object',
    properties: {
      presets: {
        type: 'object',
        properties: { v2: { type: 'boolean', default: true } },
        default: { v2: true },
      },
      dragAndDrop: { type: 'boolean', default: true },
      customLayoutsPerSession: { type: 'object', additionalProperties: true, default: {} },
      customLayoutsMru: { type: 'array', items: { type: 'string' }, default: [] },
      globalCustomPresets: { type: 'array', items: { type: 'object' }, default: [] },
      mobilePrimary: { type: 'boolean', default: false },
      immersiveChat: { type: 'boolean', default: false },
      chatSidebarMode: {
        type: 'string',
        enum: ['pinned', 'collapsed', 'hidden'],
        default: 'pinned',
      },
    },
    default: {
      presets: { v2: true },
      dragAndDrop: true,
      customLayoutsPerSession: {},
      customLayoutsMru: [],
      globalCustomPresets: [],
      mobilePrimary: false,
      immersiveChat: false,
      chatSidebarMode: 'pinned',
    },
  },
  /** Wave 18 — edit provenance tracking feature flag */
  provenanceTracking: { type: 'boolean', default: true },
  /** Wave 21 Phase D — user-created session folders */
  sessionFolders: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 22 Phase B/E — chat message density + desktop notifications.
   *  Wave 23 Phase A — sideChats + branchingPolish feature flags. */
  chat: {
    type: 'object',
    additionalProperties: false,
    default: {
      density: 'comfortable',
      desktopNotifications: true,
      sideChats: true,
      branchingPolish: true,
    },
    properties: {
      density: { type: 'string', enum: ['comfortable', 'compact'], default: 'comfortable' },
      desktopNotifications: { type: 'boolean', default: true },
      sideChats: { type: 'boolean', default: true },
      branchingPolish: { type: 'boolean', default: true },
    },
  },
  /** Wave 25 Phase E — workspace read-list: project root → file paths auto-pinned at session open */
  workspaceReadLists: {
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    default: {},
  },
  /** Wave 26 Phase A — user profiles (built-ins are merged at read time, never stored) */
  profiles: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 26 Phase A — per-project default profile: projectRoot → profileId */
  workspaceProfileDefaults: {
    type: 'object',
    additionalProperties: { type: 'string' },
    default: {},
  },
  /** Wave 26 Phase E — persisted approval memory (allow/deny patterns) */
  approvalMemory: {
    type: 'object',
    properties: {
      alwaysAllow: { type: 'array', items: { type: 'object' }, default: [] },
      alwaysDeny: { type: 'array', items: { type: 'object' }, default: [] },
    },
    default: { alwaysAllow: [], alwaysDeny: [] },
  },
  /** Wave 27 — subagent UX feature flags */
  agentic: {
    type: 'object',
    additionalProperties: false,
    properties: { subagentUx: { type: 'boolean', default: true } },
    default: { subagentUx: true },
  },
  /** Wave 29 Phase A — diff review enhanced UX (keyboard shortcuts + rollback) */
  review: {
    type: 'object',
    additionalProperties: false,
    properties: { enhanced: { type: 'boolean', default: true } },
    default: { enhanced: true },
  },
  /** Wave 33a Phase A+B — mobile client pairing + device registry. Default off.
   *  Phase E adds resumeTtlSec: TTL in seconds for orphaned resumable in-flight calls.
   *  Wave 34 Phase F adds pushToken + pushPlatform per device (server-side only, never sent to renderer). */
  mobileAccess: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: false },
      pairedDevices: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            refreshTokenHash: { type: 'string' },
            fingerprint: { type: 'string' },
            capabilities: { type: 'array', items: { type: 'string' } },
            issuedAt: { type: 'string' },
            lastSeenAt: { type: 'string' },
            pushToken: { type: 'string' },
            pushPlatform: { type: 'string', enum: ['android', 'ios'] },
          },
        },
        default: [],
      },
      desktopFingerprint: { type: 'string' },
      resumeTtlSec: { type: 'number', minimum: 30, maximum: 3600, default: 300 },
    },
    default: { enabled: false, pairedDevices: [], resumeTtlSec: 300 },
  },
  /** Wave 34 Phase A — cross-device session dispatch queue + settings. Default off.
   *  Phase F adds optional fcmServiceAccountPath for push delivery. */
  sessionDispatch: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: false },
      maxConcurrent: { type: 'integer', minimum: 1, maximum: 3, default: 1 },
      jobTimeoutMs: { type: 'integer', minimum: 0, default: 1_800_000 },
      queue: { type: 'array', items: { type: 'object' }, default: [] },
      fcmServiceAccountPath: { type: 'string', default: '' },
    },
    default: {
      enabled: false,
      maxConcurrent: 1,
      jobTimeoutMs: 1_800_000,
      queue: [],
      fcmServiceAccountPath: '',
    },
  },
  /** Wave 19 — context scoring flags; Wave 24 adds decisionLogging + rerankerEnabled */
  context: {
    type: 'object',
    additionalProperties: false,
    properties: {
      provenanceWeights: { type: 'boolean', default: true },
      pagerank: { type: 'boolean', default: true },
      pagerankSeeds: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pinned: { type: 'number', default: 0.5 },
          symbol: { type: 'number', default: 0.3 },
          user_edit: { type: 'number', default: 0.2 },
        },
        default: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
      },
      decisionLogging: { type: 'boolean', default: true }, // Wave 24 Phase A
      rerankerEnabled: { type: 'boolean', default: false }, // Wave 24 Phase C — off by default
      /** Wave 31 Phase E — lean packet mode: drop project_structure, cap relevant_code to 6 files. */
      packetMode: { type: 'string', enum: ['full', 'lean', 'auto'], default: 'auto' },
      /** Wave 31 Phase D — learned ranker: use classifier score for top-N. Default false. */
      learnedRanker: { type: 'boolean', default: false },
    },
    default: {
      provenanceWeights: true,
      pagerank: true,
      pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
      decisionLogging: true,
      rerankerEnabled: false,
      packetMode: 'auto',
      learnedRanker: false,
    },
  },
  /** Wave 35 Phase A — per-user theming overrides (accent, verbs, fonts, custom tokens). */
  theming: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accentOverride: { type: 'string' },
      verbOverride: { type: 'string' },
      thinkingVerbs: { type: 'array', items: { type: 'string' } },
      spinnerChars: { type: 'string' },
      fonts: {
        type: 'object',
        properties: {
          editor: { type: 'string' },
          chat: { type: 'string' },
          terminal: { type: 'string' },
        },
        default: {},
      },
      customTokens: { type: 'object', additionalProperties: { type: 'string' }, default: {} },
    },
    default: {},
  },
  /** Wave 36 Phase A — non-Claude session providers. Default false. */
  providers: {
    type: 'object',
    additionalProperties: false,
    properties: { multiProvider: { type: 'boolean', default: false } },
    default: { multiProvider: false },
  },
  /** Wave 37 Phase B — ecosystem moat: prompt-diff snapshot. Wave 37 Phase C — lastExport metadata.
   *  Wave 37 Phase D — systemPrompt from marketplace bundle install.
   *  Wave 41 Phase C — rulesAndSkillsInstallEnabled feature flag.
   *  Wave 45 Phase A — codexAppServerTransport gate. */
  ecosystem: {
    type: 'object',
    additionalProperties: false,
    properties: {
      lastSeenSnapshot: {
        type: 'object',
        properties: {
          cliVersion: { type: 'string' },
          capturedAt: { type: 'number' },
          promptHash: { type: 'string' },
          promptText: { type: 'string' },
        },
      },
      lastExport: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          at: { type: 'number' },
          rows: { type: 'number' },
        },
      },
      systemPrompt: { type: 'string', default: '' },
      /** Wave 41 Phase C — explicit feature gate for rules-and-skills install path. Default false until wired. */
      rulesAndSkillsInstallEnabled: { type: 'boolean', default: false },
      /** Wave 45 Phase A — Codex app-server transport is the primary chat path. */
      codexAppServerTransport: { type: 'boolean', default: true },
    },
    default: {},
  },
  /** Wave 41 Phase C — marketplace behaviour flags. */
  marketplace: {
    type: 'object',
    additionalProperties: false,
    properties: {
      /** Allow install to proceed even when the revocation list cannot be fetched. Default false (fail-closed). */
      allowInstallOnRevocationFetchFailure: { type: 'boolean', default: false },
    },
    default: { allowInstallOnRevocationFetchFailure: false },
  },
  /** Wave 50 Phase B — deterministic PreToolUse enforcement. enforcedRules lists active rule names.
   *  Wave 50 Phase D — enforceGraphFirst reserved for future graph-routing enforcement (default false;
   *  Phase D analysis returned 93.9% adherence → stay log-only; activate if re-run drops below 70%). */
  hooks: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enforcedRules: {
        type: 'array',
        items: { type: 'string' },
        default: ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'],
      },
      enforceGraphFirst: { type: 'boolean', default: false },
    },
    default: {
      enforcedRules: ['no-secrets', 'lockfiles', 'no-minified', 'test-scope'],
      enforceGraphFirst: false,
    },
  },
  /** Wave 53b Phase B — online ranker hit-rate telemetry.
   *  Phase C adds contextRanker.mode for variant ranker selection (default 'current'). */
  contextRanker: {
    type: 'object',
    additionalProperties: false,
    properties: {
      telemetryEnabled: { type: 'boolean', default: true },
      mode: {
        type: 'string',
        enum: ['current', 'tuned', 'experimental'],
        default: 'current',
      },
    },
    default: { telemetryEnabled: true, mode: 'current' },
  },
  /** Wave 51 Phase B — internalMcp transport selector. Default 'sse' preserves
   *  existing behavior; 'stdio' opts into the JSON-RPC subprocess wrapper. */
  internalMcp: {
    type: 'object',
    additionalProperties: false,
    properties: {
      transport: { type: 'string', enum: ['sse', 'stdio'], default: 'sse' },
    },
    default: { transport: 'sse' },
  },
  /** Wave 51 Phase B + Wave 53l Phase B. routeInternalMcp deprecated in
   *  53l (back-compat only); excludeFromMultiplex is the per-server opt-out. */
  codemode: {
    type: 'object',
    additionalProperties: false,
    properties: {
      enabled: { type: 'boolean', default: false },
      routeInternalMcp: { type: 'boolean', default: false },
      excludeFromMultiplex: { type: 'array', items: { type: 'string' }, default: [] },
    },
    default: { enabled: false, routeInternalMcp: false, excludeFromMultiplex: [] },
  },
  /** Wave 38 Phase A+C — platform-level settings: onboarding gate, language, update channel, crash reporter.
   *  Phase C adds dismissedEmptyStates.
   *  Wave 41 Phase K adds crashReports.allowInsecure (default false). */
  platform: {
    type: 'object',
    additionalProperties: false,
    properties: {
      onboarding: {
        type: 'object',
        properties: { completed: { type: 'boolean', default: false } },
        default: {},
      },
      language: { type: 'string', enum: ['en', 'es'], default: 'en' },
      updateChannel: { type: 'string', enum: ['stable', 'beta'], default: 'stable' },
      crashReports: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', default: false },
          webhookUrl: { type: 'string', default: '' },
          /** Wave 41 Phase K — permit http: webhook URLs (debug only; default false). */
          allowInsecure: { type: 'boolean', default: false },
        },
        default: { enabled: false, allowInsecure: false },
      },
      lastSeenVersion: { type: 'string', default: '' },
      /** Wave 38 Phase C — persistent dismissed empty-state keys. */
      dismissedEmptyStates: {
        type: 'object',
        additionalProperties: { type: 'boolean' },
        default: {},
      },
    },
    default: {},
  },
  ...tailSchemaExt2,
};
