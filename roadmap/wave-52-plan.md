# Wave 52 — Telemetry Parity: Audit + Queue Infrastructure + First Migration

## Implementation Plan

**Status:** READY (reframed 2026-04-27 — original ranker-measurement scope deferred to Wave 53b once telemetry corpus is unified)
**Version target:** v2.9.1 (patch — no user-visible behavior change yet; foundation for parity)
**Feature flags:** new `telemetry.parityQueue.enabled` (default `true` — safe to enable; queue drain is a strict-add to startup)
**Dependencies:** Waves 48 ✅ (initial telemetry), 50 ✅ (graph tap arg-capture fix), 51 ✅ (mcpSpawnCostTelemetry — first IDE-only sink to migrate)
**References:**
- `src/main/telemetry/telemetryStore.ts` — SQLite-backed structured store; the unified destination.
- `src/main/hooksGraphUsageTap.ts` — example global-hook pattern (already fires for both internal and external).
- `src/main/orchestration/providers/mcpSpawnCostTelemetry.ts` — Wave 51 IDE-only sink; Phase C migrates it.
- `assets/hooks/pre_tool_use.mjs` and other hook scripts under `assets/hooks/`.
- `~/.claude/settings.json` — global hook registrations.

---

## Why this wave was reframed

The original Wave 52 (ranker measurement) assumed the historical session corpus was representative. Verification revealed the corpus is **biased toward IDE-orchestrated sessions** because every IDE-only telemetry sink (`mcpSpawnCostTelemetry`, `outcomeObserver`, `traceBatcher`, etc.) silently drops data for external (terminal CLI) sessions. The user routinely uses external sessions while the IDE isn't running — so the data pool the ranker, Auto Effort, Auto Model, and other features depend on is incomplete.

Running the original ranker analysis against this biased corpus would produce conclusions that don't generalize to the user's actual workflow. The right sequence is: **fix the corpus first, then analyze**.

Wave 52 (reframed) ships the foundation: an audit of every IDE-only emit site, plus the queue+drain pipe that lets external sessions log telemetry which the IDE imports on next launch. Wave 53a migrates the remaining IDE-only sinks through the pipe. Wave 53b runs the original ranker measurement on the now-unified corpus.

---

## Overview

The architectural pattern, identical for every emit site:

```text
External session
  ↓ hook fires (PreToolUse / PostToolUse / SessionStart / SessionEnd / etc.)
  ↓ writes JSONL line to ~/.ouroboros/telemetry/queue/<surface>.jsonl
  ↓ (IDE may or may not be running — irrelevant; hook is self-contained)

IDE startup (next launch)
  ↓ telemetryDrain scans queue/
  ↓ atomic move: queue/<file>.jsonl → processed/<file>.jsonl
  ↓ parse + validate by schemaVersion
  ↓ insert into telemetryStore (SQLite) — UUID dedup
  ↓ feed downstream consumers (router exporter, outcome observer, ranker analysis, etc.)
  ↓ delete processed/<file>.jsonl on success
```

**Key design calls:**

- **Queue files are append-only line-oriented JSON.** Hook never seeks; never reads; just appends. Crash-safe by virtue of being write-only.
- **Atomic move before drain** ensures partial drain never re-imports records. If drain crashes mid-import, restart resumes from `processed/`.
- **Every record carries `schemaVersion`.** Drain handles forward compatibility (skip unknown versions, log warning, do not crash).
- **Every record carries a UUID `recordId`.** Drain uses `INSERT OR IGNORE` keyed on `recordId` for idempotence — re-running drain over the same file is safe.
- **Size cap + rotation policy.** Per-file cap (e.g., 10MB), total directory cap (e.g., 100MB), oldest-N drop policy if cap exceeded. Hook detects cap and logs to a degraded sink rather than blocking the user's session.
- **Drain is best-effort.** A malformed record is logged and skipped, never crashes the IDE startup.

