# Wave 70 (proposed) — Telemetry archival completion

**Status:** WAVE-IT — single phase, ~30-40 lines of wiring + tests
**Source:** `roadmap/audit-verification-pass.md` Section D, item #7 (broadened to bundle siblings HIGH-A, HIGH-B from `roadmap/archive/waves-15-29-review-addendum.md`)
**Filed:** 2026-05-01

## Summary

Three Wave 15-29 telemetry items where the infrastructure was 90% built but the startup wire was missed. They share a target file (`mainStartup.ts`), risk profile, and verification path. Bundling gives a single soak window.

The user-facing requirement that drives the framing: **historical telemetry should be preserved indefinitely**, not purged. The fix is to wire the dormant JSONL mirror as a permanent archive layer alongside the live SQLite DB. SQLite stays fast; JSONL keeps everything.

## The architecture

Hot/cold tiered storage — industry-standard for observability data:

| Tier | Format | Role | Retention |
|---|---|---|---|
| **Hot** | SQLite (`telemetry.db`) | Live indexed queries. Auto-router working set. | 30 days (cache eviction, not deletion) |
| **Cold** | JSONL (`userData/telemetry-archive/events-YYYY-MM-DD.jsonl.gz`) | Permanent archive. Grep-friendly, compresses ~10×. | Forever |

Every event dual-writes: one SQLite row + one JSONL line. SQLite purge becomes pure cache eviction — the data still lives in JSONL.

**Estimated disk:** ~100-300 KB/day compressed, ~50 MB/year, ~500 MB/decade. Negligible on modern hardware.

**Failure modes:**
- JSONL is append-only and atomic per line. App crash mid-write loses at most the partial line.
- SQLite stays the primary query interface. JSONL is purely the long-tail backup.
- Mirror-write failures don't block SQLite writes (fire-and-forget alongside DB write).

## The three items being wired

### HIGH-A — `traceBatcher` never initialised or drained in production

- **Where:** `src/main/telemetry/traceBatcher.ts:131` (`initTraceBatcher`), `:145` (`drainTraceBatcher`).
- **Verified by addendum:** Zero production callers — only test file. `enqueueTrace` is called from `claudeStreamJsonRunner.ts:158, 244, 248` but pushes go into a module-level queue whose flush interval was never started.
- **Impact:** `orchestration_traces` table is never written in production. Wave 29.5 Phase I claimed C5 was wired but only the `enqueueTrace` call sites were wired — the batcher lifecycle was not. All orchestration trace data silently dropped.
- **Fix:** Call `initTraceBatcher()` once during main-process startup (in `mainStartup.ts` alongside `initTelemetryStore`). Call `drainTraceBatcher()` in the `will-quit` handler in `main.ts`, before `closeTelemetryStore()`. Add a startup smoke test.
- **Blocks:** Auto-router (Wave 31 learned ranker), context outcome correlation. Both rely on `orchestration_traces` per the Wave 29.5 plan.

### HIGH-B — Telemetry JSONL mirror never instantiated

- **Where:** `src/main/telemetry/telemetryJsonlMirror.ts:101` (`createTelemetryJsonlMirror`).
- **Verified by addendum:** Zero production callers — only barrel export and test file. `main.ts` calls `initTelemetryStore(app.getPath('userData'))` with no mirror companion.
- **Impact (original):** Wave 15 plan promised dual-write to SQLite and JSONL for operator-level grepability. Only SQLite is written. The 10 MB rotation and 30-day `purgeOldFiles` advertised in Wave 15 §1 do not run.
- **Reframe:** This *is* the archive layer. Wire it live, but with retention set to "forever" (or 10 years as a defensive ceiling), so it serves as the permanent record.
- **Fix:**
  - Instantiate the mirror in `initTelemetryStore` (or alongside it in `mainStartup.ts`)
  - Set rotation: daily file (`events-YYYY-MM-DD.jsonl`), 10 MB cap per file with sub-rotation if breached (`events-YYYY-MM-DD.N.jsonl`)
  - Daily gzip task: compress files older than 1 day to `.jsonl.gz`
  - Do NOT call `purgeOldFiles`, OR call it with a retention of 3650 days (10 years)
  - Add integration coverage that writes via the store and asserts a JSONL line appeared

### HIGH-D — Telemetry SQLite retention purge has no scheduler

- **Where:** `src/main/telemetry/telemetryStoreHelpers.ts:189` (`purgeRetainedRows`). Only called inside tests.
- **Impact:** `telemetry.db` grows without bound. The 30-day retention advertised in Wave 15 plan does not run.
- **Reframe:** With JSONL archive (HIGH-B) wired, the SQLite purge becomes pure cache eviction. The 30-day SQLite window is the auto-router's working set; JSONL has the full history.
- **Fix:**
  - Call `purgeRetainedRows(db, 30 * 24 * 60 * 60 * 1000)` once at startup
  - Schedule `setInterval(() => purgeRetainedRows(db, ...), 24 * 60 * 60 * 1000)` daily
  - Set `PRAGMA auto_vacuum = INCREMENTAL` at db init so reclaimed pages don't bloat the file
  - Optional: weekly `PRAGMA incremental_vacuum` to actively shrink

## Wave shape

Single phase. Suggested order:

1. **Wire `initTraceBatcher` / `drainTraceBatcher`** in `mainStartup.ts` + `main.ts` `will-quit`
2. **Instantiate `telemetryJsonlMirror`** in `mainStartup.ts` with retention set high or disabled
3. **Wire daily `purgeRetainedRows`** + startup call + `auto_vacuum = INCREMENTAL` PRAGMA
4. **Add daily gzip task** for JSONL files older than 1 day (separate `setInterval`)
5. **Smoke test** — startup → write one event → confirm SQLite row + JSONL line appear → fast-forward 31 days (test clock) → confirm SQLite row purged but JSONL line still there

## Risk surface

- **Disk growth runaway** — mitigated by gzip rotation and the small absolute volume (~50 MB/year)
- **Mirror-write IO contention** — mitigated by fire-and-forget pattern; mirror is async to SQLite write
- **Crash mid-write** — mitigated by JSONL's append-only line-level atomicity
- **Reading old JSONL.gz files** — supported by `zgrep`, `zcat`, Python `gzip` module, jq via `gzcat | jq` — no special tooling needed

## Out of scope (sibling HIGH items, not bundled)

These were called out in the same `waves-15-29-review-addendum.md` but are different shape:

- **HIGH-E** — worktree GC gap (`sessionGc.ts` doesn't call `worktreeManager.remove()`). Different subsystem.
- **HIGH-F** — graph indexer follows symlinks unchecked. Security issue in `indexingPipelineSupport.ts`.
- **HIGH-G** — side chat drawer conversation body unimplemented. UI feature gap.

Each deserves its own ticket.

## References

- `src/main/telemetry/traceBatcher.ts` — HIGH-A target
- `src/main/telemetry/telemetryJsonlMirror.ts` — HIGH-B target
- `src/main/telemetry/telemetryStoreHelpers.ts` — HIGH-D target
- `src/main/mainStartup.ts` — integration target
- `src/main/main.ts` `will-quit` handler — drain target
- Audit: `roadmap/audit-verification-pass.md` Section D item #7
- Source addendum: `roadmap/archive/waves-15-29-review-addendum.md` (HIGH-A, HIGH-B, HIGH-D)
- Wave 15 telemetry plan promises (live SQLite + JSONL mirror + 30-day retention)
- Wave 29.5 Phase I claim that orchestration_traces was wired
