# Wave 50 — Architectural Decisions

Rule-to-Hook Migration. Backfilled retrospectively after Wave 53a introduced the ADR convention.

## Decision 1: hook deny semantics — bypass approval flow on policy violations

**Context:** PreToolUse hooks (block-secret-writes, block-lockfile-edits, block-minified-operations) need to reject tool calls. Could route through the existing approval UI or fail-fast.

**Pick:** Hooks emit `{ decision: 'reject', reason: '...' }` immediately, bypassing the approval UI for unconditional policy blocks.

**Rationale:** These are unconditional policy enforcement, not user-confirmable approvals. Surfacing them through the approval UI would imply user override is expected, which isn't the intent. Industry standard for policy-as-code engines (OPA, Cedar) is to short-circuit on violations.

**Consequences:** Users can still disable individual hooks via `hooks.enforcedRules` config. Policy violations are visible (deny message surfaces in agent output) but not approval-gated.

---

## Decision 2: warn-full-test-suite as IDE-log-only, not agent-visible

**Context:** `warnFullTestSuite` should signal "you're running the full suite without a path arg." Hook protocol supports `approve`/`reject` exit codes but no native warn channel.

**Pick:** IDE-side log only via `log.info('[hook-enforce] warn', ...)`. Harness sees `approve` (proceed). Agent doesn't see the warning.

**Rationale:** Industry standard for advisory hooks: log to ops, don't interrupt user flow. Adding a native warn path would require modifying `pre_tool_use.mjs` stdout to bubble warnings, which would change the hook protocol contract for non-policy-violation cases.

**Consequences:** The agent doesn't see the warning. Telemetry can measure correlation between full-suite runs and outcomes; if the signal warrants, a future wave adds agent-visible warn via stdout bubbling.

---

## Decision 3: graph-first enforcement decision driven by data, not opinion

**Context:** Phase D measured graph-routing adherence by analyzing the Claude Code session JSONL corpus (522 files). Threshold: ≥70% adherence → log-only; 40–70% → optional warn; <40% → enforce.

**Pick:** Stay log-only. Adherence: 93.9% (4,343 literal of 4,626 Grep+Read calls; 6.1% symbol-shaped).

**Rationale:** Soft rule is working. Enforcement would add friction without justified upside. The 6.1% upper bound on potential graph-routing violations doesn't warrant the false-positive risk on literal pattern searches.

**Consequences:** Reserved `hooks.enforceGraphFirst` config key for future re-evaluation. Quarterly re-runs of `scripts/analyze-graph-adherence.ts` will trigger reconsideration if adherence drops below 70%.

---

## Decision 4: slash command soft migration (rule files preserved)

**Context:** Two large rules (`init-safety.md`, `project-claude-md-template.md`) moved to slash commands. Could delete the originals immediately or preserve them.

**Pick:** Soft migration. Original rule files at `~/.claude/rules/` stay in place for one wave of soak.

**Rationale:** Rollback safety. If the slash command path proves problematic, the rule files are still there. Removal becomes a follow-up after the slash commands prove out in real use.

**Consequences:** Token-cost savings deferred until rule deletion. Net win still positive: slash commands load only when invoked, reducing baseline session tokens for the cases that don't need the content.
