# Audit triage session — handoff (2026-05-01)

This handoff is for a future agent picking up the audit-triage work. The user (Cole) and the prior agent worked through the high-priority STILL-RELEVANT list from `roadmap/audit-verification-pass.md` and completed it. The next batches (CLOSE / NOW-USELESS / SUPERSEDED) are open.

## Mission context

Cole had previously generated a consolidated audit verification report at `roadmap/audit-verification-pass.md`. It catalogues 155 items across 12 audits, with classifications (✅ DONE, ❌ STALE, ⚠️ PARTIAL, 🔮 FUTURE-INTENT, 🗑️ DROPPED-INTENT) and a Section D follow-ups inventory.

The session goal: go through every item one-by-one with a layman explanation, a recommendation for filing, and immediate action when small. The session completed all 17 high-priority STILL-RELEVANT items.

## What's done

### Files filed in `roadmap/future/` (committed work)

1. **`context-injection-completion.md`** — bundles audit items #1 + #5. Wires `startContextRetrainTrigger` at startup AND threads `request.model` through `enrichPacketWithContextLayer`. Both <10-line fixes for almost-shipped infrastructure.

2. **`graph-mcp-polish.md`** — bundles items #2 + #3 + #4. Drops legacy `mcpToolHandlers.ts` parameter aliases (`name_pattern`, `qualified_name`, `function_name`), migrates `McpToolDefinition` envelope to `{isError, content}`, fixes `parseAnomalies` absent-when-zero behavior. Three-phase wave with soft-deprecation period.

3. **`telemetry-archival-completion.md`** — bundles audit item #7 with HIGH-A (`traceBatcher` never initialized) and HIGH-B (`telemetryJsonlMirror` never instantiated) from `roadmap/_archived/waves-15-29-review-addendum.md`. **Reframed per Cole's "archive don't purge" requirement** — JSONL mirror becomes permanent archive layer; SQLite purge becomes pure cache eviction. Historical telemetry preserved indefinitely in compressed JSONL (~50 MB/year compressed).

4. **`agent-chat-swipe-navigation.md`** — item #8a. `useSwipeNavigation` mount on `AgentChatWorkspace`. Low priority — flagged "before Capacitor mobile reaches users." Blocked on small refactor (workspace needs stable ref).

5. **`cypher-engine-feature-additions.md`** — items #11 + #12. Three-tier structure:
   - Wave A: cheap subset wins (diagnostics, OPTIONAL MATCH, UNWIND, multi-pattern MATCH, `p.indexed_at` ISO conversion)
   - Wave B: WITH support (decide-later, larger architectural change)
   - Wave C: investigate building a full-fledged Ouroboros Cypher engine (Cole explicitly asked for this note — possibly extractable as OSS)
   - **Audit's "OR in WHERE" claim corrected** — `OR` IS supported (verified `cypherEngineParser.ts:148-149`)

6. **`graph-edge-confidence-scoring.md`** — item #13. Confidence scoring for call-resolution edges (currently all default 1.0). **Cross-referenced both directions** with `roadmap/wave-67-indexer-coverage-repair.md`. Sequencing recommendation: ship Wave 67 first, then this.

7. **`disabled-rules-honor-at-send-path.md`** — item #15. Disabled rule IDs in context preview popover not honored at send. Small standalone wave. Fixes a trust-eroding UI lie.

8. **`warn-hooks-stdout-surfacing.md`** — item #16. `warnFullTestSuite` agent-visible via PreToolUse hook stdout. **Has Phase A research gate** — Cole agreed this is non-negotiable: verify Claude Code's PreToolUse stdout semantics before committing to the path. The wave's value depends on whether stdout actually surfaces to the agent.

9. **`memory-curation-completion.md`** — item #17. Memory write/delete IPC + inline drill-down preview. Wave 63 follow-up. Two phases. **Has substantial explicit out-of-scope section** (8 items NOT to pull in: add-new-memory UI, search/filter, bulk ops, version history, export/import, multi-user concurrency, etc.).

### Files filed in `roadmap/deferred/` (preserved for future maintainers, not committed)

1. **`cross-window-ide-tool-delegation.md`** — item #9. Wave 42-44 deferral chain. Not valuable for current solo use. Cole flagged: relevant for OSS or sale scenarios. Trigger conditions documented for activation.

2. **`mobile-access-and-session-dispatch.md`** — item #10. Cole clarified mid-discussion: he's using `webAccess` (port 7890 LAN browser access), NOT `mobileAccess` (Capacitor pairing). The flag flips don't affect his current usage. QR pairing flow IS broken and is captured as the activation prerequisite.

3. **`tree-sitter-grammar-upgrade.md`** — item #14. **Resolved mid-task**: tested whether `accessor` keyword works by adding `AutoAccessorClass` to `__fixtures__/modernTs.ts`; test passed — current `@vscode/tree-sitter-wasm@0.3.1` already handles `accessor`. The deferred file preserves the broader investigation path for future TS features and the runtime ABI ceiling Cole hit in Wave 67.

