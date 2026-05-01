/**
 * repoMapBudgets.ts — Model-aware token budgets for the contextLayer
 * (Wave 69 Phase C, ADR Decision 5).
 *
 * Mirrors the existing `getModelBudgets` pattern in
 * `orchestration/contextPacketBuilderSupport.ts`. Higher-tier models get
 * larger raw byte caps and larger injection token caps because they can
 * usefully absorb richer repo maps; smaller models keep the historical 8 KB
 * default to avoid wasting context on noise they can't act on.
 */

export interface RepoMapBudget {
  /** Raw repo-map JSON byte cap before enforceSizeCap starts trimming. */
  rawCapBytes: number;
  /** Total injection token budget for the repo-map + module-summary payload. */
  injectionTokenCap: number;
}

const OPUS_BUDGET: RepoMapBudget = { rawCapBytes: 16_384, injectionTokenCap: 4000 };
const SONNET_BUDGET: RepoMapBudget = { rawCapBytes: 12_288, injectionTokenCap: 3000 };
const DEFAULT_BUDGET: RepoMapBudget = { rawCapBytes: 8192, injectionTokenCap: 2000 };

/**
 * Returns the budget for a given model string. Substring-match on the
 * model id is intentional: callers may pass dated names like
 * `claude-opus-4-7` or `claude-sonnet-4-6-20251020`. Unknown models
 * (including `undefined` / empty) fall through to the historical 8 KB / 2K
 * default so existing call sites don't regress.
 */
export function getRepoMapBudget(model?: string | null): RepoMapBudget {
  if (!model) return DEFAULT_BUDGET;
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return OPUS_BUDGET;
  if (lower.includes('sonnet')) return SONNET_BUDGET;
  return DEFAULT_BUDGET;
}
