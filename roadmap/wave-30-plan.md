# Wave 30 — Research Auto-Firing (Context-Based)

## Implementation Plan

**Version target:** v2.0.0 (major — first automated layer on top of research).
**Feature flag:** `research.auto` (default `off` at launch; default `on` after 2 weeks post-launch soak).
**Dependencies:** Wave 25 (explicit research pipeline) + Wave 29.5 (telemetry foundation) committed. The 4-week telemetry soak gate is **time-based** — we ship the code now, flip the flag after soak.
**Reference:** `roadmap/roadmap.md:1369-1435` (Wave 30 spec).

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Staleness matrix** — curated top-30 libraries with known-cutoff versions + release-date heuristic for long-tail. Seed list from `package.json` deps + a hand-curated ecosystem list. Immutable baseline; updates via quarterly review. | `src/main/research/stalenessMatrix.ts` (new), `src/main/research/stalenessMatrixData.ts` (new — the curated list), test files |
| B | **Trigger evaluator (rule layer)** — `evaluateTrigger(context): TriggerDecision`. Inputs: dirty file set, imports per file, staleness matrix, per-session flags, slash-command state. Pure function, no I/O, easy to test. | `src/main/research/triggerEvaluator.ts` (new), `src/main/research/triggerEvaluatorSupport.ts` (if >300 lines), test file |
| C | **Slash-command integration** — `/research off` / `/research on` / `/research status`. Per-session state in the chat bridge runtime. | `src/main/agentChat/chatOrchestrationBridge.ts` (or its command-dispatch helper — likely a `bridgeSlashCommands.ts` file), `src/main/research/researchSessionState.ts` (new) |
| D | **PreToolUse hook integration** — when Claude is about to Edit/Write a file, read the file's imports, ask the trigger evaluator, fire research pre-flight if indicated. Fire-and-forget: do NOT block the tool call. Research result lands in session context for the next turn. | `src/main/hooks.ts` → `hooksSessionHandlers.ts` (new wiring), `src/main/research/preToolResearchOrchestrator.ts` (new) |
| E | **Enhanced-research consumption** — Phase H from Wave 29.5 ships `correctionStore.getLibraries(sessionId)`. This phase wires it: libraries in that set bump priority in the trigger evaluator (always-fire regardless of staleness matrix). | `src/main/research/triggerEvaluator.ts` (extend), `src/main/research/correctionStore.ts` (add consumer-facing helper if needed), test |
| F | **Fact-shaped claim detector** — lightweight regex on outgoing stream chunks. Patterns for React hooks (`use[A-Z]\w+\(`), Zod (`z\.\w+\(`), Prisma (`prisma\.\w+\.`). On match + library is flagged stale + no cached artifact → brief stream pause, fire research, resume. Keep patterns in a data file for easy expansion. | `src/main/research/factClaimDetector.ts` (new), `src/main/research/factClaimPatterns.ts` (new — data file), `src/main/agentChat/chatOrchestrationBridgeProgress.ts` (extend stream tap), test |
| G | **User controls — per-session toggle + Settings** — chat composer gets a tri-state toggle: Off / Conservative / Aggressive. Settings exposes global default. Keyboard shortcut toggles current session. | `src/renderer/components/chat/ComposerFooter.tsx` or similar (tri-state toggle), `src/renderer/components/Settings/ResearchSettings.tsx` (new), IPC wiring, config schema extension |
| H | **Weekly dashboard** — dev-facing metrics page. Queries `research_invocations`, `research-outcomes-*.jsonl` (via Wave 29.5 Phase G's globbed readers), `corrections-*.jsonl`. Renders fired count, outcome-correlated count, false-positive rate, false-negative rate. Renderer-side, no IPC retrofits needed if telemetry exposes read accessors. | `src/renderer/components/Observability/ResearchDashboard.tsx` (new), `src/main/ipc-handlers/researchDashboardHandlers.ts` (new), test |
| I | **Threshold tuning knobs in Settings** — expose `staleness.confidenceFloor`, `factClaim.minPatternConfidence`, `preEdit.dryRunOnly` so thresholds are adjustable without code changes. | `src/main/configSchemaTail.ts` (or appropriate schema slice), `src/renderer/components/Settings/ResearchSettings.tsx` (extend Phase G) |
| J | **Per-model training cutoffs** — replace the single `TRAINING_CUTOFF_DATE` constant with a per-model registry keyed by `ModelId`. Compile-time enforcement via `Record<ModelId, ModelTrainingInfo>` so adding a new model without a cutoff fails `tsc`. Runtime fallback for unknown/user-supplied model IDs: log-once warning + `today − 180d` default. Unit test asserts every provider-registry `ModelId` has an entry. `evaluateTrigger` + `isStale` take the session's active model's cutoff instead of the global constant. | `src/main/research/modelTrainingCutoffs.ts` (new), `src/main/research/stalenessMatrix.ts` (accept `modelCutoffDate` param), `src/main/research/triggerEvaluator.ts` (thread active modelId → cutoff), `src/main/research/modelTrainingCutoffs.test.ts` (registry completeness + fallback) |

**Phase order rationale:** A→B is the rule-layer foundation. C + D + E are parallel-safe after B lands (different entry points). F is stream-taps — independent. G + H + I are UI and can land after the main process is instrumented. J retrofits A/B for multi-model correctness — can land any time after B; before launch is ideal so the soak runs against model-relative staleness, not a single-constant approximation.

**Soak gate:** After all phases commit, run `research.auto` flag **off** by default for 2 weeks. Collect telemetry via Wave 29.5's persistence. Flip to `on` after measured FP-rate < 15% and subjective annoyance ≤ 2/10.

---

## Feature flag

`research.auto` (default `false` initially). When `false`:

- Trigger evaluator still loads but returns `{ fire: false, reason: 'disabled' }` for all cases.
- PreToolUse hook integration (Phase D) short-circuits.
- Fact-shaped claim detector (Phase F) still collects telemetry for dashboard but does not actually fire research.
- User controls (Phase G) show a "disabled by global setting" state; per-session aggressive opt-in can override.

Additional per-session flag: `research.auto.mode` = `'off' | 'conservative' | 'aggressive'` (renderer + session state only).

---

## Architecture notes

**Staleness matrix structure (Phase A):**
```ts
type StalenessEntry =
  | { kind: 'curated'; library: string; cutoffVersion: string; cutoffDate: string; confidence: 'high' }
  | { kind: 'heuristic'; library: string; releasedAfter: string; confidence: 'medium' };
```
Curated list seeded with: Next.js, React, Vercel AI SDK, shadcn/ui, Tailwind, Prisma, Drizzle, Zod, tRPC, Electron, Vite, Remix, Astro, Svelte, SvelteKit, Vue, Nuxt, Angular, Bun, Deno, TanStack Query, TanStack Router, Hono, Elysia, Lucide, Radix, Shadcn CLI, Shadow DOM utilities, Framer Motion, and the project's own direct deps. Roughly 30 entries.

Heuristic layer: for any library not in the curated list but flagged as an import, check the npm registry's latest major release date. If after Claude training cutoff (2025-06-01 baseline — make this a constant), treat as stale. Denylist: internal packages, well-known stable libraries (lodash, ramda, etc.).

**Trigger evaluator API (Phase B):**
```ts
interface TriggerContext {
  dirtyFiles: Array<{ path: string; imports: string[] }>;
  sessionFlags: { mode: 'off' | 'conservative' | 'aggressive'; enhancedLibraries: Set<string> };
  cacheCheck: (library: string) => boolean;
  globalFlag: boolean;
}
interface TriggerDecision {
  fire: boolean;
  reason: 'disabled' | 'no-stale-imports' | 'cache-hit' | 'staleness-match' | 'enhanced-library' | 'forced-on';
  library?: string;
  triggerSource: 'rule' | 'correction' | 'fact-claim' | 'slash' | 'none';
}
```

Pure function. `cacheCheck` is injected — tests pass a stub. Production uses the research cache store.

**PreToolUse hook (Phase D):**
- Reads the target file's import list (reuse `src/main/orchestration/contextSelectionSupport.ts`'s import parser if it exposes one; if not, add a thin helper).
- Call `evaluateTrigger`; if `fire: true`, call `researchSubagent.runResearch(...)` with `triggerReason: 'hook'`, do not await, attach resolving promise to session state so the next turn's context packet can include the artifact.
- Never blocks the tool call — if research takes >5 seconds, the Edit proceeds without the artifact. The correction-capture + outcome telemetry will flag it if the missing research caused a problem.

