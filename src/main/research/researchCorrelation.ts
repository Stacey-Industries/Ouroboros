/**
 * researchCorrelation.ts — In-memory research invocation ↔ file-touch correlation store
 * (Wave 25 Phase D).
 *
 * Tracks which research invocations led to subsequent file edits. Attribution uses
 * "most recent research invocation on this session within 10 minutes" — conservative
 * so a second research invocation doesn't steal attribution from the first's
 * still-unfolding edits.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CorrelationId = string;

interface InvocationRecord {
  sessionId: string;
  topic: string;
  invokedAt: number;
}

export interface SessionCorrelationSummary {
  correlationId: CorrelationId;
  topic: string;
  touchCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Attribution window: 10 minutes in milliseconds. */
const ATTRIBUTION_WINDOW_MS = 10 * 60 * 1000;

// ─── Store interface ──────────────────────────────────────────────────────────

export interface ResearchCorrelationStore {
  /**
   * Record that a research invocation fired for a given session + topic.
   * Called by researchSubagent after cache-hit or spawn completion.
   */
  recordInvocation(correlationId: CorrelationId, sessionId: string, topic: string): void;

  /**
   * When a file-touching tool fires, attribute it to the most-recent research
   * invocation on this session within 10 minutes. Returns the correlationId used,
   * or null if no matching invocation exists.
   */
  attributeOutcome(sessionId: string, toolName: string, filePath: string): CorrelationId | null;

  /** Return aggregated touch counts per research invocation for a session. */
  summarizeSession(sessionId: string): SessionCorrelationSummary[];

  /** @internal Clear all state (test helper). */
  _resetForTests(): void;
}

// ─── Internal state type ──────────────────────────────────────────────────────

interface StoreState {
  invocations: Map<CorrelationId, InvocationRecord>;
  sessionIndex: Map<string, CorrelationId[]>;
  touchCounts: Map<CorrelationId, number>;
}

// ─── Operation helpers (extracted to satisfy max-lines-per-function) ──────────

function doRecordInvocation(state: StoreState, correlationId: CorrelationId, sessionId: string, topic: string): void {
  state.invocations.set(correlationId, { sessionId, topic, invokedAt: Date.now() });
  const list = state.sessionIndex.get(sessionId) ?? [];
  list.push(correlationId);
  state.sessionIndex.set(sessionId, list);
}

function doAttributeOutcome(state: StoreState, sessionId: string): CorrelationId | null {
  const list = state.sessionIndex.get(sessionId);
  if (!list || list.length === 0) return null;
  const now = Date.now();
  for (let i = list.length - 1; i >= 0; i--) {
    // eslint-disable-next-line security/detect-object-injection -- i is a numeric loop index bounded by array length
    const cid = list[i];
    const record = state.invocations.get(cid);
    if (!record) continue;
    if (now - record.invokedAt > ATTRIBUTION_WINDOW_MS) break;
    const prev = state.touchCounts.get(cid) ?? 0;
    state.touchCounts.set(cid, prev + 1);
    return cid;
  }
  return null;
}

function doSummarizeSession(state: StoreState, sessionId: string): SessionCorrelationSummary[] {
  const list = state.sessionIndex.get(sessionId);
  if (!list) return [];
  const result: SessionCorrelationSummary[] = [];
  for (const cid of list) {
    const record = state.invocations.get(cid);
    if (!record) continue;
    result.push({ correlationId: cid, topic: record.topic, touchCount: state.touchCounts.get(cid) ?? 0 });
  }
  return result;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function buildResearchCorrelationStore(): ResearchCorrelationStore {
  const state: StoreState = {
    invocations: new Map(),
    sessionIndex: new Map(),
    touchCounts: new Map(),
  };
  return {
    recordInvocation: (cid, sid, topic) => doRecordInvocation(state, cid, sid, topic),
    attributeOutcome: (sid) => doAttributeOutcome(state, sid),
    summarizeSession: (sid) => doSummarizeSession(state, sid),
    _resetForTests: () => { state.invocations.clear(); state.sessionIndex.clear(); state.touchCounts.clear(); },
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: ResearchCorrelationStore | null = null;

export function getResearchCorrelationStore(): ResearchCorrelationStore {
  if (!singleton) singleton = buildResearchCorrelationStore();
  return singleton;
}

export function _resetResearchCorrelationStoreForTests(): void {
  singleton = null;
}
