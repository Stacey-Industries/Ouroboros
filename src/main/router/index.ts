/**
 * router/index.ts — Public API for the model router module.
 */

export { classifyFeatures } from './classifier';
export { extractFeatures } from './featureExtractor';
export { createLLMFallback } from './llmFallback';
export { logRouterOverride, logRoutingDecision, routePromptSync } from './orchestrator';
export { createRouterLogger } from './routerLogger';
export type {
  ClassifierResult,
  LLMFallbackResult,
  ModelTier,
  RouterSettings,
  RoutingDecision,
  RoutingLogEntry,
  RuleEngineResult,
} from './routerTypes';
export { DEFAULT_ROUTER_SETTINGS, TIER_TO_MODEL } from './routerTypes';
export { routeByRules } from './ruleEngine';