---

## Implementation review summary

### Confirmed state (2026-04-27)

- ✅ `telemetryStore.ts` with SQLite — initialized at IDE main-process startup. Tables: `events`, `outcomes`, `orchestration_traces`, `research_invocations`. Will be the unified destination for all migrated surfaces.
- ✅ Wave 48 hook-script pattern (`assets/hooks/pre_tool_use.mjs` etc.) proves global hooks fire for both internal and external sessions.
- ✅ Wave 50's `hooksGraphUsageTap.ts` is the only existing surface where external session data is captured — the pattern is reusable.
- ✅ Wave 51's `mcpSpawnCostTelemetry.ts` is the smallest IDE-only sink — perfect Phase C migration target.
- ❌ No queue+drain primitives exist. Phase B builds them.
- ❌ No comprehensive audit of IDE-only emit sites exists. Phase A produces it.

### Out-of-scope for Wave 52

- Migrating sinks beyond `mcpSpawnCostTelemetry` — Wave 53a covers the rest based on Phase A's audit.
- Running the ranker measurement — Wave 53b on the unified corpus.
- Building a hook-installation UI — installation remains manual via `~/.claude/settings.json` for this wave.

---

## Phase A — Telemetry surface audit

**Goal:** Read-only inventory of every IDE-only telemetry emit site, classified by what's needed to bring it to external-session parity.

