# Telemetry Parity — Architecture & Migration Guide

Ouroboros telemetry is backed by a SQLite store and several JSONL files under
`~/.ouroboros/telemetry/`. Before Wave 52 every emit site fired only when the
IDE's main process was running. External Claude Code sessions — terminal runs
where the IDE is closed — silently produced no telemetry. Because the user
frequently works that way, the corpus fed to Auto Effort, Auto Model, the
context ranker, and the research/retrain loop was biased toward IDE-orchestrated
sessions only.

**Telemetry parity** closes that gap: a hook script runs inside every Claude
Code session (IDE-orchestrated or not), appends a record to a local queue file,
and the IDE imports those records the next time it starts. The hook never needs
to reach the IDE process; the queue is a plain JSONL file on disk.

---

## Architecture

```
External session (IDE may be offline)
  │
  └─ Claude Code fires a hook event (SessionStart / etc.)
       │
       └─ assets/hooks/<name>.mjs  (hook script, pure Node)
            │
            └─ assets/hooks/lib/telemetryQueueAppend.mjs
                 │
                 └─ appends one JSON line to
                    ~/.ouroboros/telemetry/queue/<surface>.jsonl
                    (append-only; script never reads or seeks)

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
            │         ├─ dedup (handler-specific)
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

**Phase B primitives (all in `src/main/telemetry/`):**

| File | Export | Role |
|---|---|---|
| `telemetryQueue.ts` | `appendToQueue` | IDE-side queue append (mirrors hook helper) |
| `telemetryDrain.ts` | `registerSurfaceHandler`, `drainQueue` | Handler registry + drain loop |
| `queueRotation.ts` | `shouldRollFile`, `enforceTotalDirCap` | Per-file 10 MB cap, total 100 MB cap |
| `telemetryDrainStartup.ts` | `runParityQueueDrain` | Boot wrapper — flag gate + error containment |

The hook-side helper (`telemetryQueueAppend.mjs`) uses only Node built-ins. It
must never import from `src/` — it runs in hook subprocesses where the IDE is
not loaded.

---

## Hook contract

Every queue record has this shape (identical between hook helper and IDE-side):

```jsonc
{
  "recordId":      "<UUID v4>",     // crypto.randomUUID(); dedup key
  "ts":            1714300000000,   // Date.now() at append time
  "surface":       "spawn-cost",    // routes to the matching drain handler
  "schemaVersion": 1,               // per-surface; drain skips unknown versions
  "payload":       { /* surface-specific fields */ }
}
```

**Contract rules:**

- `recordId` is UUID v4, generated at append time. The drain handler may use
  this as a dedup key, or prefer a domain key (see §Drain semantics).
- `ts` is milliseconds since epoch, set by the hook at append time.
- `surface` is a stable string constant defined once in the hook script and
  mirrored in the drain handler. Changing it is a breaking change.
- `schemaVersion` is a positive integer. Bump it when the payload shape changes
  in a backward-incompatible way. The drain handler declares which versions it
  supports via `registerSurfaceHandler(..., [1, 2])`.
- The file is **append-only line-oriented JSON**. The hook never seeks, never
  reads. Crash-safe by being write-only.
- **Hook scripts MUST never throw.** Wrap all logic in try/catch. Log to
  `process.stderr` only — hook output is not user-facing and must not break the
  session.

---

## Queue lifecycle

**File locations:**

```
~/.ouroboros/telemetry/
  queue/
    spawn-cost.jsonl          ← hook appends here
    spawn-cost.jsonl.1        ← rolled when primary exceeds 10 MB
  processed/
    spawn-cost.jsonl          ← IDE moves here before reading (atomic commit)
