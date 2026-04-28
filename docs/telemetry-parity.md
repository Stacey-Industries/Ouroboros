# Telemetry Parity — Architecture & Migration Guide

Ouroboros telemetry is backed by a SQLite store and several JSONL files under
`~/.ouroboros/telemetry/`. Before Wave 52 every emit site fired only when the
IDE's main process was running. External Claude Code sessions — terminal runs
where the IDE is closed — silently produced no telemetry. Because the user
frequently works that way, the corpus fed to Auto Effort, Auto Model, the
context ranker, and the research/retrain loop was biased toward IDE-orchestrated
sessions only.

**Telemetry parity** closes that gap: hook scripts run inside every Claude Code
session (IDE-orchestrated or not), append records to local queue files, and the
IDE imports those records the next time it starts. The hook never needs to reach
the IDE process; the queue is a plain JSONL file on disk.

---

## Architecture

```
External session (IDE may be offline)
  │
  └─ Claude Code fires a hook event (SessionStart / UserPromptSubmit / etc.)
       │
       └─ assets/hooks/<name>.mjs  (hook script, pure Node)
            │
            └─ assets/hooks/lib/telemetryQueueAppend.mjs
                 │
                 └─ appends one JSON line to
                    ~/.ouroboros/telemetry/queue/<surface>.jsonl
                    (append-only; script never reads or seeks)

                    OR (for hook-events surface only):
                    ouroboros.mjs sendEvent() write-on-fail fallback fires
                    when the IDE named pipe is unreachable — never on success.

IDE startup (next launch)
  │
  └─ telemetryDrainStartup.ts: runParityQueueDrain()
       │  (gated by telemetry.parityQueue.enabled — default true)
       │
       ├─ queueRotation.enforceTotalDirCap()   ← oldest-N drop if >100 MB
       │
       └─ telemetryDrain.drainQueue()
            │
            ├─ for each <surface>.jsonl in queue/:
            │    ├─ fs.renameSync → processed/<surface>.jsonl   ← atomic commit
            │    ├─ parse lines → QueueRecord[]
            │    └─ dispatch to registered SurfaceHandler
            │         ├─ validate schemaVersion
            │         ├─ dedup (handler-specific key)
            │         └─ forward to sink (JSONL / SQLite)
            │
            └─ delete processed/<file> on full success;
               leave on partial failure for human review
```

**Three layers:**

| Layer | Files | Responsibility |
|---|---|---|
| Hook script | `assets/hooks/<name>.mjs` | Capture data from hook event; call append helper |
| Queue helper | `assets/hooks/lib/telemetryQueueAppend.mjs` | Pure-Node append; UUID, timestamp, wire format |
| Drain handler | `src/main/<subsystem>/<surface>DrainHandler.ts` | Validate, dedup, forward to sink |

**Primitives (all in `src/main/telemetry/`):**

| File | Export | Role |
|---|---|---|
| `telemetryQueue.ts` | `appendToQueue` | IDE-side queue append (mirrors hook helper) |
| `telemetryDrain.ts` | `registerSurfaceHandler`, `drainQueue` | Handler registry + drain loop |
| `queueRotation.ts` | `shouldRollFile`, `enforceTotalDirCap` | Per-file 10 MB cap, total 100 MB cap |
| `telemetryDrainStartup.ts` | `runParityQueueDrain` | Boot wrapper — flag gate + error containment |

---

## Surfaces shipped

Four surfaces were migrated across Wave 52 (Phase C) and Wave 53a (Phases A, B, C).

| Surface | Hook event | Hook script | Drain handler | Schema |
|---|---|---|---|---|
| `spawn-cost` | SessionStart | `assets/hooks/session_start_spawn_cost.mjs` | `src/main/orchestration/providers/spawnCostDrainHandler.ts` | inline in `mcpSpawnCostTelemetry.ts` |
| `hook-events` | Pre/PostToolUse, SessionStart/End, UserPromptSubmit, agent\_\*, task\_completed | `assets/hooks/lib/ouroboros.mjs` (write-on-fail fallback in `sendEvent`) | `src/main/telemetry/hookEventsDrainHandler.ts` | `src/main/telemetry/hookEventsSchema.ts` |
| `spawn-trace` | SessionStart | `assets/hooks/session_start_spawn_cost.mjs` (Phase B extension — second `appendToTelemetryQueue` call) | `src/main/telemetry/spawnTraceDrainHandler.ts` | `src/main/telemetry/spawnTraceSchema.ts` |
| `router-shadow` | UserPromptSubmit | `assets/hooks/user_prompt_submit_router_shadow.mjs` | `src/main/router/routerShadowDrainHandler.ts` | `src/main/router/routerShadowSchema.ts` |

