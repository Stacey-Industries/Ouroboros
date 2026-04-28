# Roadmap Session Handoff — 2026-04-26 (updated for Wave 47)

> **Wave 47 shipped** on 2026-04-26 (chat workbench follow-through). Active development continues. See wave-47 result brief at `roadmap/auto-briefs/wave-47-result.md`.

---

## Wave 47 soak checklist

These items should be evaluated after Wave 47 has been running in production for a week:

- **`layout.chatWorkbench` flag default** — currently `false`. Flip to `true` when soak confirms no regressions in the adaptive surface policy, compare mode, and HTML preview sandbox.
- **Rail default open** — `useChatWorkbenchLayout` now defaults `railOpen: true`. Verify this feels correct for new workbench users (not too cramped on narrow displays).
- **Compare mode eligibility** — `useWorkbenchCompare.canCompare` requires `status === 'active'`, non-primary, and `linkedThreadId` present. If users can't enter compare mode because sessions lack thread links, widen the eligibility.
- **HTML preview local assets** — the `allow-same-origin` sandbox restriction means relative URLs (images, CSS) don't resolve. If this is too limiting for agent-generated HTML artifacts, consider a controlled asset-proxy endpoint rather than relaxing the sandbox.
- **Timeline window** — `useWorkbenchTimeline` entries are windowed per session. If the window is too small for long-running sessions, expand the cap.
- **Deferred agent-end** — `useAgentEvents.endSession.ts` defers parent-end until all child events arrive. If this causes sessions to stay in `running` state too long, tune the `FORCE_FINALIZE_DELAY_MS`.

---

## Wave 51 follow-ups

- **Soak protocol.** Run for 1 week with `codemode.enabled=true, codemode.routeInternalMcp=false`, then 1 week with `routeInternalMcp=true`. Run `npx tsx scripts/measure-mcp-token-cost.ts` against `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` and compare per-decision medians. Flip the `routeInternalMcp` default to `true` if savings are real and no regressions surface in graph-tool reachability.
- **CodeMode for user-global MCP servers.** Today's IDE sessions inherit `sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7` from `~/.claude.json`. Routing those through CodeMode could replace ~10–20k of MCP schema cost with one ~500-token `execute_code`. Big win, separate wave because it touches user-global config.
- **`internalMcp` barrel split.** `src/main/internalMcp/index.ts` pulls Electron `app` transitively, blocking unit-test imports. Phase C inlined a copy of the entry-shape logic in `scopedMcpConfig.ts` to dodge this. A follow-up could move the shape logic to a leaf module so the duplication can be removed.

---

## Wave 50 follow-ups

