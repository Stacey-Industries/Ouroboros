/**
 * configSchemaTailExt2.ts — Third extension shard of tailSchema.
 *
 * Merged into tailSchemaExt via object spread in configSchemaTailExt.ts.
 * Split from configSchemaTailExt.ts to stay under the ESLint max-lines limit.
 */

export const tailSchemaExt2 = {
  /** Wave 16 — persisted Session records (loose schema; TS interface enforces shape) */
  sessionsData: { type: 'array', items: { type: 'object' }, default: [] },
  /** Wave 16 — session feature flags */
  sessions: {
    type: 'object',
    properties: { worktreePerSession: { type: 'boolean', default: false } },
    default: { worktreePerSession: false },
  },
  /** Wave 85 — Flow Tracer settings. */
  flowTracer: {
    type: 'object',
    additionalProperties: false,
    properties: {
      maxDepth: {
        type: 'number',
        minimum: 3,
        maximum: 12,
        default: 6,
      },
      saveSharedFlows: { type: 'boolean', default: false },
    },
    default: { maxDepth: 6, saveSharedFlows: false },
  },
  /** Wave 78 — persisted Export Usage preferences. */
  usageExport: {
    type: 'object',
    additionalProperties: false,
    properties: {
      defaultWindow: {
        type: 'string',
        enum: ['24h', '7d', '30d', 'all'],
        default: '24h',
      },
      lastDir: { type: 'string', default: '' },
    },
    default: { defaultWindow: '24h', lastDir: '' },
  },
  /** Wave 57 — agent monitor feature flags (subagent display + diagnostics). */
  agentMonitor: {
    type: 'object',
    additionalProperties: false,
    properties: {
      subagentDisplay: {
        type: 'object',
        additionalProperties: false,
        properties: {
          diagnostics: { type: 'boolean', default: false },
          enabled: { type: 'boolean', default: true },
        },
        default: { diagnostics: false, enabled: true },
      },
    },
    default: { subagentDisplay: { diagnostics: false, enabled: true } },
  },
};