**Fact-shaped claim detector (Phase F):**
- Taps `chatOrchestrationBridgeProgress.ts`'s stream routing.
- Runs regex match per chunk (chunked text from deltas). On match, checks staleness + cache.
- Stream pause: push a small "checking…" status chunk, fire research, wait up to 800 ms, then resume. If research exceeds 800 ms, resume without artifact and log a telemetry event for the dashboard.
- Keep the pause tight — user-perceptible delay kills UX.

**User controls (Phase G):**
- Chat composer footer: three-state segmented control. State persists to session storage.
- Settings page: global default + "threshold knobs" section (Phase I).
- Keyboard shortcut: `Ctrl+Shift+R` cycles Off → Conservative → Aggressive → Off on the current session.
- Use design tokens (`bg-surface-raised`, `border-border-semantic`, etc.) — no hex colors.

**Dashboard (Phase H):**
- Renders in the existing Observability tab (`src/renderer/components/Observability/`). Add a new sub-route.
- Reads via IPC: `research:getDashboardMetrics(range: '7d' | '30d' | 'all')`. Handler in `src/main/ipc-handlers/researchDashboardHandlers.ts` queries SQLite + globbed JSONL.
- Metrics computed server-side (main process) — renderer just displays. Server returns a pre-aggregated shape.
- Chart library: no new dependency — use existing (check if Recharts or similar is already installed). If none, use inline SVG.