```

**Per-file cap (10 MB):** Before each append, `telemetryQueue.ts` calls
`shouldRollFile()`. If the file is at or above `PER_FILE_CAP_BYTES`, it is
renamed to `<surface>.jsonl.<n>` (first unused number) and a fresh file is
started. The hook helper does not enforce this cap — if the hook writes while
the file is at the cap, the extra bytes are tolerated until the IDE next rolls.

**Total directory cap (100 MB):** `enforceTotalDirCap()` runs at IDE startup
before the drain. Files are sorted by mtime ascending (oldest first); oldest are
deleted until the total drops below `TOTAL_DIR_CAP_BYTES`. Deletions are
best-effort (log + skip on failure).

**Atomic move:** `drainQueue()` renames each `queue/<file>` to
`processed/<file>` using `fs.renameSync`. On POSIX this is atomic within the
same filesystem; both paths are under `~/.ouroboros/telemetry/` to guarantee
that. After a rename the queue slot is empty — new hook appends start a fresh
file. The rename is the commit point: if the IDE crashes after renaming but
before finishing, the file remains in `processed/` and is **not** re-processed
on the next launch (only new `queue/` files are drained).

**Post-drain cleanup:** If every record in a processed file was imported without
error or skip, the file is deleted. If any record errored or was skipped
(unknown surface, bad schemaVersion, malformed JSON), the file is retained in
`processed/` for human review.

---

## Drain semantics

`drainQueue()` returns a `DrainSummary`:

```typescript
interface DrainSummary {
  filesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;   // unknown surface, unsupported schemaVersion, bad JSON
  recordsErrored: number;   // handler threw
}
```

**Idempotent across restarts.** Once a file is renamed to `processed/`, re-running
`drainQueue()` will not touch it — only new `queue/<file>` entries are moved.

**Forward-compatible.** An unknown `surface` key is logged at warn and counted
as skipped. An unsupported `schemaVersion` is logged at warn and counted as
skipped. Neither crashes startup. This lets a newer hook script co-exist with
an older IDE version: records are skipped until the IDE is updated.

**Best-effort.** Each record's dispatch is wrapped in try/catch. A handler that
throws counts the record as errored and moves on to the next line. The IDE
never crashes startup because of a bad queue record.

**Dedup is handler responsibility.** The drain core does not deduplicate — each
surface's handler decides its key. For `spawn-cost`, the handler reads the
existing `mcp-spawn-cost.jsonl` once at init, builds a `Set<sessionId>`, and
skips queued records whose `sessionId` is already present. For surfaces where
multiple records per session are legitimate (e.g. graph-usage, which fires once
per tool call), the handler must not use session-level dedup.

---

## Recipe — adding a new surface

Follow these steps in order. Each step names the file to touch.

### 1. Pick the Claude Code hook event

Consult `roadmap/wave-52-audit.md` for the recommended event per surface. For
data visible at session start (model, cwd, MCP config), use `SessionStart`. For
per-tool data, use `PreToolUse` or `PostToolUse`. For session-end signals, use
`SessionEnd` or `Stop`.

### 2. Write the hook script

Create `assets/hooks/<event>_<surface>.mjs`.

```javascript
// Example skeleton
import { appendToTelemetryQueue } from './lib/telemetryQueueAppend.mjs';

const SURFACE = 'my-surface';   // must match drain handler constant
const SCHEMA_VERSION = 1;

async function main() {
  try {
    const raw = await readStdin();           // read event payload from stdin
    if (!raw.trim()) return;
    const event = JSON.parse(raw);

    const payload = buildPayload(event);     // extract + compute fields
    appendToTelemetryQueue(SURFACE, SCHEMA_VERSION, payload);
  } catch (err) {
    process.stderr.write(`[${SURFACE}-hook] error: ${err?.message}\n`);
    // Never rethrow — hook must always exit 0
  }
}

main().then(() => process.exit(0));
```

Rules:
- Only Node built-ins. No imports from `src/`.
- Never throw out of `main()`. Catch everything; log to stderr.
- Define `SURFACE` and `SCHEMA_VERSION` as constants at the top.
- Document which payload fields come from the hook event vs are IDE-unknown
  (mark those with safe sentinel values like `'unknown'` or `false`).

### 3. Define the payload schema

Add a typed comment block at the top of the hook script:

```javascript
/**
 * Payload shape for surface 'my-surface', schemaVersion 1.
 * @typedef {Object} MySurfacePayload
 * @property {string} sessionId
 * @property {string} model
 * @property {number} schemaVersion   - 1
 */
