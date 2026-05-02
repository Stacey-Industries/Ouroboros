# Wave 53a — Architectural Decisions

Telemetry Parity: Migrate Remaining Surfaces. Backfilled retrospectively as the first wave under the ADR convention.

## Decision 1: write-on-fail (not dual-write) for hook-events JSONL fallback

**Context:** When `sendEvent` to the IDE pipe fails, should the hook (a) write JSONL and exit, (b) write JSONL AND continue with response-file fallback (dual-write)?

**Options considered:**
- *Industry standard (write-on-fail):* primary delivery (pipe) + fallback (JSONL). JSONL only fires when primary fails. Used by every offline-tolerant collector pattern (Sentry, Datadog).
- *Dual-write:* always write to both. Drain has to dedupe.
- *Cutting-edge:* CRDT-based eventual consistency. Overkill.

**Pick:** Write-on-fail — industry standard.

**Rationale:** Avoids duplicate I/O when sendEvent succeeds. Telemetry is best-effort by design — small risk of mid-consumption-crash loss is acceptable. Drain doesn't have to dedupe records that succeeded over the pipe.

**Consequences:** If the IDE crashes between sendEvent.success and telemetryStore.record, that one event is lost. Edge case; acceptable.

---

## Decision 2: post-hoc shadow router with weightsVersion stamp

**Context:** Audit row #13 (router decisions) was classified `fundamentally-IDE-only` because routing requires the classifier weights and the IDE-side LLM client. Could the hook capture raw prompts and let the IDE drain run the router post-hoc?

**Options considered:**
- *Industry standard (decision-time matching):* shadow router fires at the moment of the decision, with the production model state. Standard practice in ML A/B testing.
- *Emerging best practice (post-hoc with weights snapshot):* hook captures inputs; IDE drain runs the router with whatever weights are current. Tag records with `weightsVersion`. Different signal — answers "what would the *current* model decide?" rather than "what did the *production* model decide?"

**Pick:** Post-hoc with `weightsVersion` stamp — emerging best practice.

**Rationale:** The production-model-at-the-time signal isn't available without the IDE running. Post-hoc with newer weights is arguably *more* useful for forward-looking model improvements than session-time would have been. Tagging with `weightsVersion` keeps both signals separable in analysis.

**Consequences:** Wave 53b's analyzer must split corpora by `postHoc` flag and `weightsVersion`. The tagging discipline is documented per-surface in `docs/telemetry-parity.md`.

---

## Decision 3: `(sessionId)`-keyed dedup — live record beats drain record

**Context:** Internal sessions trigger both the IDE-side live shadow path AND the new hook. Both produce records for the same logical event.

**Pick:** Drain handler reads existing `router-decisions.jsonl` once at init, builds `Set<sessionId>` of session-time entries (those without `postHoc: true`), and skips drain records whose sessionId is already in the set.

**Rationale:** Live record carries richer signal (session-time weights, full IDE context). Drain record is a reconstruction. Prefer the live one when both exist. Industry standard for "two sources of truth" dedup is to pick the higher-fidelity source.

**Consequences:** External-only sessions populate post-hoc records; internal sessions populate session-time records. No duplicates. Wave 53b's analysis distinguishes via the `postHoc` flag.

---

## Decision 4: drain-side redaction (single source of truth)

**Context:** Spawn-trace records contain argv that may include sensitive flags (`--api-key sk-...`). Redaction can happen on the hook side or the drain side.

**Pick:** Drain-side. Hook captures raw argv; drain handler runs canonical `redactArgv` from `traceBatcher.ts` before passing to `enqueueTrace`.

**Rationale:** Single source of truth for redaction logic. Hook scripts can't easily import TS modules, so any hook-side redaction would require a parallel implementation that drifts. Drain has access to the canonical function.

**Consequences:** Raw argv briefly lives in the queue file before redaction. Mitigated by queue files being in `~/.ouroboros/telemetry/` (user-private dir) and processed/deleted on next IDE launch. Acceptable risk.

---

## Decision 5: idempotent additive merge for auto-install with atomic write

**Context:** Phase E auto-installs hook entries into `~/.claude/settings.json`. The user's existing entries must not be disturbed.

**Options considered:**
- *Industry standard (atomic write + first-install backup):* read, merge, write to tmp, rename. Backup once on first install. Mirrors how dotfile managers work.
- *Dumb overwrite:* writeFile(JSON.stringify(...)). Risks user data loss.
- *Cutting edge (CRDT settings):* over-engineered for a JSON config file.

**Pick:** Atomic write + first-install backup — industry standard.

**Rationale:** Non-destructive for user state, crash-safe, and the user's `~/.claude/settings.json` is sacred — losing their custom entries would be a much worse failure than the cost of the safety machinery.

**Consequences:** Phase E's pattern is *more* protective than the existing `hookInstallerStatusLine.ts` (which uses plain writeFile without backup). Flagged as a possible future hardening of the older code paths in the result brief.
