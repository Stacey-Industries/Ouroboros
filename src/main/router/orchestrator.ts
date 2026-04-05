/**
 * orchestrator.ts — Chains the three routing layers into a single decision.
 *
 * Layer 1: Rule engine (sync, 0ms)
 * Layer 2: ML classifier (sync, ~5ms) — not yet implemented
 * Layer 3: LLM fallback (async, ~300ms) — not yet implemented
 *
 * Falls back to SONNET on any error or when all layers decline.
 */

import { app } from 'electron';

import log from '../logger';
import { classifyFeatures } from './classifier';
import { extractFeatures } from './featureExtractor';
import { buildEnrichedLogEntry } from './routerFeedback';
import { createRouterLogger } from './routerLogger';
import type { EnrichedLogOpts, ModelTier, RouterSettings, RoutingDecision } from './routerTypes';
import { DEFAULT_ROUTER_SETTINGS, TIER_TO_MODEL } from './routerTypes';
import { routeByRules } from './ruleEngine';

/** Safe tier→model lookup that avoids the `security/detect-object-injection` rule. */
function modelForTier(tier: ModelTier): string {
  if (tier === 'HAIKU') return TIER_TO_MODEL.HAIKU;
  if (tier === 'OPUS') return TIER_TO_MODEL.OPUS;
  return TIER_TO_MODEL.SONNET;
}

/* ── Sync routing (Layer 1 only) ──────────────────────────────────── */

/**
 * Route a prompt using only the deterministic rule engine.
 * Returns a decision, or null if the rule engine has no match and
 * higher layers are needed (which aren't wired yet).
 */
export function routePromptSync(
  prompt: string,
  previousAssistantMessage?: string,
  settings?: RouterSettings,
): RoutingDecision | null {
  const config = settings ?? DEFAULT_ROUTER_SETTINGS;

  if (!config.enabled) return null;
  if (config.paranoidMode) return buildDecision('OPUS', 'default', 1);

  if (!config.layer1Enabled) return null;

  const start = performance.now();
  const ruleResult = routeByRules(prompt, previousAssistantMessage);
  const latencyMs = performance.now() - start;

  if (ruleResult) {
    return {
      tier: ruleResult.tier,
      model: modelForTier(ruleResult.tier),
      routedBy: 'rule',
      rule: ruleResult.rule,
      confidence: ruleResult.confidence === 'HIGH' ? 1 : 0.7,
      latencyMs,
    };
  }

  // Layer 2: ML classifier
  if (config.layer2Enabled) {
    const l2 = runClassifier(prompt, previousAssistantMessage, config);
    if (l2) return { ...l2, latencyMs: performance.now() - start };
  }

  // Layer 3 (LLM fallback) not yet wired — requires async path.
  // Fall through to null — caller uses existing model resolution.
  return null;
}

/* ── Layer 2: ML classifier ───────────────────────────────────────── */

function runClassifier(
  prompt: string,
  previousAssistantMessage: string | undefined,
  config: RouterSettings,
): RoutingDecision | null {
  const features = extractFeatures(prompt, previousAssistantMessage);
  const result = classifyFeatures(features);
  if (result.confidence < config.layer2ConfidenceThreshold) return null;
  return {
    tier: result.tier,
    model: modelForTier(result.tier),
    routedBy: 'classifier',
    confidence: result.confidence,
    latencyMs: 0,
    features: result.features,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function buildDecision(
  tier: RoutingDecision['tier'],
  routedBy: RoutingDecision['routedBy'],
  confidence: number,
): RoutingDecision {
  return {
    tier,
    model: modelForTier(tier),
    routedBy,
    confidence,
    latencyMs: 0,
  };
}

/* ── JSONL training-data logger (lazy singleton) ──────────────────── */

let jsonlLogger: ReturnType<typeof createRouterLogger> | null = null;

function getJsonlLogger(): ReturnType<typeof createRouterLogger> | null {
  if (jsonlLogger) return jsonlLogger;
  try {
    jsonlLogger = createRouterLogger(app.getPath('userData'));
    return jsonlLogger;
  } catch {
    return null;
  }
}

/* ── Logging helper (called by the bridge, not internally) ────────── */

/**
 * Logs a routing decision to electron-log and appends an enriched JSONL entry.
 * Returns the trace_id for correlation with quality signals, or null if skipped.
 */
export function logRoutingDecision(
  prompt: string,
  decision: RoutingDecision | null,
  opts?: EnrichedLogOpts,
): string | null {
  if (!decision) return null;
  logToElectronLog(prompt, decision);
  return writeEnrichedEntry(prompt, decision, opts);
}

export function logRouterOverride(
  routerTier: ModelTier,
  userChosenModel: string,
  promptPreview: string,
): void {
  const logger = getJsonlLogger();
  if (!logger) return;
  logger.logOverride(routerTier, userChosenModel, promptPreview);
}

function logToElectronLog(prompt: string, decision: RoutingDecision): void {
  const preview = prompt.substring(0, 80).replace(/\n/g, ' ');
  log.info('[router]', {
    tier: decision.tier,
    model: decision.model,
    rule: decision.rule ?? '-',
    routedBy: decision.routedBy,
    confidence: decision.confidence,
    latencyMs: decision.latencyMs.toFixed(1),
    prompt: preview,
  });
}

function writeEnrichedEntry(
  prompt: string,
  decision: RoutingDecision,
  opts?: EnrichedLogOpts,
): string | null {
  const logger = getJsonlLogger();
  if (!logger) return null;
  const entry = buildEnrichedLogEntry({ prompt, decision, opts });
  logger.log(entry);
  return entry.traceId;
}