```

The drain handler TypeScript type must match this exactly.

### 4. Write the drain handler

Create `src/main/<subsystem>/<surface>DrainHandler.ts`.

```typescript
export const MY_SURFACE = 'my-surface';
export const MY_SCHEMA_VERSION = 1;

interface MySurfacePayload { /* mirror hook typedef */ }

function isValidPayload(p: unknown): p is MySurfacePayload { /* type guard */ }

export function createHandler(existingKeys: Set<string>) {
  return function handle(record: QueueRecord): void {
    const p = record.payload;
    if (!isValidPayload(p)) { log.warn(...); return; }
    if (existingKeys.has(p.sessionId)) return; // dedup
    // forward to sink
    existingKeys.add(p.sessionId);
  };
}

export function registerMyHandler(): void {
  const existing = readExistingKeys();
  registerSurfaceHandler(MY_SURFACE, createHandler(existing), [MY_SCHEMA_VERSION]);
}
```

### 5. Write tests

Add `<surface>DrainHandler.test.ts` alongside the handler. Mock `fs` per the
Wave 51 / Phase C pattern. Cover: valid record emitted, invalid payload skipped,
dedup skipped, unknown schemaVersion skipped.

### 6. Register at boot

In `src/main/main.ts`, before the `runParityQueueDrain()` call:

```typescript
import { registerMyHandler } from './<subsystem>/<surface>DrainHandler';
// ...
registerMyHandler();
await runParityQueueDrain();
```

### 7. Document the hook installation

Add the hook to `~/.claude/settings.json` manually (see next section). Then
update `docs/telemetry-parity.md` to list the new surface and document any
IDE-unknown fields.

---

## Manual hook installation

The spawn-cost hook (the only one shipped in Wave 52) must be added to
`~/.claude/settings.json` under the `SessionStart` key. The IDE does not
auto-install this entry — you do it once.

Open `~/.claude/settings.json` and locate the `"hooks"` object. Add (or merge)
the `SessionStart` array entry:

```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\Users\\coles\\.claude\\hooks\\session_start.mjs\""
          },
          {
            "type": "command",
            "command": "node \"C:\\Web App\\Agent IDE\\assets\\hooks\\session_start_spawn_cost.mjs\""
          }
        ]
      }
    ]
    // ... other hook events
  }
}
```

**Notes:**
- If a `SessionStart` key already exists (it does in this repo's global
  settings), append the new entry to the inner `hooks` array — do not replace
  the existing entry.
- Windows path backslashes inside JSON strings must be doubled: `\\`.
- The script path must be absolute. Use the repo's working-tree path, not a
  symlink or relative path.
- After saving, start a new external Claude Code session (open a terminal, run
  `claude`). The hook fires on session start and appends to
  `~/.ouroboros/telemetry/queue/spawn-cost.jsonl`.
- Then launch the IDE. The drain runs at startup and imports the record into
  `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` with `ideSession: false`.

**Verification:**

```bash
# After one external session + IDE restart:
cat ~/.ouroboros/telemetry/mcp-spawn-cost.jsonl | grep '"ideSession":false'
# Should print at least one line.
```

---

## Wave 53a / 53b roadmap

**Wave 53a** (`roadmap/wave-53a-plan.md`) migrates the remaining 10 hookable
surfaces from the audit. The highest-leverage first item is a JSONL fallback
inside `assets/hooks/lib/ouroboros.mjs` — one ~80-LOC change brings 6
`global-hookable` surfaces (hook-pipe events, edit provenance, quality signals)
to parity in one stroke.

**Wave 53b** (`roadmap/wave-53b-plan.md`) is the original ranker measurement
work, now deferred until Wave 53a's migrations produce a representative corpus.
It runs an offline hit-rate analysis on the unified internal + external dataset
and ships a variant ranker behind `contextRanker.mode`.

See `roadmap/wave-52-audit.md` for the full classification of all 16 emit sites
and the recommended migration order.