### New files

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-52-audit.md` | ~300 | Per-emit-site row: location (file:line), what's logged, current sink, classification (`global-hookable` / `buffer-via-hook` / `fundamentally-IDE-only`), required hook event, effort estimate. Drives Wave 53a's migration plan. |

### Subagent briefing

- **Read first:**
  - `roadmap/wave-52-plan.md` (this file — for context)
  - `src/main/telemetry/` (full directory)
  - `src/main/hooksGraphUsageTap.ts`, `assets/hooks/pre_tool_use.mjs` (example global-hook flow)
  - `src/main/orchestration/providers/mcpSpawnCostTelemetry.ts` (Wave 51 IDE-only sink — the exemplar gap)
- **Find every emit site.** Grep for `getTelemetryStore`, `recordEvent`, `appendFile.*jsonl`, `getOutcomeObserver`, `enqueueTrace`, `qualitySignalCollector`, `routerExporter` and similar. List each emit site with file:line.
- **Classify each:**
  - `global-hookable` — already capturable via existing global hooks; just needs a JSONL fallback when IDE pipe is unreachable.
  - `buffer-via-hook` — IDE-only today; can be captured by a new hook on the right Claude Code event (SessionStart / UserPromptSubmit / SessionEnd / PostToolUse / etc.).
  - `fundamentally-IDE-only` — requires inspection only the IDE's main process can do (e.g., watching its child Claude Code subprocess's stdout). Document the gap; accept reduction.
- **For each `buffer-via-hook` row,** name the Claude Code hook event that would capture the data and estimate complexity.
- **Note any sinks that go directly to file paths under `~/.ouroboros/telemetry/`** vs the SQLite store. Both are migration targets.

### Acceptance

- [ ] Audit doc lists every IDE-only emit site found in src/main/.
- [ ] Each row has classification + required hook event (where applicable) + effort estimate.
- [ ] Summary table at top: total sites, breakdown by classification.
- [ ] Recommendations for Wave 53a's migration order (smallest/safest first).
- [ ] Commit: `docs(wave-52): Phase A — telemetry surface audit`

---

## Phase B — Queue + drain primitives

**Goal:** Build the defer-and-batch infrastructure that Phase C and Wave 53a will use.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/telemetry/telemetryQueue.ts` | ~180 | `appendToQueue(surface, record)` — atomic append to `~/.ouroboros/telemetry/queue/<surface>.jsonl`. Adds `recordId` (UUID), `ts`, `schemaVersion`. Tolerates filesystem errors (logs, doesn't throw). Size-cap detection. |
| `src/main/telemetry/telemetryQueue.test.ts` | ~180 | Append, schema-version field, recordId uniqueness, cap detection. Mocked fs. |
| `src/main/telemetry/telemetryDrain.ts` | ~240 | `drainQueue()` — invoked at IDE startup. Scans queue/, atomic-moves files to processed/, parses each line, dispatches by surface to a registered handler, deletes processed/<file> on full success. Forward-compatible: unknown schemaVersions skipped with warn. Idempotent: re-running drain over the same file is safe. |
| `src/main/telemetry/telemetryDrain.test.ts` | ~240 | Drain happy path; partial-failure recovery; idempotency; unknown schemaVersion handling; drain handler dispatch. |
| `src/main/telemetry/queueRotation.ts` | ~120 | Rotation policy: total dir size cap (default 100MB), oldest-N drop when exceeded. Per-file size cap (default 10MB) — append-side rolls to `<surface>.jsonl.<n>`. |
| `src/main/telemetry/queueRotation.test.ts` | ~120 | Cap enforcement, rotation correctness. |
| `assets/hooks/lib/telemetryQueueAppend.mjs` | ~80 | Hook-side helper. Pure Node, no IDE deps. Used by hook scripts to append a record to the queue. Identical wire format to `telemetryQueue.ts` so the IDE can drain hook-written records. |

### Modified files

| File | Change |
|---|---|
| `src/main/main.ts` | Call `drainQueue()` after `initTelemetryStore()` during startup. Wrap in try/catch so a drain failure doesn't block IDE launch. |
| `src/main/configSchemaTailExt.ts` | Add `telemetry.parityQueue.enabled` (default `true`). |
| `src/main/configAppTypes.ts` | Add the matching field. |

### Subagent briefing

- **Read first:** Phase A audit (for context on what surfaces will use this), `mcpSpawnCostTelemetry.ts` (the existing sink pattern — Phase C migrates it).
- **Atomic move pattern:** rename queue/<file> → processed/<file> using `fs.renameSync`. POSIX rename is atomic on same filesystem; we mandate same fs by using a single root.
- **UUID generation:** use `crypto.randomUUID()` (Node built-in, no dependency).
- **`schemaVersion` is per-surface,** not global. The drain dispatches by surface name; each surface's handler knows which versions it supports.
- **Hook-side helper (`telemetryQueueAppend.mjs`)** must use ONLY Node built-ins (no electron, no main-process deps). It's loaded by hook subprocess that may run without the IDE.
- **Size-cap detection in append:** before write, check current file size; if cap exceeded, rotate to numbered file. Log to stderr (hook output is not user-facing).
- **Drain handlers are registered, not hardcoded.** Phase C registers the spawn-cost handler. Wave 53a registers more.
- **ESLint:** max-lines-per-function 40, complexity 10, max-lines 300, max-depth 3, max-params 4, no console.log (use `log` from `../logger` in main; hook helper uses `console.error` for stderr only).
- **Test policy: scoped only.** Run new test files. Skip full suite.

### Acceptance

- [ ] `telemetryQueue.ts` appends records with `recordId`, `ts`, `schemaVersion`, `surface`. Tolerates filesystem errors.
- [ ] `telemetryDrain.ts` drains atomically; idempotent; forward-compatible.
- [ ] `queueRotation.ts` enforces caps; oldest-N drop on overflow.
- [ ] Hook helper appends compatible records.
- [ ] `drainQueue()` is wired into `main.ts` startup behind `telemetry.parityQueue.enabled` flag.
- [ ] All scoped tests pass; lint + tsc clean.
- [ ] Commit: `feat(wave-52): Phase B — queue + drain primitives`

---

## Phase C — First migration: spawn-cost via the queue

**Goal:** Migrate Wave 51's `mcpSpawnCostTelemetry` from IDE-only emit to hook+queue+drain. Proves the pipe works end-to-end.

### New files

| File | ~Lines | Description |
|---|---|---|
| `assets/hooks/session_start_spawn_cost.mjs` | ~140 | SessionStart hook. Reads spawn metadata (cwd, model, mcp config bytes) from event payload + a small read of `.claude/settings.json` for the active MCP servers. Builds a record matching `mcpSpawnCostTelemetry` shape. Calls `telemetryQueueAppend.mjs` helper. |
| `src/main/orchestration/providers/spawnCostDrainHandler.ts` | ~140 | Drain handler for the `spawn-cost` surface. Validates schemaVersion; on success, forwards record to existing `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` sink (and any future SQLite mirroring). Same record shape as Wave 51's IDE-side emitter so downstream analyzers don't notice the source. |
| `src/main/orchestration/providers/spawnCostDrainHandler.test.ts` | ~140 | Schema validation, sink forwarding, dedup. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/scopedMcpConfig.ts` | The IDE-side emit stays as-is (still fires for internal sessions). It's now a parallel path — internal sessions emit directly + the hook also fires for them. The drain handler dedupes by `recordId` so duplicates are dropped. |
| `assets/hooks/` (existing hook setup file or `~/.claude/settings.json` registration template) | Register `session_start_spawn_cost.mjs` as a SessionStart hook. Wave 52 documents the addition; user installs manually. |
| `src/main/main.ts` startup | Register `spawnCostDrainHandler` with the drain at boot. |

### Subagent briefing

- **Read first:** Wave 51's `mcpSpawnCostTelemetry.ts` for the record shape, `assets/hooks/pre_tool_use.mjs` for the hook script style.
- **Goal: external sessions now produce identical spawn-cost records to internal sessions.** Verify by running an external Claude Code session, then launching the IDE, then checking `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` for new records with `ide_session: false`.
- **Internal sessions: avoid duplicate records.** The IDE-side emitter and the hook will both fire for internal sessions. The drain handler dedupes by `recordId`. Hook-generated and IDE-generated records have different `recordId`s but the same `sessionId` — the handler's dedup key should be `(sessionId, surface)` to prevent two records per internal session. Decide and document.
- **Hook installation is documented, not automated.** Phase D's docs explain how the user adds the SessionStart entry to `~/.claude/settings.json`.
- **ESLint** standard rules. Hook script must use only Node built-ins.
- **Test policy: scoped only.**

### Acceptance

- [ ] SessionStart hook script written and tested (manually invoked with synthetic event).
- [ ] Drain handler registered; processes queued records.
- [ ] After the user installs the hook + restarts an external session + restarts the IDE, `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` shows new records with `ide_session: false`.
- [ ] Internal session dedup works: one record per spawn, not two.
- [ ] Scoped tests pass; lint + tsc clean.
- [ ] Commit: `feat(wave-52): Phase C — first migration: spawn-cost via queue`

---

## Phase D — Close + docs

**Goal:** Document the architecture; point Wave 53a at the audit; close cleanly.

### New files

| File | ~Lines | Description |
|---|---|---|
| `docs/telemetry-parity.md` | ~240 | Architecture diagram. Hook contract (record shape, schemaVersion rules). Queue lifecycle. Drain semantics (atomic move, idempotence). How to add a new surface (recipe). How to install hooks (manual `~/.claude/settings.json` instructions). Pointer to wave-52-audit.md and wave-53a-plan.md. |

### Modified files

| File | Change |
|---|---|
| `CLAUDE.md` (project root) | Add `docs/telemetry-parity.md` to "Further Reading". Update "Known Issues / Tech Debt" if relevant. |
| `roadmap/session-handoff.md` | Document Wave 52 outcome, point at Wave 53a (migration backlog) and Wave 53b (ranker measurement on unified corpus). |
| `src/main/telemetry/CLAUDE.md` (if exists; create if not, ≤200 lines) | Brief subsystem note pointing at the parity architecture. |

### Subagent briefing

- **Read first:** Phase A audit, Phase B + C deliverables, the existing `~/.claude/settings.json` to understand hook-registration shape.
- The doc is reader-first. Lead with the why, then the how.
- "How to add a new surface" recipe is concrete — list each file the implementer touches.
- Cross-reference Wave 53a as the place where remaining migrations land.

### Acceptance

- [ ] Doc covers architecture, hook contract, queue lifecycle, drain semantics, recipe, install steps.
- [ ] Cross-refs in CLAUDE.md and session-handoff.
- [ ] Commit: `docs(wave-52): Phase D — close + telemetry-parity doc`

---

## Subagent execution model

- **Model:** prefer `general-purpose` for cross-cutting work; `sonnet-implementer` for tight single-module phases (per the catalog feedback from waves 49-51).
- **Isolation:** sequential on `master`; no worktrees.
- **Test policy:** scoped vitest per phase; orchestrator runs full suite + lint + lint:claude-md at wave close.
- **Commit policy:** one per phase.
- **Push policy:** orchestrator reviews aggregate diff at wave close; single push.

### Phase dispatch order

1. **Phase A** — audit (foundational; orchestrator reviews before B)
2. **Phase B** — queue + drain primitives
3. **Phase C** — first migration (spawn-cost)
4. **Phase D** — close + docs

---

## Risks

| Risk | Mitigation |
|---|---|
| Queue grows unboundedly if user runs many external sessions without launching IDE. | `queueRotation.ts` enforces total dir cap (100MB) and oldest-N drop. Documented in Phase D. |
| Drain crashes on a malformed record and blocks startup. | Best-effort drain: each record's parse-and-dispatch is wrapped in try/catch. Failures logged; startup continues. |
| Hook script breaks the user's external session. | Hook scripts MUST never throw; failures logged to stderr (hook output) only. Tested explicitly. |
| Internal-session dedup fails; one spawn produces two telemetry records. | Drain handler keys dedup on `(sessionId, surface)`, not `recordId`. Tested. |
| Schema drift between hook script and IDE drain handler. | Every record carries `schemaVersion`; drain handler skips unknown versions and logs. Hook helper version is pinned in repo. |
| Subagent stops mid-phase (observed pattern). | Resume via SendMessage. Each phase commit is the recoverable checkpoint. |

---

## Acceptance criteria (wave-level)

- [ ] Four phase commits on `master`.
- [ ] `npx vitest run` (timeout 800) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run lint:claude-md` — 0 errors.
- [ ] Manual smoke (orchestrator):
  - [ ] Run an external Claude Code session with the new SessionStart hook installed.
  - [ ] Launch IDE; observe drain processes the queue file.
  - [ ] Verify a new record with `ide_session: false` appears in `mcp-spawn-cost.jsonl`.
- [ ] Audit doc, telemetry-parity doc, queue+drain code, first migration all landed.
- [ ] Wave 53a stub plan exists at `roadmap/wave-53a-plan.md` referencing the audit.
- [ ] Wave 53b stub plan exists at `roadmap/wave-53b-plan.md` referencing the unified corpus.
- [ ] Result brief at `roadmap/auto-briefs/wave-52-result.md`.
- [ ] Status flipped to ✅ COMPLETED.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Wave 53a** — migrate every remaining surface from Phase A's audit through the queue+drain pipe.
- **Wave 53b** — original ranker measurement (offline analysis + online telemetry + tuning) on the unified corpus.
- **Hook auto-install** — automate the `~/.claude/settings.json` hook registration so the user doesn't have to do it manually. Pairs with Wave 56's "Teams Mode" or earlier UI wave.
- **SQLite mirror** of all queued records — currently the spawn-cost migration goes to its existing JSONL sink; eventually all surfaces should mirror into the SQLite store for unified querying.
- **Drain throttling** — if the queue is large, drain in batches to avoid blocking startup.
