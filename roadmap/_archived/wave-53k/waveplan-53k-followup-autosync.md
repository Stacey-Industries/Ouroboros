# Wave 53k Follow-up — autoSync graph staleness investigation

**Status:** ✅ RESOLVED 2026-04-29. Both H1 and H3 root-causes fixed in
commits `27106cc` and `218b486`. Verification smoke confirmed
`hashes=3207 changed=0` on poll (was `hashes=0`) and `files=1` reindex
on file edit. Graph went from 3,327 nodes (partial, in the wrong DB) to
19,075 nodes (full Agent IDE codebase in the right DB).

The hypotheses below are kept for the historical record. The actual
fix shape was simpler than two of the three speculations:

- **H1 confirmed and fixed:** worker thread fell through to
  `path.join(process.cwd(), 'codebase-graph.db')` because
  `require('electron').app.getPath('userData')` from a worker context
  doesn't return a ready path. Two SQLite files existed
  (`<userData>/codebase-graph.db` 137 MB, main thread reads;
  `<projectRoot>/codebase-graph.db` 7.7 MB, worker writes). Fix:
  main thread resolves `getDbPath()` and passes it to the worker via
  `workerData: { dbPath }`.
- **H3 confirmed and fixed:** `AutoSyncWatcher.receiveWatcherEvent` had
  zero callers. Wired up `@parcel/watcher` in
  `systemTwoRegistry.acquire()` with the same ignore globs the
  file-tree watcher uses.
- **H2 (mtime precision) ruled out** — both code paths use the same
  lossy conversion, comparison stays consistent.

## Manual cleanup remaining

The orphan `C:\Web App\Agent IDE\codebase-graph.db*` files (7.7 MB +
WAL/SHM siblings) are dead weight. Safe to delete with the IDE quit:

```powershell
Remove-Item "C:\Web App\Agent IDE\codebase-graph.db*"
```

Not auto-deleted — the user may want to inspect contents first, or
might have other tools sniffing that path. Filed as a one-time
cleanup, not as a required step.

---

## Original investigation notes (kept for historical context)


## Symptom (observed across the entire Wave 53k night)

Every IDE chat-session smoke during Wave 53k showed:

```
[trace:autoSync.poll] collectChangedFiles in 0ms changed=0
[trace:autoSync.reindex] done in NNNms success=true files=0 nodes=3324 errors=0
```

`changed=0` and `files=0` reported even though the source tree had ~25
edits across the night. Graph queries via `mcp__ouroboros__*` consistently
returned **pre-Wave-53k function names** (the deleted
`getSettingsPath`, `readSettingsFile`, `moveProxiedServersToDisabled`,
etc.) — proving the graph was stale by hours.

The `0ms` runtime for `collectChangedFiles` is the load-bearing clue: a
~2,600-file repo cannot stat all files in 0ms. Either the iteration is
empty or it's terminating immediately.

## Hypotheses (in priority order)

### H1 — `getAllFileHashes(projectName)` returns an empty list

`autoSync.ts:148` `collectChangedFiles` iterates
`this.opts.db.getAllFileHashes(this.opts.projectName)`. If the DB has
zero rows for this project name, the loop completes in 0ms and reports
`changed=0`. The diagnostic logging just landed
(`[trace:autoSync.poll] hashes=N changed=M`) will confirm this on the
next run.

Sub-hypotheses:
- **H1a — projectName mismatch.** `systemTwoRegistry.ts:101` computes
  `projectName = path.basename(path.resolve(projectRoot))`. For
  `C:\Web App\Agent IDE` that's `"Agent IDE"`. The graph nodes the user
  inspected are qualified `Agent IDE.src.main.…`, which matches. Likely
  not the bug.
- **H1b — DB connection isolation.** Worker thread writes file_hashes;
  main thread `getAllFileHashes` reads via a different connection. If
  better-sqlite3 isn't configured with WAL or appropriate journaling,
  reads on the main thread might miss recent worker writes. Worth
  checking `graphDatabase.ts` connection setup.
- **H1c — `file_hashes` table never populated.** The pipeline writes
  hashes via `db.upsertFileHash` in `indexingPipeline.finalizeIndex`.
  If the initial-index path skips that (e.g., when the worker uses a
  different db handle), the table stays empty.

### H2 — mtime precision loss masks all changes

Both the indexer (`indexingPipeline.ts:176`) and the poll
(`autoSync.ts:178`) compute `Math.floor(stat.mtimeMs * 1e6)`. For
modern timestamps (~1.74×10¹² ms), `* 1e6 ≈ 1.74×10¹⁸` exceeds
`Number.MAX_SAFE_INTEGER` (2⁵³ ≈ 9×10¹⁵). The result loses precision
in the last few bits.

This is **consistent across both call sites**, so for an unchanged file
the comparison should still match. But for a changed file with a small
mtime delta (sub-microsecond), the precision loss could mask the
difference.

Likely contributory but not the primary cause — H1 fits the `0ms`
observation better.

### H3 — parcel-watcher path is dead code

`AutoSyncWatcher.receiveWatcherEvent` (the entry point for native
file-change events) has **zero callers** in `src/main/`. The
`@parcel/watcher`-backed `nativeWatcher.ts` exists but isn't wired
into autoSync. So new-file creation is purely poll-driven, and the
poll only iterates existing-in-DB files (H1). New files outside the DB
are invisible to the change-detection loop entirely.

This explains why files I created during the wave (`codemodeManagerFiles.ts`,
`codemodeManagerScopes.ts`, `mcpClient.test.ts`, etc.) never registered
as changes — they weren't in `existingHashes`, and the watcher event
that should have caught them isn't wired.

## Proposed fix (after H1 is confirmed)

Two changes:

1. **Wire the parcel-watcher into AutoSyncWatcher.** Find the
   `nativeWatcher.ts` consumer (or instantiate one in
   `systemTwoRegistry.acquire`) and route its file-change events to
   `watcher.receiveWatcherEvent(filePath)`. This catches new-file
   creation and modification of files not yet in the DB.

2. **Make `collectChangedFiles` also enumerate the live FS.** Compare
   discovered files against `existingHashes` — files in the FS but
   missing from the catalog are "new" and should trigger reindex. Cap
   the discovery cost (e.g., one full FS walk every Nth poll) to avoid
   ballooning the poll runtime.

Plus the underlying H1b investigation if the diagnostic logging shows
`hashes=0`: confirm DB connection isolation between worker and main
thread.

## Acceptance for the eventual fix

- After editing a tracked source file, within one poll interval (≤ 5s
  for medium repos), `[trace:autoSync.poll]` logs `changed≥1` and
  triggers a reindex that produces `files≥1`.
- After creating a new source file, ditto.
- A `mcp__ouroboros__search_graph` query against a freshly-edited
  function returns the new signature, not the pre-edit one.

## What landed tonight (just the diagnostic)

`autoSync.ts:pollForChanges` now logs `hashes=N` alongside
`changed=M`. Gives us ground truth on the next IDE-session smoke
without fixing anything yet. After one chat session, the user can
paste the `[trace:autoSync.poll]` lines from the IDE log and we'll
know whether H1 is correct.

## Why this is filed as a follow-up rather than fixed tonight

- Wave 53k just shipped end-to-end at midnight; building on top of it
  before it has a single soak day adds avoidable risk to anything we
  ship right after.
- The fix has at least three plausible code paths (H1a/b/c) with
  different scopes; pinning the right one needs the diagnostic data
  this commit will produce.
- The autoSync code touches indexer + watcher + worker concurrency;
  worth fresh eyes.