What each surface feeds downstream:

- **`spawn-cost`** → `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` (MCP routing cost per session).
- **`hook-events`** → `telemetryStore.record` (events table), `tapEditProvenance`, `tapGraphUsage`, conflict outcome correlation, terminal quality signals.
- **`spawn-trace`** → `traceBatcher` → `orchestration_traces` SQLite table (spawn argv + cwd hash).
- **`router-shadow`** → `shadowRouteHookEvent({ postHoc: true, weightsVersion })` → `router-decisions.jsonl`.

---

## Per-surface schema discipline

Each surface is defined by a TS schema file imported by its drain handler. Hook
scripts cannot import TypeScript, so they carry a hand-mirrored comment block at
the top of the file. The contract:

1. **Schema file** (`<surface>Schema.ts`) — exports the record type and
   `<SURFACE>_SCHEMA_VERSION` constant. This is the single source of truth.
2. **Hook script mirror** — a comment block at the top of the hook script
   reproduces the record shape exactly, tagged with the drain handler path,
   schema source, and schema version.
3. **Bump protocol** — when the payload shape changes in a backward-incompatible
   way: bump the `SCHEMA_VERSION` constant, update the hook's mirror comment,
   update the drain handler's accepted-version list.
4. **Unknown versions are skipped, not crashed.** Drain handlers call
   `registerSurfaceHandler(surface, handler, [SCHEMA_VERSION])`. Records with
   an unrecognized version are logged at warn and counted as skipped. This lets
   a newer hook co-exist with an older IDE without breaking startup.
5. **Future improvement (out of scope Wave 53a):** codegen the hook helper from
   the TS schema so the comment-mirror discipline becomes automatic. See
   `roadmap/wave-53a-plan.md` "Out-of-wave follow-ups."

---

## Dedup policies per surface

| Surface | Dedup key | Why |
|---|---|---|
| `spawn-cost` | `(sessionId)` — reads existing `mcp-spawn-cost.jsonl` at init | One spawn = one cost record |
| `hook-events` | `(sessionId, eventId)` — in-memory Set across drain run | N events per session is legitimate; each carries a unique eventId |
| `spawn-trace` | `(sessionId)` — DB query per record | One spawn = one trace; IDE-side record wins if present |
| `router-shadow` | `(sessionId)` — live record beats drain record | IDE-up sessions already have a live shadow record; drain record skipped if sessionId found in `router-decisions.jsonl` |

The drain core does not deduplicate. Each surface's handler declares its own
key. For surfaces where multiple records per session are legitimate (e.g.
`hook-events`), the handler must NOT use session-level dedup.

---

## Accepted IDE-only gaps

The following surfaces are classified `fundamentally-IDE-only` in
`roadmap/wave-52-audit.md`. They remain unmigrated; the gap is accepted.

