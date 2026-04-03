/**
 * routerTypes.ts — Shared type contract for the model router module.
 *
 * All router submodules (rule engine, classifier, LLM fallback, orchestrator,
 * logger) import types from this file. No business logic lives here.
 */

/* ── Tier definitions ─────────────────────────────────────────────── */

export type ModelTier = 'HAIKU' | 'SONNET' | 'OPUS';

/** Maps tier → Anthropic model ID used in --model CLI flag. */
export const TIER_TO_MODEL: Record<ModelTier, string> = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-6',
};

/* ── Slash-command → tier mapping ─────────────────────────────────── */

/**
 * Commands that force a specific tier. Keys match the prompt text prefix
 * as it arrives in the agent chat send path (e.g. "/user:review").
 *
 * Structured so new commands are a one-line addition.
 */
export const SLASH_COMMAND_TIERS: Record<string, ModelTier> = {
  // ── OPUS: judgment, planning, architectural review ──
  '/user:review': 'OPUS',
  '/user:audit': 'OPUS',
  '/user:analyze': 'OPUS',
  '/user:analyze-assess': 'OPUS',
  '/user:analyze-map': 'OPUS',
  '/user:specplan': 'OPUS',
  '/user:specplan-draft': 'OPUS',
  '/user:specplan-review': 'OPUS',
  '/user:scopesplit': 'OPUS',
  '/user:scopesplit-draft': 'OPUS',
  '/user:scopesplit-review': 'OPUS',
  'code-review:code-review': 'OPUS',
  'pr-review-toolkit:review-pr': 'OPUS',

  // ── SONNET: implementation, execution, investigation ──
  '/user:build': 'SONNET',
  '/user:executephase': 'SONNET',
  '/user:migrate': 'SONNET',
  '/user:define': 'SONNET',
  '/user:research': 'SONNET',
  '/user:tdd': 'SONNET',
  '/user:smart-fix': 'SONNET',
  '/user:onboard': 'SONNET',
  '/user:reviewbug': 'SONNET',
  '/user:reviewphase': 'SONNET',
  '/user:deps-audit': 'SONNET',
  '/user:context-save': 'SONNET',
  '/project:blast-radius': 'SONNET',
  '/project:safe-check': 'SONNET',
  '/project:lint-fix-all': 'SONNET',
  '/project:pre-commit': 'SONNET',
  '/project:graph-sync': 'SONNET',
  'commit-commands:commit': 'SONNET',
  'commit-commands:commit-push-pr': 'SONNET',
  'feature-dev:feature-dev': 'SONNET',

  // ── HAIKU: lookups, explanations ──
  '/user:explain': 'HAIKU',
};

/* ── Rule engine types ────────────────────────────────────────────── */

export type RuleCode =
  | 'CMD'            // slash command override
  | 'H1' | 'H2' | 'H3' | 'H4' | 'H5'   // HAIKU rules
  | 'S1' | 'S2' | 'S3'                   // SONNET confirmation rules
  | 'O1' | 'O2' | 'O3' | 'O4' | 'O5'   // OPUS rules
  | 'DEFAULT';       // no rule matched → SONNET

export type RuleConfidence = 'HIGH' | 'MEDIUM';

export interface RuleEngineResult {
  tier: ModelTier;
  rule: RuleCode;
  confidence: RuleConfidence;
}

/* ── Classifier types ─────────────────────────────────────────────── */

export interface ClassifierResult {
  tier: ModelTier;
  confidence: number;
  features: Record<string, number>;
}

/* ── LLM fallback types ───────────────────────────────────────────── */

export interface LLMFallbackResult {
  tier: ModelTier;
  reason: string;
}

/* ── Orchestrator output ──────────────────────────────────────────── */

export type RoutedBy = 'rule' | 'classifier' | 'llm' | 'default';

export interface RoutingDecision {
  tier: ModelTier;
  /** Anthropic model ID string (e.g. "claude-sonnet-4-6"). */
  model: string;
  routedBy: RoutedBy;
  rule?: RuleCode;
  confidence: number;
  latencyMs: number;
  features?: Record<string, number>;
}

/* ── Logging types ────────────────────────────────────────────────── */

export interface RoutingLogEntry {
  timestamp: string;
  promptPreview: string;
  promptHash: string;
  tier: ModelTier;
  model: string;
  routedBy: RoutedBy;
  rule?: RuleCode;
  confidence: number;
  latencyMs: number;
  layer1Result: RuleEngineResult | null;
  layer2Result: ClassifierResult | null;
  layer3Result: LLMFallbackResult | null;
  /** Non-null when the user manually overrode the router's choice. */
  override: { userChosenModel: string; routerSuggestedTier: ModelTier } | null;
}

/* ── Config types ─────────────────────────────────────────────────── */

export interface RouterSettings {
  /** Master toggle — when false, router is bypassed entirely. */
  enabled: boolean;
  /** Enable the deterministic rule engine (Layer 1). */
  layer1Enabled: boolean;
  /** Enable the ML classifier (Layer 2). */
  layer2Enabled: boolean;
  /** Enable the Haiku LLM fallback (Layer 3). */
  layer3Enabled: boolean;
  /** Classifier probability below this → low confidence → try next layer. */
  layer2ConfidenceThreshold: number;
  /** Always route to Opus regardless of classification. */
  paranoidMode: boolean;
}

export const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
  enabled: true,
  layer1Enabled: true,
  layer2Enabled: true,
  layer3Enabled: true,
  layer2ConfidenceThreshold: 0.6,
  paranoidMode: false,
};

/* ── Feature list (canonical, shared by TS extractor + Python trainer) */

/**
 * Ordered list of feature names produced by the feature extractor.
 * The Python training script and TS classifier MUST use this exact order.
 * Adding a feature requires updating both `featureExtractor.ts` and
 * `tools/train-router.py`.
 */
export const FEATURE_NAMES = [
  'promptCharLength',
  'wordCount',
  'questionMarkCount',
  'sentenceCount',
  'containsCodeBlock',
  'containsFilePath',
  'filePathCount',
  'judgmentWordCount',
  'planningWordCount',
  'implementationWordCount',
  'lookupWordCount',
  'ambiguityWordCount',
  'scopeWordCount',
  'prevMessageIsAssistant',
  'prevAssistantEndsWithQuestion',
  'prevAssistantLength',
  'prevAssistantIsPlan',
  'isPastedOnly',
  'slashCommandPresent',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
