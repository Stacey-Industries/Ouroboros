/**
 * router/index.ts — Public API for the model router module.
 */

export { classifyFeatures, reloadWeights } from './classifier';
export { extractFeatures } from './featureExtractor';
export { logRouterOverride, logRoutingDecision, routePromptSync } from './orchestrator';
export {
  loadRetrainedWeightsIfAvailable,
  observeDatasetGrowth,
  stopObserving,
} from './retrainTrigger';
export { exportTrainingData } from './routerExporter';
export { buildEnrichedLogEntry } from './routerFeedback';
export { createRouterLogger } from './routerLogger';
export type {
  ClassifierResult,
  EnrichedLogOpts,
  EnrichedRoutingLogEntry,
  InteractionType,
  LLMFallbackResult,
  ModelTier,
  RouterSettings,
  RoutingDecision,
  RoutingLogEntry,
  RuleEngineResult,
} from './routerTypes';
export { DEFAULT_ROUTER_SETTINGS, TIER_TO_MODEL } from './routerTypes';
export { routeByRules } from './ruleEngine';
