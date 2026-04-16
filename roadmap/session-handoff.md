# Roadmap Session Handoff — 2026-04-16 (updated 2026-04-17)

> Continuation doc for a brand-new Claude Code session. Read this first, then resume from Phase B.

---

## 1. What this project is (one paragraph)

**Ouroboros / Agent IDE** — an Electron desktop IDE (three-process: main / preload / renderer) for launching, monitoring, and orchestrating Claude Code sessions. Built *from within itself* — Claude Code runs as a terminal inside the IDE it edits. Never `taskkill` Electron processes. Prefer HMR (Ctrl+R) over full restarts. Repo lives at `C:\Web App\Agent IDE\`, branch `master`.

---

## 2. The ongoing job

A **26-wave roadmap** (Waves 15 → 40). Each wave is a self-contained feature set with 2–6 phases. The user wants you to march through the remaining waves **without stopping** until complete (or a rate-limit resume cron forces a pause).

**Commit protocol** (non-negotiable):
- One commit per phase (sometimes two adjacent phases combined — see history).
- Commit subject format: `feat: Wave N Phase X — short summary`.
- **Before every commit:** `npm run typecheck` + `npm run lint` + `npm test` must all pass.
- **Never** use `--no-verify`. **Never** relax ESLint rules to pass.
- Push after each commit (`git push`).

**Parallel work**: when phases are genuinely independent, spawn parallel Sonnet subagents with an explicit "DO NOT TOUCH" list to prevent merge conflicts.

---

## 3. Where things stand right now

### Current branch state (confirmed at handoff time)

```
Last commit on master: dcd9b2b feat: Wave 27 Phase A — subagent tracker + IPC
Previous:              6a5df23 fix: repair 19 pre-existing test failures on master
Previous:              e2d89f3 feat: Wave 26 Phase E — command approval memory + revoke UI
```

### What's done (Waves 15–27 Phase A, fully committed)

Every wave below closed with commits landed on master. Don't redo.

- **Wave 15** — Orchestration cleanup (KEEP/REMOVE split, graph handler gap intentional)
- **Wave 16** — Multi-root workspace + per-window project isolation
- **Wave 17** — Context packet primitive + passive graph injection
- **Wave 18** — Chat refactor (side-drawer, thread CRUD, hydrator)
- **Wave 19** — Checkpoint refs + revert-to-snapshot
- **Wave 20** — Cost history + rate-limit surfacing
- **Wave 21** — Thread search (SQLite FTS5), folders (@dnd-kit), cost dashboard, background job queue
- **Wave 22** — Multi-window sessions, bounds persistence, Mica glass, startup sequencer
- **Wave 23** — Fork primitive + branch metadata (Phase A) → branch UI + side-chat drawer (B+C) → merge-to-main + branch compare + auto-branch (D+E). **Includes the test-hang fix** (see §6).
- **Wave 24** — Context decision JSONL logging (A), per-turn outcome aggregation (B), Haiku reranker (C) — **reranker flag off by default** because Claude CLI cold-start ~1–3s exceeds 500ms target.
- **Wave 25** — Pinned context primitive (A), research subagent + TTL cache (B), research slash commands + composer interception (C), packet pin injection + outcome correlation (D), workspace read-list + research cancel UI (E).
- **Wave 26** — Profile abstraction: store + role presets + IPC (A), Settings UI + composer pill + diff card (B), inference controls + tool toggles + profile lint (C+D), command approval memory + revoke UI (E).
- **Wave 27 Phase A** — Subagent tracker: in-memory store + IPC handlers + preload bridge + shared types + hooks tap. Commit `dcd9b2b`.
- **Test fix** — 19 pre-existing test failures repaired (config mock patterns, channel counts, Monaco jsdom isolation). Commit `6a5df23`.

### Wave 27 — IN FLIGHT (Phase A done, Phase B next)

Plan lives at `roadmap/wave-27-plan.md`. Phase breakdown:

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Subagent tracker — main-process lifecycle, IPC, preload bridge, hooks tap | **✅ Done.** Committed at `dcd9b2b`. |
| B | `SubagentPanel` transcript view + "Open subagent chat" link + sidebar live-count chip + `ToolCallCard.tsx` integration | **Not started — next up** |
| C | Cancellation wiring (real PTY kill, not stub) + `UsageDashboard` parent+child rollup | Not started |

**Feature flag:** `agentic.subagentUx` (default `true`).

### Immediate next step

1. Read `roadmap/wave-27-plan.md`.
2. Implement Phase B (SubagentPanel UI + sidebar chip).
3. Implement Phase C (cancellation + cost dashboard integration).
4. `npm run typecheck && npm run lint && npm test` before each commit.
5. After Wave 27 closes, proceed to Wave 28.

### What remains after Wave 27

- **Wave 28** — Drag-and-Drop Pane Composition
- **Wave 29** — Diff Review, Graph Panel, Hook/Rule Authoring
- **Wave 30** — Research Auto-Firing (Context-Based)
- **Wave 31** — Learned Context Ranker (LTR) + Synthetic Bootstrap
- **Wave 32** — Mobile-Responsive Refinement
- **Wave 33** — Mobile Shell & Client-Server Hardening
- **Wave 34** — Cross-Device Session Dispatch
- **Wave 35** — Theme Import & Customization
- **Wave 36** — Multi-Provider Optionality
- **Wave 37** — Ecosystem Moat
- **Wave 38** — Platform & Onboarding
- **Wave 39** — Research Classifier (Contingent)
- **Wave 40** — System Cleanup & Deprecation

For each wave: read the corresponding `roadmap/wave-NN-plan.md` (create one if it doesn't exist — draft with a Sonnet subagent).

---

## 4. Wave 27 Phase A — committed (dcd9b2b)

All Phase A deliverables are committed. Key files:

### `src/main/agentChat/subagentTracker.ts` (242 lines)

In-memory subagent lifecycle tracker with EventEmitter. Manages spawn → heartbeat → exit lifecycle, parent-child tree, cost rollup.

### `src/main/hooksSubagentTap.ts` (27 lines)

Wires named-pipe hook events (`subagent:spawn`, `subagent:heartbeat`, `subagent:exit`) to the SubagentTracker.

### `src/main/ipc-handlers/subagent.ts` (140 lines)

Registers channels: `subagent:list`, `subagent:get`, `subagent:liveCount`, `subagent:costRollup`, `subagent:kill`, `subagent:tree`.

### `src/preload/preloadSupplementalSubagentApis.ts` (30 lines)

contextBridge API surface for renderer access.

### `src/shared/types/subagent.ts` + `src/renderer/types/electron-subagent.d.ts`

Shared types (SubagentInfo, SubagentTree, SubagentIpcApi) + IPC type declarations.

### Phase A items NOT yet done (deferred to later phases)

1. **IPC registration wiring** — `registerSubagentHandlers` is NOT yet called from `src/main/ipc.ts`. Wire it when integrating Phase B.
2. **Feature flag** — `agentic.subagentUx` not yet added to config schema. Add when Phase B UI lands.
3. **Real cancellation** — `subagent:kill` is a stub. Phase C will wire real PTY kill.

---

## 5. User directives (hard rules — do not violate)

| Rule | Source |
|---|---|
| **Sonnet subagents only.** Never launch Opus subagents. If a task seems to need Opus, surface the suggestion to the user and let them decide. | Global rule + user said "will wreck usage" |
| **Per-wave commit + push**, never batched across waves. | User directive |
| **Typecheck + lint + tests must pass before every commit.** | User directive |
| **Never relax ESLint rules** (max-lines:300, max-lines-per-function:40, complexity:10, max-depth:3, max-params:4, security/*:error). Split files / extract helpers / use options objects instead. | User directive + `feedback_never_change_lint_rules.md` |
| **Never `--no-verify`**. Fix underlying issue. | Global rule |
| **Max subscription, no API key.** OAuth only. Use `spawnClaude` CLI pattern. No direct Anthropic SDK calls. No prompt caching / countTokens endpoints. | `user_auth_subscription.md` |
| **Don't kill Electron processes.** The IDE is editing itself. | Project CLAUDE.md |
| **Debug before fixing**: after 1 failed fix, add logs and observe runtime — never propose 3+ fixes from code reading alone. | `feedback_debug_before_fix.md` |
| **Verify code before planning**: research agents fabricate ~80% of issues inferring from docs. Use check-and-fix agents, not plan-then-execute. | `feedback_verify_before_planning.md` |
| **Amplifier not replacement**: never throttle model capabilities; focus on visibility and context prep. | `feedback_product_philosophy.md` |
| **Chat agent must have full IDE control** (terminals, files, UI), not just text. | `feedback_chat_agent_parity.md` |

---

## 7. Test infrastructure — notes

### Full suite is green

All 379 test files (4272 tests) pass as of commit `dcd9b2b`. The test fix commit (`6a5df23`) repaired 19 pre-existing failures caused by:
- **Config schema validation at import time** — `config.ts:384` creates `new Store<AppConfig>()` at module scope. Any test that transitively imports it crashes. Fix: mock upstream modules (e.g., `vi.mock('../config', ...)`).
- **Channel count drift** — new IPC channels added without updating test assertions.
- **PtyPersistence interface change** — mock methods didn't match interface.
- **Monaco + jsdom** — `document.queryCommandSupported` not implemented in jsdom; `pdfjs-dist` needs `DOMMatrix`. Fix: mock `./ContentRouter` and `./PdfViewer` to cut off heavy native deps.

### Pre-existing lint errors (3 remaining, NOT introduced by test fixes)

```
agentChatCost.test.ts:56     security/detect-object-injection  (pre-existing)
profileCrud.test.ts:91-92    security/detect-object-injection  (pre-existing)
```

These are in unmodified code and do not block commits (no pre-commit hooks exist). Fix opportunistically if touching those files.

### Permanent test infra (do not undo)

### Fix 1 — Global `electron-log/renderer` mock

Root cause of the hang: 40+ renderer files import `electron-log/renderer`, which crashed fork workers silently. Fix lives in `vitest.setup.ts`:

```ts
vi.mock('electron-log/renderer', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), verbose: vi.fn() },
}));
```

### Fix 2 — Worker cap in `vitest.config.ts`

Windows accumulates orphan node workers (saw 121 at peak, starving new runs). `vitest.config.ts` now includes:

```ts
maxWorkers: 2,
minWorkers: 1,
// pool: 'forks' is required for better-sqlite3 (not thread-safe)
```

### If tests hang again

1. `Get-Process node | Stop-Process -Force` (via PowerShell tool) — clear orphans.
2. Check if new test files import something that boots a native addon at module-level. Add targeted `vi.mock(...)` in `vitest.setup.ts`.
3. Do **not** switch pools away from `forks` — it breaks `better-sqlite3`.

### `better-sqlite3` gotcha

Project's addon is compiled against Electron ABI, not system Node. `vitest.config.ts` aliases `better-sqlite3` to a system-Node build at `%LOCALAPPDATA%/Temp/sqlite-fresh/`. If tests import `better-sqlite3` and fail silently, that directory is missing — rebuild it with `npm rebuild better-sqlite3 --build-from-source` in a temp dir.

---

## 7. Commit + push rhythm

Use this loop for every phase:

```bash
# 1. Work
# 2. Lint + types + tests (scoped first, full before commit)
npm run typecheck
npm run lint
npm test