**Per-model training cutoffs (Phase J):**
- `Record<ModelId, ModelTrainingInfo>` in `src/main/research/modelTrainingCutoffs.ts`. `ModelId` sourced from the existing provider registry (`src/main/providers.ts`) to keep a single source of truth.
- Compile-time catch: adding a new `ModelId` without an entry fails `tsc` via the mapped-type requirement.
- Runtime catch: unknown IDs (OpenRouter-style custom configs) log a one-time warning and fall back to `today − 180d` — conservative enough to still fire research, not so aggressive it fires on every import.
- Test catch: vitest assertion that every provider-registry `ModelId` has a `MODEL_TRAINING_CUTOFFS` entry.
- `evaluateTrigger` receives the active `modelId` via `TriggerContext` and resolves the cutoff before calling `isStale`. `isStale(library, importedVersion?, modelCutoffDate?)` compares per-library `cutoffDate` against the model's cutoff: library released after model cutoff → stale.
- The legacy global `TRAINING_CUTOFF_DATE` constant in `stalenessMatrixData.ts` remains as a documented fallback when no model ID is threaded through (e.g., non-session contexts), but is deprecated; remove in a follow-up wave once all call sites pass modelId.

**Threshold knobs (Phase I):**
- Schema additions to `configSchemaTail.ts`: `research.auto.staleness.confidenceFloor` (0.0–1.0), `research.auto.factClaim.enabled` (bool), `research.auto.preEdit.dryRunOnly` (bool), `research.auto.maxLatencyMs` (number, default 800).
- All knobs read by the trigger evaluator + fact claim detector at call time — no restart required.

---

## ESLint split points to anticipate

- `triggerEvaluator.ts` — `evaluateTrigger` will branch on mode, staleness, enhanced libraries, fact-claims. Multiple helpers: `evaluateRuleLayer`, `evaluateCorrectionLayer`, `evaluateFactClaim`. Extract to `triggerEvaluatorSupport.ts` from the start.
- `factClaimDetector.ts` — pattern matching + pause logic. Split detector (pure) from pause orchestrator (stream-coupled). Keep pure part testable without the bridge.
- `chatOrchestrationBridgeProgress.ts` — already near the line limit. Add only the stream tap call; put detector logic in the new file.
- `stalenessMatrixData.ts` — large data file, but ESLint's `max-lines` applies to functions too. Data is a single exported array; line limit counts blank + comment lines as skipped, so a 300-entry array fits.

---

## Risks

- **False-positive rate** — conservative defaults and aggressive opt-in are the mitigation. Dashboard surfaces FP rate week 1; threshold tuning knobs let us adjust without shipping code.
- **Stream pause UX** — 800 ms max. If users report jank, reduce to 500 ms; the research runs async and can still contribute to the next turn.
- **PreToolUse research exceeding tool-call latency** — fire-and-forget; never block. Artifact lands for the *next* turn's packet. Accept that the current turn proceeds without it.
- **Staleness matrix bit-rot** — quarterly review scheduled. Release-date heuristic covers long-tail without curation.
- **Correction-store capture false positives** — Wave 29.5 Phase H detects corrections via regex; some will misfire. Accept that enhanced-research set may contain a few wrongly-flagged libraries per session; cost is small (one extra research fire per misflagged library).
- **Dashboard staleness on heavy sessions** — SQLite query + JSONL glob on every dashboard open could be slow. Cache metrics in-main for 60 s.

---

## Acceptance

- Editing a file importing `next@15.*` fires research automatically when no cached artifact exists.
- "That API was removed in Zod 4" correction (captured by Wave 29.5 Phase H) flags Zod for session-enhanced research; next Zod-adjacent edit fires without staleness trigger.
- Per-session toggle (Off / Conservative / Aggressive) changes behavior immediately.
- Weekly dashboard exists, queries telemetry, renders metrics.
- After 4 weeks of soak, measured FP rate < 15 % and subjective annoyance ≤ 2/10.
- `research.auto` flag flipped to default `on` after soak.
- `npm run lint` passes 0 errors; `npm test` green; `npm run build` green.

---

## Soak gate

**Do not flip `research.auto` default to `on` until:**
1. ≥ 4 weeks of telemetry accumulated since Wave 29.5 Phase E landed.
2. Dashboard FP rate < 15 %.
3. Subjective annoyance survey ≤ 2/10 (author's own dogfood assessment).
4. No correction-capture misfires causing obvious wrong-library research.

Flag flip is a one-line config change; schedule it explicitly on the roadmap after soak.
