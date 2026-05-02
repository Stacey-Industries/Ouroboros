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
          enabled: { type: 'boolean', default: true },
        },
        default: { diagnostics: false, enabled: true },
      },
    },
    default: { subagentDisplay: { diagnostics: false, enabled: true } },
  },
};