### Direct code actions taken

- **Item #6** — Deleted three orphan `codebase-graph.db*` files in repo root (~11.9 MB freed). Live DB is at `userData/codebase-graph.db`; repo-root copies were stale dev artifacts.

- **Item #8b** — Flipped `agentMonitor.subagentDisplay.enabled` default from `false` to `true` in `src/main/configSchemaTailExt2.ts`. Added two new test assertions in `configSchemaTailExt2.test.ts`. Full file passes 7/7. Verified mid-task that subagent-to-parent linkage is already wired (`parentSessionId` flows into `AgentTree.tsx:46-48`), so Cole's caveat ("subagent content attached to parent session in monitor") was already satisfied by design.

- **Item #14 fixture addition** — Added `AutoAccessorClass` example with `accessor` keyword to `src/main/codebaseGraph/__fixtures__/modernTs.ts`. Updated `treeSitterParser.test.ts` to assert it appears in extracted Class definitions. Test passes. This is now permanent regression coverage.

- **Audit correction** — Removed "OR in WHERE" false-flag claim from `roadmap/audit-verification-pass.md` (lines 457 + 497).

## What's next — the open work

Cole has not yet gone through these audit batches. They live in `roadmap/audit-verification-pass.md` Section D:

### Items to CLOSE — DONE (12 items, ✅)

These are confirmed shipped and just need to be removed from the active follow-ups list. Probably no per-item discussion needed; bulk-close them.

Examples: `codemode.excludeFromMultiplex` (Wave 53k), Wave 53l universal multiplexer, `ResearchOutcomeRecord` fields, Wave 51 `internalMcp` barrel split, etc.

### Items to CLOSE — NOW-USELESS (~19 items, 🗑️)

Items the audit recommends closing because the assumption underlying them no longer holds. Examples: UUID v7 follow-up (15), iOS Capacitor/APNs (33a/b/34 — went FCM/Android), Wave 47 stash drops, Wave 48 telemetry backfill, Wave 53 Phase D blocking Wave 54, etc.

These probably warrant a quick scan per item to confirm "yes, no longer relevant" before closing. Some may turn out to still matter once you read them; expect ~10% to flip back to STILL-RELEVANT.

### Items SUPERSEDED (~18 items, 🔄)

Items where a later wave already addressed them via a different approach. Examples: auto-sync graph staleness → Wave 60 standalone replaces; `chatWorkbench` default flip → retired; CodeMode `routeInternalMcp` → replaced by `excludeFromMultiplex`; SDK adoption → done in Wave 60.

These are the safest batch — verify the supersession is real, then close.

### Other audit sections not yet processed

The session focused only on Section D's STILL-RELEVANT high-priority list. The full audit doc has these other sections worth scanning:

- **Section A1 — Dead code** (53 items): 30 VERIFIED · 5 STALE · 6 PARTIAL · 4 FUTURE-INTENT · 4 DROPPED-INTENT · 4 INVESTIGATE-FURTHER. Includes a "High-confidence DELETE candidates" list (12 directories/files) ready to nuke.
- **Section A2 — Dead config keys**: `windowSessions` removal needs both reads removed in same change. `llmJudgeSampleRate` UI slider controls nothing.
- **Section A6 — Docs drift** (13 items, all VERIFIED): 2 HIGH-severity (Wave-51 sections describe deleted architecture).
- **Section A7 — Stale CLAUDE.md files**: ~13 entries to fix; auto-generated sections also stale, not just manual:preserved.
- **Section C — Settings audit** (Parts A and B): Some VERIFIED-PARTIAL items worth WAVE-IT (e.g., `webAccessPassword` UI feedback indicator, `useMcpHost` main-process gating, `modelSlots.claudeMdGeneration` wiring).

## How Cole works (preferences observed during this session)

### Filing structure
- **`roadmap/future/`** = committed to do (waves with concrete plans)
- **`roadmap/deferred/`** = preserved for future maintainers / post-OSS, not committed
- The distinction matters to Cole — don't conflate them.

### Decision style
- Decisive when the answer is clear ("Path 2 doesn't actually exist as a real option" was accepted without pushback).
- Asks "is this the right path?" when uncertain — wants you to research and answer rather than just agree.
- Pushes back hard when the answer is wrong — re-evaluate on technical merits, not social signal. Don't capitulate without new info.
- Gives "do this thing AND also do this small extra" instructions — listen for the bundling clauses (e.g., "subagent content attached to parent session in the monitor" added a verification step).

### Pattern that worked all session
1. Explain the item in plain English (Cole is ~4 months into coding, agent-driven; assume shallow technical depth, deep product thinking)
2. Use tables and headers — Cole reads structured output well
3. Recommend a clear filing decision (WAVE-IT, DEFER, JUST-DELETE, CLOSE-AS-WONT-FIX)
4. Wait for Cole's call
5. File the document, do any direct actions, move to next item

