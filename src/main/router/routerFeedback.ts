/**
 * routerFeedback.ts — Enriched JSONL writer for the router feedback loop.
 *
 * Wraps the existing RouterLogger to produce EnrichedRoutingLogEntry records
 * with trace_id, counterfactual layer outputs, interaction surface tagging,
 * and hashed workspace identity. Returns the trace_id so callers can
 * correlate quality signals later.
 */

import crypto from 'node:crypto';

import { classifyFeatures } from './classifier';
import { extractFeatures } from './featureExtractor';
import { computePromptHash } from './routerLogger';
import type {
  ClassifierResult,
  CounterfactualResult,
  EnrichedLogOpts,
  EnrichedRoutingLogEntry,
  InteractionType,
  RoutingDecision,
  RuleEngineResult,
} from './routerTypes';
import { routeByRules } from './ruleEngine';

/* ── Constants ───────────────────────────────────────────────────────── */

const TRACE_ID_BYTES = 8;
const HASH_HEX_CHARS = 16;
const PROMPT_FULL_MAX = 500;

/* ── Helpers ─────────────────────────────────────────────────────────── */

function generateTraceId(): string {
  return crypto.randomBytes(TRACE_ID_BYTES).toString('hex');
}

function hashWorkspaceRoot(root: string | undefined): string | null {
  if (!root) return null;
  return crypto.createHash('sha256').update(root).digest('hex').slice(0, HASH_HEX_CHARS);
}

/** Run Layer 1 (rule engine) as a counterfactual when it wasn't the winner. */
function counterfactualL1(prompt: string, prev?: string): RuleEngineResult | null {
  return routeByRules(prompt, prev);
}

/** Run Layer 2 (classifier) as a counterfactual when it wasn't the winner. */
function counterfactualL2(prompt: string, prev?: string): ClassifierResult | null {
  const features = extractFeatures(prompt, prev);
  return classifyFeatures(features);
}

/* ── Counterfactual builder ──────────────────────────────────────────── */

/**
 * Builds counterfactual results for layers that did NOT produce the winning
 * decision, so we can retroactively evaluate all layers offline.
 */
function buildCounterfactual(
  decision: RoutingDecision,
  prompt: string,
  prev?: string,
): CounterfactualResult {
  const cf: CounterfactualResult = { layer1: null, layer2: null, layer3: null };

  if (decision.routedBy !== 'rule') {
    cf.layer1 = counterfactualL1(prompt, prev);
  }
  if (decision.routedBy !== 'classifier') {
    cf.layer2 = counterfactualL2(prompt, prev);
  }
  // Layer 3 (LLM) is async — always null in the sync path.
  return cf;
}

/* ── Entry builder ───────────────────────────────────────────────────── */

interface BuildEntryArgs {
  prompt: string;
  decision: RoutingDecision;
  traceId: string;
  counterfactual: CounterfactualResult;
  opts?: EnrichedLogOpts;
}

function buildEnrichedEntry(args: BuildEntryArgs): EnrichedRoutingLogEntry {
  const { prompt, decision, traceId, counterfactual, opts } = args;
  const interactionType: InteractionType = opts?.interactionType ?? 'unknown';

  return {
    timestamp: new Date().toISOString(),
    promptPreview: prompt.substring(0, 100),
    promptFull: prompt.substring(0, PROMPT_FULL_MAX),
    promptHash: computePromptHash(prompt),
    traceId,
    sessionId: opts?.sessionId ?? null,
    interactionType,
    workspaceRootHash: hashWorkspaceRoot(opts?.workspaceRoot),
    tier: decision.tier,
    model: decision.model,
    routedBy: decision.routedBy,
    rule: decision.rule,
    confidence: decision.confidence,
    latencyMs: decision.latencyMs,
    layer1Result: buildActualL1(decision),
    layer2Result: buildActualL2(decision),
    layer3Result: null,
    override: null,
    counterfactual,
  };
}

/* ── Actual layer result builders ────────────────────────────────────── */

function buildActualL1(d: RoutingDecision): RuleEngineResult | null {
  if (d.routedBy !== 'rule') return null;
  return {
    tier: d.tier,
    rule: d.rule ?? 'DEFAULT',
    confidence: d.confidence >= 1 ? 'HIGH' : 'MEDIUM',
  };
}

function buildActualL2(d: RoutingDecision): ClassifierResult | null {
  if (d.routedBy !== 'classifier') return null;
  return { tier: d.tier, confidence: d.confidence, features: d.features ?? {} };
}

/* ── Public API ──────────────────────────────────────────────────────── */

export interface EnrichedWriteArgs {
  prompt: string;
  decision: RoutingDecision;
  previousAssistantMessage?: string;
  opts?: EnrichedLogOpts;
}

/**
 * Builds an enriched log entry with counterfactual data and a stable trace_id.
 * Does NOT write to disk — returns the entry for the caller to pass to the logger.
 */
export function buildEnrichedLogEntry(args: EnrichedWriteArgs): EnrichedRoutingLogEntry {
  const { prompt, decision, previousAssistantMessage, opts } = args;
  const traceId = generateTraceId();
  const counterfactual = buildCounterfactual(decision, prompt, previousAssistantMessage);

  return buildEnrichedEntry({
    prompt,
    decision,
    traceId,
    counterfactual,
    opts,
  });
}
