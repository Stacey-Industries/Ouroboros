/**
 * configSchemaTailExt2.ts — Third extension shard of tailSchema.
 *
 * Merged into tailSchemaExt via object spread in configSchemaTailExt.ts.
 * Split from configSchemaTailExt.ts to stay under the ESLint max-lines limit.
 */

export const tailSchemaExt2 = {
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
          // Gated until Phase E soak confirms no regressions. Per project memory:
          // experimental fix, not a destructive flag, but default flip deferred to Phase E.
          enabled: { type: 'boolean', default: false },
        },
        default: { diagnostics: false, enabled: false },
      },
    },
    default: { subagentDisplay: { diagnostics: false, enabled: false } },
  },
};
