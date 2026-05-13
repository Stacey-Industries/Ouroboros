# Wave 24 — Context Decision Logging & Haiku Reranker
## Implementation Plan

**Version target:** v1.7.0 (minor)
**Feature flags:** `context.decisionLogging` (default `true`) + `context.rerankerEnabled` (default `true`)
**Dependencies:** Waves 15 (telemetry), 19 (context scoring)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Decision logging — `contextSignalCollector.ts` emits `ContextDecision` on packet build to JSONL with 10MB rotation | `contextSignalCollector.ts` (new), `contextDecisionWriter.ts` (new) |
| B | Outcome aggregation — per-turn tool-call observer emits `ContextOutcome` (used/missed/unused) | `contextOutcomeObserver.ts` (new), bridge hook |
| C | Haiku reranker + auth spike — `contextReranker.ts` via `spawnClaude` CLI with 500 ms timeout + silent fallback | `contextReranker.ts` (new), spawn-helper |
| D | End-to-end wiring — reranker into `buildPacketFiles`, decision emission in `contextPacketBuilder`, config flags | `contextPacketBuilder.ts`, `config.ts` |

## Auth spike (Phase C)

Max subscription has no API key, so the reranker must use `spawnClaude` CLI. Spike upfront:
1. Build a minimal `spawnClaude --model haiku --print "<prompt>"` invocation helper.
2. Measure round-trip latency for a 15-file rerank prompt (target: p50 < 500 ms, p95 < 800 ms).
3. If spike fails (latency > 2 s, auth fails, or JSON output inconsistent), kill-switch the reranker. Ship only Phases A+B.

## Feature flags

`context.decisionLogging` (default `true`) — gates JSONL writes. Off = observers run but don't persist.
`context.rerankerEnabled` (default `true`) — gates the Haiku reranker. Off = heuristic order only.

## Acceptance

- `{userData}/context-decisions.jsonl` + `context-outcomes.jsonl` exist and grow after a 5-turn conversation.
- One `traceId` has full round-trip entries (decision + outcome).
- With reranker on, top-10 order differs from flag-off on same query.
- Reranker p95 latency < 800 ms.

## Risks

- **Tool-call observation is the fragile bit** → use existing logging hooks (Wave 15 telemetry event stream) rather than re-instrumenting the orchestration bridge.
- **Reranker latency** → 500 ms timeout with silent fallback; kill-switch via flag.
- **spawnClaude startup cost** → may exceed 500 ms target. Phase C spike gates go/no-go.
- **JSONL rotation** → follow the router pattern (`src/main/router/*` has an existing 10 MB rotator).
