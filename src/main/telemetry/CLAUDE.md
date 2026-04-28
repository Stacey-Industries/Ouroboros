# Telemetry — SQLite store + parity queue

The SQLite-backed `telemetryStore` is the unified destination for structured
telemetry: `events`, `outcomes`, `orchestration_traces`, and
`research_invocations` tables. It is initialised at IDE startup before any
window is created.

Wave 52 added a queue+drain pipe so external Claude Code sessions (terminal
runs while the IDE is offline) can contribute telemetry. Hook scripts append
JSONL records to `~/.ouroboros/telemetry/queue/`; the IDE imports them on next
launch via `runParityQueueDrain()`. See `docs/telemetry-parity.md` for the full
architecture, hook contract, and migration recipe.

## Files

| File | Role |
|---|---|
| `telemetryStore.ts` | SQLite store — `getTelemetryStore()`, `record`, `recordOutcome`, `recordTrace`, `recordInvocation` |
| `outcomeObserver.ts` | In-memory correlation window; writes `outcomes` rows on PTY exit or conflict signal |
| `telemetryQueue.ts` | IDE-side queue append — `appendToQueue(surface, schemaVersion, payload)` |
| `telemetryDrain.ts` | Handler registry + drain loop — `registerSurfaceHandler`, `drainQueue` |
| `queueRotation.ts` | Size caps — `shouldRollFile` (10 MB per-file), `enforceTotalDirCap` (100 MB total) |
| `telemetryDrainStartup.ts` | Boot wrapper — `runParityQueueDrain()`; gated by `telemetry.parityQueue.enabled` |

## Gotchas

- **Unknown `schemaVersion` is skipped, not crashed.** Forward-compat is
  guaranteed: if a newer hook writes a version the current IDE drain handler
  doesn't recognise, the record is logged at warn and skipped. Never crash on
  unknown schema.
- **Drain is best-effort; no loss tolerance is built in.** A handler that
  throws counts the record as errored and moves on. Processed files with errors
  are retained in `processed/` for human review but are not re-drained.
- **Hook helper is intentionally pure-Node.** `assets/hooks/lib/telemetryQueueAppend.mjs`
  must not import from `src/`. It runs in hook subprocesses where the IDE is
  not loaded. Electron modules will not resolve.
- **`runParityQueueDrain()` must be called after drain handlers are registered.**
  Registrations happen in `main.ts` before `runParityQueueDrain()`. Adding a
  new surface handler without registering it before the drain call means its
  queue records are skipped on the first launch.
- **Dedup key is per-surface, not global.** For surfaces that fire once per
  session, dedup on `sessionId`. For surfaces that fire multiple times per
  session (e.g. graph-usage), do NOT use session-level dedup — each record is
  independently significant.
