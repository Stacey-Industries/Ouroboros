# Wave 52 — Architectural Decisions

Telemetry Parity: Audit + Queue Infrastructure + First Migration. Backfilled retrospectively after Wave 53a introduced the ADR convention.

## Decision 1: defer-and-batch over live capture for external session telemetry

**Context:** External Claude Code sessions don't go through the IDE's main process, so IDE-only telemetry sinks (mcpSpawnCostTelemetry, outcomeObserver, traceBatcher, etc.) silently drop data. Two options for parity: live ranker CLI invoked by hook on every event, or defer-and-batch (hook writes to queue file; IDE drains on next launch).

**Options considered:**
- *Industry standard (defer-and-batch):* mirrors how telemetry collectors handle offline endpoints — collect locally, flush on connect. Used by Sentry SDK, OpenTelemetry's BatchSpanProcessor, Datadog agent.
- *Live capture:* hook spawns a CLI per event, runs the work synchronously.
- *Cutting-edge:* embedded in-process collector with WebSocket reconnect — overkill for our scale.

**Pick:** Defer-and-batch — industry standard.

**Rationale:** Zero latency cost on the hot path (hooks just append to a file). No standalone CLI extraction work (which would force a leaf-module split to dodge Electron transitive imports). The IDE runs the actual telemetry processing in its native context with all dependencies available. Architecture is uniform across all surfaces — same pipe for everything.

**Consequences:** Predictions and analyses computed slightly later than the session ran. Mitigated by anchoring queue entries to the git ref at session time so reconstruction is reproducible. Acceptable for telemetry use cases.

---

## Decision 2: write-on-fail vs dual-write fallback semantics

**Context:** When `sendEvent` to the IDE pipe fails, should the hook (a) write JSONL only, (b) write JSONL AND continue with response-file fallback?

**Pick:** Wave 52 deferred this question to Wave 53a. Wave 53a resolved as **write-on-fail strict**: JSONL only when sendEvent fails.

**Rationale:** Documented in Wave 53a ADR Decision 1.

---

## Decision 3: queue file format and rotation

**Context:** Queue files need rotation policy to bound disk usage if user runs many external sessions without launching the IDE.

**Pick:** Per-file 10MB cap (rolls to `<surface>.jsonl.<n>`); total dir 100MB cap with oldest-N drop on overflow.

**Rationale:** Industry standard for log rotation (logrotate, journald, Sentry's offline buffer all use similar caps). 10MB per-file is a reasonable balance between rotation churn and parsing cost; 100MB total caps disk impact even in heavy offline usage.

**Consequences:** Heavy offline usage past 100MB drops oldest records. Acceptable — telemetry is best-effort. Documented in `docs/telemetry-parity.md`.

---

## Decision 4: per-handler dedup policy with override hatch

**Context:** Queue records may be replayed (drain crash recovery) or duplicated (internal sessions where IDE-side and hook-side both fire). Different surfaces have different dedup needs.

**Pick:** Default dedup key `(sessionId, surface)` + per-handler override hatch. Each handler picks its policy.

**Rationale:** One-record-per-session-per-surface is the typical pattern; multi-record (graph-usage fires N times per session) is the exception. Industry standard for event dedup is per-stream policy. Override hatch handles legitimate multi-record cases.

**Consequences:** Each migrated surface declares its dedup policy in code. Documented in `docs/telemetry-parity.md` with a per-surface table.

---

## Decision 5: schemaVersion ownership

**Context:** Each surface's record needs schema versioning so producer (hook) and consumer (drain handler) can evolve independently. Hook scripts can't import TS, so schema-as-code is harder than usual.

**Pick:** Per-surface TS schema file imported by drain handler; hook script mirrors the shape in a comment block at the top.

**Rationale:** Industry standard for schema evolution is schema-as-code (Zod, Protobuf, JSON Schema). Hook scripts forced into the comment-mirror compromise — cheap discipline, but real risk of drift. Future improvement: codegen the hook helper from the TS schema.

**Consequences:** Drift risk between schema TS and hook comment block. Mitigated by drain handler validating schemaVersion and skipping unknown versions (forward-compat) rather than crashing. Codegen deferred to a future wave.