# 3. Commit (HEREDOC preserves formatting)
git add <files>
git commit -m "$(cat <<'EOF'
feat: Wave NN Phase X — short summary

- Bullet 1
- Bullet 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# 4. Push
git push
```

If a pre-commit hook blocks: **fix the issue**, re-stage, create a **new** commit. Never amend (amend modifies the previous commit — destructive when hooks block the intended commit).

---

## 8. Scheduled resume crons (user is asleep — do not cancel)

The user created 3 `CronCreate` triggers during their sleep cycle. Cadence:
- Active work ~4h → auto-pause 1h → resume → repeat
- Crons fire with prompts like "Resume roadmap work. Rate limit should have reset. Continue from git log."

**When a cron fires:**
1. Read this handoff + `git log --oneline -10`.
2. Identify the in-flight wave.
3. Continue.

**When a pause cron fires:** stop tool calls, respond with a short status, do not resume until the next resume cron.

User has `/extra-usage` enabled so you can work through rate limits.

---

## 9. Key file paths for orientation

Read only what you need per task-type (see `CLAUDE.md` Task-Type Skip List for the full matrix):

| Need | Path |
|---|---|
| Project overview | `CLAUDE.md` |
| Main process layout | `src/main/CLAUDE.md` |
| Agent chat subsystem | `src/main/agentChat/CLAUDE.md` |
| IPC handlers | `src/main/ipc-handlers/CLAUDE.md` |
| IPC contract types | `src/renderer/types/electron.d.ts` (single source of truth) |
| Config schema | `src/main/configSchema.ts` + `configSchemaMiddle.ts` + `configSchemaTail.ts` (split to satisfy max-lines:300) |
| Design tokens | `src/renderer/styles/tokens.css` + `.claude/rules/renderer.md` |
| Build config | `electron.vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts` |

---

## 10. Subagent launch template (use this verbatim pattern)

```
Agent({
  subagent_type: "general-purpose",
  model: "sonnet",                        // NEVER opus
  description: "Wave NN Phase X — <feature>",
  prompt: `
    CONTEXT: You are implementing Wave NN Phase X of the Ouroboros IDE roadmap.
    Plan file: roadmap/wave-NN-plan.md
    Do NOT modify: <explicit file list to avoid conflicts with parallel subagents>

    GOAL: <1–2 sentence spec>

    CONSTRAINTS (hard):
    - ESLint: max-lines:300, max-lines-per-function:40, complexity:10, max-depth:3, max-params:4, security/*:error
    - Test framework: vitest (pool:'forks' for better-sqlite3)
    - Never use --no-verify. Never relax lint rules.
    - Imports sorted (simple-import-sort).
    - Do NOT commit — I will commit after verifying your work.
    - Do NOT start a long-running dev server.

    DELIVERABLES:
    1. <file 1> with <shape>
    2. <file 2> with <shape>
    3. Test coverage for <cases>

    VERIFICATION (run before reporting done):
    - npm run typecheck
    - npm run lint -- <scoped to your files>
    - npm test -- <scoped to your tests>

    Report a punch-list of files changed + any constraints you couldn't meet.
  `
})
```

---

## 11. Memory system — what's already saved

Auto-memory at `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md`. Already contains:
- User constraints (Sonnet-only, max subscription no API key)
- Past fix history (xterm crash, chat context continuity, orchestration cleanup)
- Active initiatives (UI refactor, modernization, passive graph context, unified chat rendering)
- Product philosophy (amplifier not replacement, chat agent parity)
- Lint/test discipline feedback

**Read MEMORY.md at session start** — it's auto-loaded but worth a second pass when resuming mid-roadmap.

---

## 12. Known tech debt (not roadmap work — don't fix proactively)

From `CLAUDE.md` "Known Issues / Tech Debt":
- Double terminal tab bar (TerminalPane + TerminalManager both render headers)
- Settings modal inline in `App.tsx` instead of `components/Settings/`
- `internalMcp/` module implemented but never wired into `main.ts` startup
- `streamingInlineEdit` flag not yet removed (Phase 8 soak cleanup)
- Background job queue caps hardcoded (50)
- Checkpoint refs accumulate; GC is lazy (keeps last 50)

Track these but only touch them if a wave explicitly covers them.

---

## 13. First actions for the new session (copy-paste checklist)

```
[ ] Read this handoff (you're doing it)
[ ] git log --oneline -10          # confirm last commit is dcd9b2b (Phase A)
[ ] git status                      # confirm clean working tree
[ ] Read roadmap/wave-27-plan.md
[ ] Implement Phase B (SubagentPanel UI + sidebar chip)
[ ] npm run typecheck && npm run lint && npm test
[ ] Commit: feat: Wave 27 Phase B — SubagentPanel UI + live-count chip
[ ] Implement Phase C (cancellation + cost dashboard rollup)
[ ] npm run typecheck && npm run lint && npm test
[ ] Commit: feat: Wave 27 Phase C — cancel + cost rollup
[ ] Push all commits
[ ] Continue to Wave 28 → … → Wave 40
```

---

*Handoff updated at commit `dcd9b2b`, 2026-04-17. Delete this file after Wave 40 closes.*
