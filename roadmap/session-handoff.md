# Roadmap Session Handoff — 2026-04-17

> **ROADMAP COMPLETE.**
>
> All planned waves (15–38, plus Wave 40 cleanup) have shipped. Wave 39 is formally closed as skipped (contingent wave — telemetry did not justify a dedicated classifier). No further waves are queued. This document is the final handoff for the Ouroboros development roadmap.

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