| Surface | Audit row | Source | Why fundamentally IDE-only | What's lost |
|---|---|---|---|---|
| Context outcomes | #5 | `hooksContextOutcome.ts` | Requires in-memory `ContextPacket` built by IDE context pipeline | Per-turn used/missed/unused file classification |
| Stream traces stdin/stdout | #7 half | `claudeStreamJsonRunner.ts` | Subprocess stdout/stdin are invisible to hook scripts | Model prose between tool calls; stdin prompt bytes |
| Pre-tool research traces | #8 | `preToolResearchOrchestrator.ts` | Decision algorithm needs IDE-side cache + correction store | Research fire/dryrun decision provenance |
| Fact-claim traces | #9 | `factClaimPauseOrchestrator.ts` | Operates on streaming model output chunks | Fact-claim detection events and confidence scores |
| Research invocations | #10 | `researchSubagent.ts` | Research path doesn't exist in external CLI | Invocation correlation IDs, latency, cache hits |
| Session lifecycle | #11 | `sessionLifecycle.ts` | "Session" is an IDE renderer concept (chat thread) | Chat thread metadata; session.created/activated/archived |
| Chat regen/correction | #12 half | `chatOrchestrationRequestSupport.ts` | Chat orchestration path is IDE-only | chat\_regenerate / chat\_correction quality signals |
| Context decisions | #15 | `contextDecisionWriter.ts` | Context selection runs in IDE main process only | Which files were picked and their scores |
| Research outcomes | #16 | `researchOutcomeWriter.ts` | Downstream of #10 | Research-attributed file touches; correction records |
| Startup timings | #17 | `perfStartupLog.ts` | Measures the IDE itself; no external analogue | N/A |

The user-visible cost of these gaps: external-session corpora under-represent
PTY-shaped failure signals, deep streaming traces, IDE-side context-selection
quality, and research/correction signals. The unified corpus is representative
for **routing decisions, tool-shape choices, edit provenance, conflict outcomes,
terminal session boundaries, and MCP cost** — which is what Wave 53b's ranker
needs.

---

## Queue lifecycle

**File locations:**

```
~/.ouroboros/telemetry/
  queue/
    spawn-cost.jsonl          ← hook appends here
    hook-events.jsonl
    spawn-trace.jsonl
    router-shadow.jsonl
    <surface>.jsonl.1         ← rolled when primary exceeds 10 MB
  processed/
    spawn-cost.jsonl          ← IDE moves here before reading (atomic commit)
```

**Per-file cap (10 MB):** `telemetryQueue.ts` calls `shouldRollFile()` before
each append. If the file is at or above `PER_FILE_CAP_BYTES`, it is renamed to
`<surface>.jsonl.<n>` and a fresh file is started. The hook helper does not
enforce this cap — extra bytes are tolerated until the IDE next rolls.

**Total directory cap (100 MB):** `enforceTotalDirCap()` runs at IDE startup
before the drain. Oldest files are deleted until the total drops below
`TOTAL_DIR_CAP_BYTES`.

**Atomic move:** `drainQueue()` renames each `queue/<file>` to
`processed/<file>` using `fs.renameSync`. After rename the queue slot is empty;
new hook appends start a fresh file. If the IDE crashes after renaming but
before finishing, the file remains in `processed/` and is **not** re-processed
on the next launch.

---

## Drain semantics

```typescript
interface DrainSummary {
  filesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;   // unknown surface, unsupported schemaVersion, bad JSON
  recordsErrored: number;   // handler threw
}
```

**Idempotent across restarts.** Once renamed to `processed/`, re-running
`drainQueue()` will not touch that file.

**Forward-compatible.** An unknown `surface` key or unsupported `schemaVersion`
is logged at warn and counted as skipped. Startup never crashes on bad records.

**Best-effort.** Each record's dispatch is wrapped in try/catch. A handler that
throws counts the record as errored and moves on.

---

## Hook contract (wire format)

Every queue record has this shape:

```jsonc
{
  "recordId":      "<UUID v4>",
  "ts":            1714300000000,
  "surface":       "hook-events",
  "schemaVersion": 1,
  "payload":       { /* surface-specific fields */ }
}
```

- `recordId` — UUID v4, generated at append time.
- `surface` — stable string constant; changing it is a breaking change.
- `schemaVersion` — bump on backward-incompatible payload changes.
- File is **append-only line-oriented JSON**. Hook never seeks, never reads.
- **Hook scripts MUST never throw.** Wrap all logic in try/catch. Log to
  `process.stderr` only.

---

## Manual hook installation

**Wave 53a Phase E will auto-install all four hooks via `hookInstallerSettings.ts`.**
Until Phase E ships, add them manually to `~/.claude/settings.json` under the
appropriate hook event key. Append inside the inner `hooks` array; never replace
existing entries.

### spawn-cost (Wave 52)

