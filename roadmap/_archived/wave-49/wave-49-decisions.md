# Wave 49 — Architectural Decisions

CLAUDE.md lean generation + organic growth. Backfilled retrospectively after Wave 53a introduced the ADR convention.

## Decision 1: rescue-vs-prevention framing

**Context:** Original draft targeted four CLAUDE.md files claimed to be 30–75% over the 200-line cap. Verification found those files all under cap (88–179 lines) — either groomed in earlier waves or original audit was wrong.

**Pick:** Reframe wave from "rescue over-budget files" to "prevent future bloat."

**Rationale:** The rescue work didn't exist. Real value was in shipping the lean prompt + size-cap lint + gotcha-update hook so future generations stay lean. Phase B (regenerate the 4 files) was dropped; a small manual trim of today's marginal-over files (Terminal, ipc-handlers, renderer/hooks, AgentMonitor at 200–209 lines) absorbed into Phase D.

**Consequences:** Wave delivered prevention infrastructure. Trim of marginal-over files was dramatic (40–57 lines after) because most over-cap content was duplicated auto-generated sections (file-role tables that the codebase graph already serves) — gotchas survived intact.

---

## Decision 2: gotcha-nudge as warning, not block

**Context:** Phase C's Stop-hook nudges the agent to consider documenting gotchas after bug-fix-shaped sessions. Could be a hard block or a soft nudge.

**Pick:** Soft nudge. Hook emits structured log entry + optional message; never blocks session completion.

**Rationale:** Over-hooking breeds friction. Hard-blocking sessions on a "did you document the gotcha?" check would interrupt legitimate workflows. Telemetry tracks follow-through rate; if low, future wave can graduate to enforcement.

**Consequences:** Some discovered gotchas won't get captured. Trade-off accepted.

---

## Decision 3: size-cap lint as staged-only check

**Context:** `npm run lint:claude-md` enforces 200-line cap. Initial implementation gated on every commit, but that would block any commit while pre-existing over-cap files exist.

**Pick:** Gate on staged CLAUDE.md files only. Pre-existing violations don't block unrelated commits.

**Rationale:** Industry standard for incremental lint enforcement (e.g., `eslint --no-error-on-unmatched-pattern` patterns). Allows the wave to ship without forcing a flag day.

**Consequences:** Pre-existing offenders remain until touched. Phase D's manual trim brought all current files under cap, so no grandfather markers needed at wave close.
