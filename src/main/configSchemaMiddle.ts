/**
 * configSchemaMiddle.ts — agent template and workspace layout schema fragments.
 * Extracted from configSchema.ts to keep each file under the 300-line limit.
 */

export const middleSchema: Record<string, unknown> = {
  agentTemplates: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        icon: { type: 'string' },
        promptTemplate: { type: 'string' },
        cliOverrides: { type: 'object' },
      },
    },
    default: [
      {
        id: 'builtin:review-pr',
        name: 'Review PR',
        icon: '\ud83d\udd0d',
        promptTemplate:
          'Review the current PR for bugs, logic errors, and improvements. Show a summary of findings.',
      },
      {
        id: 'builtin:write-tests',
        name: 'Write Tests',
        icon: '\u2705',
        promptTemplate:
          'Write comprehensive tests for {{openFile}}. Cover edge cases and error paths.',
      },
      {
        id: 'builtin:explain',
        name: 'Explain Codebase',
        icon: '\ud83d\udcda',
        promptTemplate:
          'Give me a high-level overview of this codebase — architecture, key patterns, and how the main components fit together.',
      },
      {
        id: 'builtin:refactor',
        name: 'Refactor File',
        icon: '\u2728',
        promptTemplate:
          'Refactor {{openFile}} to improve readability, performance, and maintainability. Explain what you changed and why.',
      },
      {
        id: 'builtin:fix-build',
        name: 'Fix Build',
        icon: '\ud83d\udee0\ufe0f',
        promptTemplate:
          'Run the build, identify any errors, and fix them. Show me what you changed.',
      },
    ],
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
            terminal: { type: 'number' },
          },
        },
        visiblePanels: {
          type: 'object',
          properties: {
            leftSidebar: { type: 'boolean' },
            rightSidebar: { type: 'boolean' },
            terminal: { type: 'boolean' },
          },
        },
        rightSidebarTab: { type: 'string' },
        builtIn: { type: 'boolean' },
      },
    },
    default: [
      {
        name: 'Default',
        panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 250 },
        visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
        builtIn: true,
      },
      {
        name: 'Monitoring',
        panelSizes: { leftSidebar: 0, rightSidebar: 400, terminal: 250 },
        visiblePanels: { leftSidebar: false, rightSidebar: true, terminal: true },
        builtIn: true,
      },
      {
        name: 'Review',
        panelSizes: { leftSidebar: 240, rightSidebar: 300, terminal: 0 },
        visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: false },
        builtIn: true,
      },
    ],
  },
  /** Wave 30 Phase G — research auto-firing global defaults.
   *  Wave 30 Phase I — threshold tuning knobs (all read at call time, no restart required). */
  researchSettings: {
    type: 'object',
    additionalProperties: false,
    properties: {
      globalEnabled: { type: 'boolean', default: false },
      defaultMode: { type: 'string', enum: ['off', 'conservative', 'aggressive'], default: 'conservative' },
      /** Staleness confidence floor (0.0–1.0). Curated entries whose confidence maps below this
       *  value are treated as not-stale. 0.0 = include all (default). */
      stalenessConfidenceFloor: { type: 'number', minimum: 0, maximum: 1, default: 0.0 },
      /** When false, factClaimPauseOrchestrator short-circuits (observation telemetry still fires). */
      factClaimEnabled: { type: 'boolean', default: true },
      /** Minimum pattern confidence forwarded to detectFactClaims. */
      factClaimMinPatternConfidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        default: 'medium',
      },
      /** When true, preToolResearchOrchestrator records what it WOULD fire but skips runResearch. */
      preEditDryRunOnly: { type: 'boolean', default: false },
      /** Promise.race timeout (ms) in factClaimPauseOrchestrator. Default 800. */
      maxLatencyMs: { type: 'number', minimum: 100, maximum: 5000, default: 800 },
    },
    default: {
      globalEnabled: false,
      defaultMode: 'conservative',
      stalenessConfidenceFloor: 0.0,
      factClaimEnabled: true,
      factClaimMinPatternConfidence: 'medium',
      preEditDryRunOnly: false,
      maxLatencyMs: 800,
    },
  },
};