```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\Web App\\Agent IDE\\assets\\hooks\\session_start_spawn_cost.mjs\""
          }
        ]
      }
    ]
  }
}
```

### spawn-trace (Wave 53a Phase B — same script as spawn-cost)

`spawn-trace` is written by the same `session_start_spawn_cost.mjs` script via a
second `appendToTelemetryQueue` call. No additional hook entry needed — installing
`spawn-cost` above also enables `spawn-trace`.

### hook-events (Wave 53a Phase A — write-on-fail, no dedicated entry)

The `hook-events` fallback fires automatically inside `ouroboros.mjs`
`sendEvent()` whenever the IDE pipe is unreachable. It piggybacks on the
existing hook scripts in the `PreToolUse`, `PostToolUse`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd` families. No dedicated settings.json entry is
needed — if those hook scripts are already registered (standard IDE setup), the
fallback activates automatically.

### router-shadow (Wave 53a Phase C)

```jsonc
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\Web App\\Agent IDE\\assets\\hooks\\user_prompt_submit_router_shadow.mjs\""
          }
        ]
      }
    ]
  }
}
```

**Verification (after one external session + IDE restart):**

```bash
# spawn-cost
cat ~/.ouroboros/telemetry/mcp-spawn-cost.jsonl | grep '"ideSession":false'

# hook-events — check queue was written and drained
ls ~/.ouroboros/telemetry/processed/

# spawn-trace — check orchestration_traces DB
sqlite3 ~/.ouroboros/telemetry/telemetry.db \
  "SELECT sessionId, kind FROM orchestration_traces WHERE kind='spawn' LIMIT 5"

# router-shadow
cat ~/.ouroboros/telemetry/router-decisions.jsonl | grep '"postHoc":true' | head -3
```

---

## Recipe — adding a new surface

Use Wave 52 (`spawn-cost`) and Wave 53a (Phases A, B, C) as exemplars:

- **Shared-library fallback shape** (like `hook-events`): extend an existing hook
  helper's failure path to call `appendToTelemetryQueue`. Drain handler routes by
  `eventType`. See `ouroboros.mjs` + `hookEventsDrainHandler.ts`.
- **Additive payload to existing hook** (like `spawn-trace`): add a second
  `appendToTelemetryQueue` call in an existing hook script for a new surface.
  Drain handler and schema file are independent. See `session_start_spawn_cost.mjs`
  + `spawnTraceDrainHandler.ts`.
- **New dedicated hook** (like `router-shadow`): new `assets/hooks/<event>_<surface>.mjs`,
  new drain handler, new schema file, new `settings.json` entry. See
  `user_prompt_submit_router_shadow.mjs` + `routerShadowDrainHandler.ts`.

**Steps for any new surface:**

1. Pick the Claude Code hook event (see `roadmap/wave-52-audit.md`).
2. Write the hook script. Define `SURFACE` and `SCHEMA_VERSION` as constants.
   Include a schema-mirror comment block at the top.
3. Create `<surface>Schema.ts` with the record type and version constant.
4. Write the drain handler. Import the schema file. Implement per-surface dedup.
5. Write tests: valid record imported, bad payload skipped, dedup skipped,
   unknown schemaVersion skipped.
6. Register the handler in `src/main/main.ts` before `runParityQueueDrain()`.
7. Add the hook to `~/.claude/settings.json` (manually until Phase E ships).
8. Update this doc.

---

## Wave 53b unblocked

Wave 53a delivers the unified corpus needed for the original Wave 52 ranker
measurement (now Wave 53b). Wave 53b runs offline analysis on internal +
external sessions for the first time.

The accepted gaps above mean the corpus will be representative for routing
decisions, tool-shape choices, edit provenance, conflict outcomes, terminal
session boundaries, and MCP cost — which is what the ranker analysis actually
needs.

Use the `weightsVersion` field in `router-shadow` drain records to split
session-time vs drain-time shadow decisions. `postHoc: true` marks drain-time
records; `postHoc: false` (or absent) marks live session-time records.

See `roadmap/wave-53b-plan.md` and `roadmap/wave-52-audit.md` for cross-reference.