### Things Cole flagged across the session
- **Archive don't purge** for telemetry data (drove the JSONL-as-permanent-archive design)
- **OSS/sale scenarios matter** — defer items that aren't valuable solo but might matter to future users
- **Subagents nest under parent in monitor** — already wired, but the caveat shaped how 8b was approved
- **Bundle related items** — Cole consolidated items 2/3/4 (graph MCP polish), 1/5 (context injection), 11/12 (Cypher), and accepted bundling 7 with HIGH-A/B
- **Note relationships in waves** — wave-67 cross-references confidence-scoring wave both directions; that pattern should continue
- **Investigate full Cypher engine** — explicitly added to the Cypher wave file as Wave C; signals Cole is open to bigger architectural builds eventually

### Engineering rules to honor (from `~/.claude/`)
- Sonnet model for subagent dispatches (not Opus); use catalog agents (haiku-explorer, haiku-research-extractor, etc.) per task shape
- `claude-code-guide` agent for Claude Code hook protocol questions (would have been useful for warn-hooks Phase A research)
- Best-practice spectrum rule fires on architectural decisions — present industry-standard / emerging / experimental tiers
- Never mock the database in tests
- `.test.ts` files are exempt from `max-lines-per-function`
- Lint discipline: max-lines-per-function 40, complexity 10, max-lines 300, max-depth 3, max-params 4 — never relax
- Don't add comments unless the WHY is non-obvious

## Open threads

### Audit doc final close-out

`roadmap/audit-verification-pass.md` has been partially corrected (OR-in-WHERE removal) but the 17 STILL-RELEVANT items it lists at lines 487-503 should be marked as filed. Recommended approach: append a "Triage status (2026-05-01)" section near the top documenting which items are filed and where, OR strike-through the items in place with a marker.

### Things deferred but not yet filed

- **The 37+ CLOSE / NOW-USELESS / SUPERSEDED items** — these are batch work, not per-item. A future agent should probably do these in a single sweep with a dry-run summary first ("here's what I propose to mark closed and why") rather than going one-by-one.

### Things investigated mid-session that need follow-up

- **Wave 70 numbering** — the proposed wave files use "Wave 70" as a placeholder. The actual next-wave number depends on what's currently in flight; verify before committing to a number.
- **`warn-hooks-stdout-surfacing.md` Phase A research** — Cole agreed this is mandatory before code lands. The next agent (or Cole) needs to actually do that research before this wave can proceed beyond filing.
- **JSON Cypher library landscape research** is captured in the cypher-engine doc with date stamps. If the wave activates >6 months from now, re-research before committing — the landscape might shift.
- **`mobileAccess` QR pairing bug** — captured as activation prerequisite in the deferred file. Real bug. If/when activated, needs diagnostic work first (per Cole's debug-before-fix rule).

## Useful greps if you're picking up cold

```
# What's filed in future/ vs deferred/
ls roadmap/future/
ls roadmap/deferred/

# What was changed in code during this session
git diff --stat HEAD~10  # adjust depth as needed

# The audit's STILL-RELEVANT list (already-processed items)
grep -A 30 "High-priority STILL-RELEVANT" roadmap/audit-verification-pass.md

# The audit's CLOSE / NOW-USELESS / SUPERSEDED lists (next batch)
grep -B 1 -A 30 "Items to CLOSE" roadmap/audit-verification-pass.md
grep -B 1 -A 30 "NOW-USELESS" roadmap/audit-verification-pass.md
grep -B 1 -A 30 "SUPERSEDED" roadmap/audit-verification-pass.md
```

## Key file references for cold pickup

- `roadmap/audit-verification-pass.md` — the source-of-truth audit doc; partially annotated
- `roadmap/follow-ups/follow-ups.md` — original follow-ups inventory (155 items)
- `roadmap/_archived/waves-15-29-review-addendum.md` — source of HIGH-A/B/D bundled into telemetry-archival wave
- `roadmap/wave-67-indexer-coverage-repair.md` — sibling to graph-edge-confidence-scoring, cross-referenced
- `roadmap/wave-63-popover-tab-coverage.md` — parent of memory-curation-completion
- `roadmap/wave-68-cypher-engine-quality.md` — adjacent to cypher-engine-feature-additions
- `~/.claude/CLAUDE.md` — Cole's global engineering rules and working-style preferences
- `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` — Cole's project memories

## Final note

The session covered exactly 17 items in roughly 4 hours of conversation. Most items were single-turn (explain → recommend → file). A few took multiple turns when Cole had a question or wanted bundling. The pattern is reliable; carry it forward.

The deferred-vs-future distinction was Cole's idea; the bundle-related-items pattern was Cole's idea. Both are working well. Don't fight either.