- Original rule files at `~/.claude/rules/init-safety.md` and `~/.claude/rules/project-claude-md-template.md` remain in place pending one wave of slash-command soak. Delete after Wave 51 confirms `/init-safety` and `/claudemd` invocations are clean.
- Project-level rules (9 files in `.claude/rules/`) classified but not converted this wave — see `roadmap/wave-50-rule-classification.md`. A future wave can convert any flagged as `hook` candidates.
- Re-run `npx tsx scripts/analyze-graph-adherence.ts` quarterly. Activate `hooks.enforceGraphFirst` if adherence drops below 70%.
- `warnFullTestSuite` is IDE-log-only (the agent doesn't see the warning). To make it agent-visible, surface the warn in `assets/hooks/pre_tool_use.mjs` stdout output. See `docs/hook-migration.md` for the change shape.

---

## Previous state (Wave 40 handoff, still accurate for baseline)

---

## What this project is

**Ouroboros / Agent IDE** — an Electron desktop IDE (three-process: main / preload / renderer) for launching, monitoring, and orchestrating Claude Code sessions. Built from within itself — Claude Code runs as a terminal inside the IDE it edits. Never `taskkill` Electron processes. Prefer HMR (Ctrl+R) over full restarts. Repo at `C:\Web App\Agent IDE\`, branch `master`, remote `origin` = `Stacey-Industries/Ouroboros`.

---

## Final state

### Commits and test counts

```
Final commit SHA:     998f796  (Wave 40 Phase I — docs)
Phase J SHA:          (see below — committed after this handoff)
Vitest test count:    7055 tests in 637 test files — all passing
TypeScript:           tsc --noEmit clean (main + web tsconfigs)
Lint:                 0 errors, 56 pre-existing warnings (react-compiler)
Playwright tests:     68 tests in 15 files (list only — E2E requires built web app)
```

### Branch state

`master` is clean. The parent will push both Wave 40 Phase I + Phase J commits together after review. No uncommitted changes in the working tree.

---

## Wave completion record (15–40)

| Wave | Title | Status | Key flag |
|---|---|---|---|
| 15 | Context Injection Baseline | Shipped | n/a |
| 16 | Session Primitive | Shipped | n/a |
| 17 | Layout Presets | Shipped | n/a |
| 18 | Codebase Graph | Shipped | n/a |
| 19 | PageRank + Provenance Weights | Shipped | n/a |
| 20 | Agent Conflict Detection | Shipped | n/a |
| 21 | Background Job Queue | Shipped | n/a |
| 22 | Session Checkpoints + Time Travel | Shipped | n/a |
| 23 | /spec Slash Command | Shipped | n/a |
| 24 | Haiku Reranker + Decision Logging | Shipped | `context.rerankerEnabled` (default on) |
| 25 | Streaming Inline Edit | Shipped | flag removed in Wave 40 |
| 26 | In-Editor Hunk Gutter | Shipped | n/a |
| 27 | LSP Integration | Shipped | n/a |
| 28 | Extension System | Shipped | n/a |
| 29 | Context Decision Writer + Outcome Writer | Shipped | n/a |
| 30 | Research Auto-Firing | Shipped | `research.auto` (default off; 4-week soak gate) |
| 31 | Learned Context Ranker + Lean Packet Mode | Shipped | `context.learnedRanker` (default off); `context.packetMode` (default 'full') |
| 32 | Mobile-Responsive Refinement | Shipped | `layout.mobilePrimary` (default off) |
| 33a | Mobile Client-Server Hardening | Shipped | `mobileAccess.enabled` (default off) |
| 33b | Capacitor Native Shell (Android) | Shipped | n/a; iOS deferred until Mac access |
| 34 | Cross-Device Session Dispatch | Shipped | `sessionDispatch.enabled` (default off) |
| 35 | Theme Import & Customization | Shipped | `theming.vsCodeImport` (default on) |
| 36 | Multi-Provider Optionality | Shipped | `providers.multiProvider` (default off) |
| 37 | Ecosystem Moat | Shipped | `ecosystem.moat` (default on) |
| 38 | Platform & Onboarding | Shipped | `platform.onboarding` (default on) |
| 39 | Research Classifier | **SKIPPED** | Contingent — Wave 30 telemetry insufficient to justify. Formally closed. |
| 40 | System Cleanup & Deprecation | Shipped | n/a |

### Wave 40 phase summary

| Phase | Scope | Outcome |
|---|---|---|
| A | Audit — dead code candidates, knip report, known-issues audit | Produced `roadmap/wave-40-audit-report.md`. No code changes. |
| B | Retire dead context reasons (`semantic_match`, `active_file`, `open_file`) + type union cleanup | Complete. |
| C | Trim dead REASON_WEIGHTS entries (zero-weight tombstones removed) | Complete. |
| D | Cut `windowSessions` write path, migrated to `sessionsData` (SQLite) | Complete. |
| E | `panelSizes` localStorage fallback | Closed without code change — audit confirmed it is the sync cold-start read source, not a fallback. |
| F | Remove `streamingInlineEdit` feature flag (inline enabled path) | Complete. Settings toggle removed, `useStreamingInlineEditFlag.ts` deleted. |
| G | `internalMcp` decision | **Keep + correct docs.** Module is wired and live. Stale "UNWIRED" language removed from CLAUDE.md. |
| H | Knip zero-dead sweep in orchestration/session/research modules | Complete. Dead contextWorker files + unused exports cleaned. |
| I | Docs consolidation | Complete. `docs/context-injection.md` (new), `docs/architecture.md` extended, `CLAUDE.md` updated. |
| J | Capstone verification + this handoff | Complete. 7055/7055 vitest passing, 0 tsc errors, 0 lint errors. |

---

## What's next (not new waves — ongoing maintenance)

The roadmap is complete. What follows are continuing maintenance and operations activities, not new development waves:

### Flag soak gates (flip when conditions met)

**`context.learnedRanker → true`** (Wave 31):
- Requires: ≥ 2 weeks of samples since 2026-04-17, ≥ 1000 labeled outcomes in `context-outcomes.jsonl`, most-recent held-out AUC > 0.75, shadow-mode A/B overlap ≥ 80%.
- Flip by: `config.set('context.learnedRanker', true)` or Settings UI toggle once the dashboard shows AUC > 0.75.

**`context.packetMode → 'lean'` default** (Wave 31):
- Requires: 2 weeks of observation with half of sessions manually set to lean, `missed` rate < 5%.

**`mobileAccess.enabled` default-on** (Wave 33a):
- Blocked on Wave 33b shipping a native mobile client to a real device. No soak gate beyond that — user opts in per install.

**`providers.multiProvider → true` default** (Wave 36):
- Soak: zero regressions from Gemini/Codex provider paths over 2-week dogfood period.

**`research.auto → true` default** (Wave 30):
- Soak: 4-week gate per roadmap. Auto-firing research subagents must not degrade response latency noticeably.

**`sessionDispatch.enabled` default-on** (Wave 34):
- Blocked on FCM stub being replaced with real `google-auth-library` integration for push notifications.

### iOS packaging (Wave 33b deferred)

All bridge code is cross-platform (Capacitor 6). Mac access unblocks iOS. Steps when ready:
1. `npx cap add ios` on a Mac with Xcode.
2. Apply Info.plist deep-link snippet from `capacitor-resources/ios-info-plist.deeplink-snippet.txt`.
3. Submit via TestFlight / App Store Connect.

### Marketplace production key (Wave 37)

Replace `'REPLACE_WITH_PRODUCTION_KEY'` in `src/main/marketplace/trustedKeys.ts` with the real Ed25519 public key before publishing any signed bundles. The matching private key is required to sign bundles — do not lose it.

### FCM push notifications (Wave 34)

`sessionDispatchNotifier.ts` has a stub FCM adapter. Wire `google-auth-library` (not `firebase-admin`) with JWT-signed HTTPS to FCM v1 API. Config: `sessionDispatch.fcmServiceAccountPath`.

### Ongoing dogfood

- Monitor `context-decisions.jsonl` + `context-outcomes.jsonl` growth. The retrain trigger (`contextRetrainTrigger.ts`) fires automatically at 200 new outcome rows with a 5-minute cooldown. Watch the Orchestration Inspector → Context Ranker tab for AUC progression.
- Monitor `refs/ouroboros/checkpoints/*` accumulation. GC policy runs lazily (keep last 50 per thread) on next checkpoint capture — no dedicated schedule.
- Background job queue caps (concurrency: 2, queue length: 50) are hardcoded. If these become binding, expose as Settings fields.

---

## CLAUDE.md grooming workflow

When a CLAUDE.md exceeds 200 lines:

1. **Prefer manual trim over regeneration** for small overshoots (≤20 lines over). Drop file-role tables, subdirectory indexes, and dependency lists — these are graph-derivable.
2. **Regenerate only after a material subsystem change** — significant reorganization, many new files, or the existing file is structurally stale. Run `generateForDirectory` via IPC or the settings panel.
3. **Never grandfather permanently.** The `<!-- claude-md-grandfathered -->` marker is an escape hatch for CI, not a resting state. Remove it at wave close.

See `docs/claude-md-lifecycle.md` for the full trim discipline, lean prompt principles, and organic growth workflow.

---

## Commit and push protocol (unchanged)

- Per-wave push by the parent agent after reviewing the aggregate diff.
- Never `--no-verify`. Never relax ESLint rules.
- Subagent prompts say "DO NOT PUSH". Parent runs full vitest before pushing.

---

## Key file locations

| What | Where |
|---|---|
| Wave plans (reference) | `roadmap/wave-NN-plan.md` |
| Roadmap overview | `roadmap/roadmap.md` |
| Context pipeline docs | `docs/context-injection.md` (NEW — Wave 40 Phase I) |
| Architecture | `docs/architecture.md` |
| API contract | `docs/api-contract.md` |
| Data model | `docs/data-model.md` |
| Provider guide | `docs/providers.md` |
| Auto-memory | `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` |
| Rules | `.claude/rules/*.md` (auto-injected) + `~/.claude/rules/*.md` (global) |
| Wave 40 audit | `roadmap/wave-40-audit-report.md` (scratch artifact, not deleted) |

---

## Quick recovery checklist for any future agent

- [ ] `git log -5 --oneline` — confirm final Wave 40 Phase I + J commits are present.
- [ ] `git status` — should be clean.
- [ ] `git log origin/master..HEAD` — should be empty (parent pushed after review).
- [ ] Read `docs/context-injection.md` before touching any context pipeline code.
- [ ] Before flipping `context.learnedRanker` to true, verify all soak conditions above.
- [ ] Before packaging iOS, read Wave 33b plan and ensure Mac + Xcode are available.
- [ ] The `src/main/internalMcp/CLAUDE.md` says "UNWIRED" — that is stale. The module is wired and live in `main.ts`. Root `CLAUDE.md` has the correct statement.

---

## Manual smoke gate (Wave 58+)

**Required for any wave touching `src/renderer/components/Layout/**`.** Green CI is not sufficient — Wave 47 shipped with multiple BLOCKER UX defects despite all tests passing, because the tests measured implementation shape, not user experience. The manual smoke gate is the missing layer.

### Checklist template

Copy this block into the wave's result brief and fill in each item before pushing.

```
Wave: ___  Date: ___  Tester: ___

Launch
[ ] App launches with `layout.chatWorkbench: true` set in config.
[ ] No white borders visible anywhere in the workbench shell.
[ ] No debug labels visible (e.g. "Active utility:", enum dumps, testid text).
[ ] No developer scaffold visible (e.g. pill toggle rows, raw state dumps).

Rail
[ ] Workbench rail renders with correct groups (active sessions / background / recent chats).
[ ] New session button: creates a session AND navigates the conversation pane to it.
[ ] Launch agent button: opens the multi-session launcher overlay.
[ ] Clicking a session row: activates that session and navigates to its thread.
[ ] Right-click a session row: context menu appears with Delete / Archive.
[ ] Right-click a chat row: context menu appears with Pin/Unpin / Rename / Delete.
[ ] Rail collapse toggle: rail collapses to icon-only width; toggles back.

Utility drawer
[ ] Drawer does not open on first paint (no pending approvals, no diff review).
[ ] Activity tab: renders timeline (or "No timeline entries yet." if empty).
[ ] Approvals tab: renders approval panel (or "No approvals are waiting." if empty).
[ ] Review tab: renders diff review panel (or "No diff review is pending." if empty).
[ ] Rules tab: renders rules panel with Rules / Rule Files sections.
[ ] Subagents tab: renders subagent panel or empty state.
[ ] Close button in drawer header: dismisses the drawer.
[ ] After dismissing, same-trigger event does NOT re-open the drawer.

User menu
[ ] User menu trigger visible in rail footer.
[ ] Settings (Ctrl+,): opens settings overlay.
[ ] Theme toggle: switches theme immediately.
[ ] Keyboard shortcuts (Ctrl+/): opens cheat sheet overlay.
[ ] Command palette (Ctrl+K): opens palette.
[ ] Exit chat mode: returns to IDE shell.

Approvals integration
[ ] Trigger an agent tool-call that requires approval.
[ ] Utility drawer auto-opens to Approvals tab.
[ ] Approving the request: drawer stays open, request cleared.
[ ] Dismissing drawer: does not re-open when same request is still pending.

Exit
[ ] Exit button / Ctrl+Shift+I: IDE shell mounts cleanly, no console errors.
[ ] Re-entering workbench mode: shell state restores (rail open, last tab).

Signature: ___________________________  (wave author or designated reviewer)
```
