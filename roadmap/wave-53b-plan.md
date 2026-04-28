# Wave 53b — Context Ranker Measurement & Tuning (on unified corpus)

## Implementation Plan (DRAFT — STUB)

**Status:** DRAFT — full plan written after Wave 53a's migrations land. This stub captures intent and inherits scope from the original Wave 52 plan.
**Version target:** v2.10.x (minor — measurement-driven ranker adjustments + variant ranker)
**Feature flags:** new `contextRanker.mode` (`current` | `tuned` | `experimental`, default `current`), new `contextRanker.telemetryEnabled` (default `true`)
**Dependencies:** Wave 52 ✅ (queue infrastructure), Wave 53a ✅ (telemetry parity)

---

## Overview

This is the original Wave 52 work, deferred until the corpus is unified across internal and external sessions. Now that Wave 53a has migrated all hookable telemetry surfaces through the queue+drain pipe, the ranker analysis can run against a corpus that reflects the user's actual workflow — not just the subset of sessions that happened with the IDE running.

The core idea is unchanged from the original Wave 52 plan: measure the ranker's hit rate (does the agent Read the files we pre-loaded?), then tune weights or document the decision. Phase C ships a variant ranker behind a flag regardless of Phase A's outcome — concrete artifact every wave.

---

## Scope

### In-scope

- Offline analysis script (`scripts/analyze-ranker-hit-rate.ts`) that reads the unified corpus.
- Internal session view (existing `<relevant_code>` from session JSONLs).
- External session view (post-hoc ranker run against reconstructed git state, using the queue-imported metadata).
- Online telemetry — `contextPacketBuilder.ts` post-rerank emission.
- Tuning experiment — variant ranker behind `contextRanker.mode`.
- Decision report at `roadmap/wave-53b-analysis.md`.
- Doc at `docs/context-ranker.md`.

### Out-of-scope

- New signal sources (embeddings, LSP queries) — separate wave.
- Changing the budget byte/token caps — separate concern.

---

## Phases (preliminary)

| Phase | Scope | Conditional? |
|---|---|---|
| A | Offline analysis on unified corpus; decision report | No |
| B | Online telemetry (contextPacketBuilder + queue-aware) | No |
| C | Variant ranker behind `contextRanker.mode` flag | No (ships regardless per user direction) |
| D | Close + docs | No |

---

## Acceptance criteria (preliminary)

- [ ] Analysis script runs against unified corpus; produces internal + external views.
- [ ] Decision doc explicit: no change / tune / redesign.
- [ ] Online telemetry emits ranker selection events for every IDE-orchestrated build.
- [ ] Variant ranker shipped behind `contextRanker.mode` flag (default `current`).
- [ ] `docs/context-ranker.md` covers ranker, modes, telemetry, tuning rationale.
- [ ] Full suite green.

---

## Notes for Wave 53b planning

When this stub becomes a full plan after Wave 53a lands:

- Confirm the unified corpus actually has the data the analyzer needs. If Wave 53a's migrations leave gaps, those surfaces inform the analyzer's interpretation.
- The goal classifier (`src/main/orchestration/providers/goalClassifier.ts`) is the bucketing tool — verify it still exists and runs as expected.
- Decision thresholds (≥70% hit rate → no tune; 40–70% → optional tune; <40% → redesign) carry over from the original Wave 52 plan.
