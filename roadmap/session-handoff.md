# Roadmap Session Handoff — 2026-04-17 (Wave 31 complete)

> Continuation doc for a brand-new Claude Code session. Read this first. Wave 31 is fully landed and pushed. The user's last directive was **"do wave 31 and stop after that"** — do not auto-start Wave 32 without new instructions.

---

## 1. What this project is (one paragraph)

**Ouroboros / Agent IDE** — an Electron desktop IDE (three-process: main / preload / renderer) for launching, monitoring, and orchestrating Claude Code sessions. Built *from within itself* — Claude Code runs as a terminal inside the IDE it edits. Never `taskkill` Electron processes. Prefer HMR (Ctrl+R) over full restarts. Repo at `C:\Web App\Agent IDE\`, branch `master`, remote `origin` = `Stacey-Industries/Ouroboros`.

---

## 2. The ongoing job

A 26-wave roadmap (Waves 15 → 40). Waves 15–31 are complete. The user paused autonomous progression at end of Wave 31 — wait for explicit instructions before starting Wave 32.

### Commit + push protocol (current, as of 2026-04-17)

This changed mid-session. The current policy:

- **Per-phase commits** by subagents (one commit per phase).
- **Push once per wave**, by the parent agent, **after reviewing the aggregate diff** and running the full test suite.
- Subagent prompts must explicitly say "DO NOT PUSH". Parent runs `git push origin master` after verification.
- Commit subject: `feat: Wave N Phase X — short summary`.
- Co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Never** use `--no-verify`. **Never** relax ESLint rules to pass a hook. Memory entry: `feedback_never_change_lint_rules.md`.

Why the change: at start of this session the user flagged 22 unpushed local commits. Per-phase auto-push spammed GitHub mid-wave; per-wave push keeps history coherent. Durable rule saved at `~/.claude/projects/C--Web-App-Agent-IDE/memory/feedback_wave_push_policy.md`.

### Subagent rules (non-negotiable)

- **Model:** always `model: "sonnet"` for parallel work. Opus only if user explicitly approves.
- **No `npm test` inside subagents.** Full vitest suite (~260s) exceeds subagent patience and they hang. Subagents run scoped: `npx tsc --noEmit`, `npm run lint`, and `npx vitest run <specific file>`. The parent runs the full suite with `timeout 540 npx vitest run` before pushing. Memory: `feedback_agent_test_verification.md`.
- **ESLint ceiling is hard:** max 40 lines/function, 300 lines/file, complexity 10, max-depth 3, max-params 4. If a subagent approaches the file cap, it must extract helpers (split point guidance is in each phase plan).
- **Design tokens only** in renderer — no hex/rgb/rgba. Pre-commit hook blocks new hardcoded colors. See `.claude/rules/renderer.md`.
- **Debug-before-fix:** after one failed fix, add `log.info('[trace:TAG]', ...)` at every decision branch. Never propose 3+ fixes from code reading alone. Memory: `feedback_debug_before_fix.md`.

---

## 3. Where things stand right now

### Current branch state

```
Last pushed commit: 98bb859 feat: Wave 31 Phase F — context ranker observability dashboard
                    20f6c6f feat: Wave 31 Phase D — context selector learned ranker + shadow mode
                    1ba6495 feat: Wave 31 Phase E — lean packet mode
                    7b3ed8b feat: Wave 31 Phase C — context retrain trigger
                    d9abbde feat: Wave 31 Phase B — context classifier module
                    33410ab feat: Wave 31 Phase A — train-context.py
                    9cd9bc4 docs: Wave 31 implementation plan
                    61b1cd7 ← last pre-Wave-31 commit (Wave 30 end)
```

`origin/master` is caught up to `98bb859`. Working tree is clean.

### Waves done (15–31, all landed on origin/master)

- **Waves 15–30** — see git log; scope per `roadmap/wave-NN-plan.md`.
- **Wave 30** — Research Auto-Firing (10 phases A–J). Phase J added per-model training cutoffs via `Record<ModelId, ModelTrainingInfo>` (compile-time enforcement — new models fail tsc without an entry). Feature flag `research.auto` default off; 4-week soak gate.
- **Wave 31** — Learned Context Ranker + Lean Packet Mode. **Just completed this session.** Details below.

---

## 4. Wave 31 — detailed rundown (this session's work)

Plan: `roadmap/wave-31-plan.md`. All 6 phases shipped. Target v2.0.1 (patch). Two feature flags, both default off pending soak gates.

### Phase-by-phase

| Phase | Scope | Files | Commit |
|-------|-------|-------|--------|
| A | `tools/train-context.py` mirrors `train-router.py`. scikit-learn LogisticRegression, stratified 80/20, roc_auc_score. Outputs `context-retrained-weights.json` with `{version, featureOrder, weights, bias, metrics{samples, heldOutAuc, trainedAt}}`. | `tools/train-context.py` | `33410ab` |
| B | `contextClassifier.ts` — sigmoid scorer + hot-swap. `score(features)`, `reloadContextWeights()`. Loads `context-retrained-weights.json`; falls back to `contextClassifierDefaults.ts` (bundled). | `src/main/orchestration/contextClassifier.ts`, `contextClassifierDefaults.ts`, tests | `d9abbde` |
| C | `contextRetrainTrigger.ts` — fs.watch + 500ms debounce on `context-outcomes.jsonl`. Retrains when newRows ≥ 200 and outside 5-min cooldown. Spawns python, parses `trained samples=N auc=0.xx version=...`, calls `reloadContextWeights()` on success. | `contextRetrainTrigger.ts`, `contextRetrainTriggerHelpers.ts`, tests | `7b3ed8b` |
| D | Selector refactor. Extracted `contextSelectorFeatures.ts` (pure `computeFeatures`) + `contextSelectorRanker.ts` (classifier rank + `runShadowMode`). `contextSelector.ts` branches on `context.learnedRanker` flag. Shadow mode: flag off → classifier runs anyway, logs `[context-ranker] shadow {additiveTopN, classifierTopN, overlap}`; errors swallowed once via `shadowErrorLogged` guard. | `contextSelector.ts` (modified), `contextSelectorFeatures.ts` (new), `contextSelectorRanker.ts` (new), tests, `configSchemaTail.ts` | `20f6c6f` |
| E | Lean packet mode. Config `context.packetMode: 'full' \| 'lean'` default `'full'`. Lean drops `<project_structure>`, caps `<relevant_code>` to 6 files, keeps workspace_state/current_focus/diagnostics/terminal/PageRank/memories/skills/system_instructions. Settings UI radio in AI Agents tab. | `claudeCodeContextBuilder.ts`, `config.ts`, `configSchemaTail.ts`, `AgentContextPacketSection.tsx` + test, `AgentSection.tsx` | `1ba6495` |
| F | Observability dashboard. IPC `context:getRankerDashboard` → `{version, trainedAt, auc, topFeatures[5]}`. Renderer `ContextRankerCard.tsx` with color-coded ±weight bars. New sub-tab `'context-ranker'` in `OrchestrationInspector.tsx` (mirrors Wave 30 Phase H research tab pattern). | `contextRankerDashboardHandlers.ts` + test, `ContextRankerCard.tsx` + test, preload/type updates, `ipc.ts`, `OrchestrationInspector.tsx` | `98bb859` |

### Feature flags (both default off)

- `context.learnedRanker` (boolean, default `false`)
  - Off: additive path drives top-N. Classifier runs in **shadow mode**, recording both scores to telemetry for offline AUC verification.
  - On: classifier score is the ranking key. Wave 24 reranker still runs AFTER top-N in both branches.
- `context.packetMode` (enum `'full' | 'lean'`, default `'full'`)

### Soak gates (DO NOT flip flags before these are met)

**`context.learnedRanker` → `true` requires:**
1. ≥ 2 weeks of samples since Phase D landed (2026-04-17).
2. ≥ 1000 labeled samples in `context-outcomes.jsonl`.
3. Most-recent held-out AUC > 0.75.
4. Shadow-mode A/B telemetry shows classifier↔additive top-N overlap ≥ 80%.

**`context.packetMode` → `'lean'` default requires:**
1. 2 weeks of observation with half of sessions manually set to lean.
2. `missed` rate across recorded sessions < 5%.

### Feature order (MUST stay in sync)

`contextClassifierDefaults.ts` defines `featureOrder` — 9 features:
```
recencyScore, pagerankScore, importDistance, keywordOverlap, prevUsedCount,
toolKindHint_read, toolKindHint_edit, toolKindHint_write, toolKindHint_other
```
`contextSelectorFeatures.ts::computeFeatures()` MUST produce the object in this exact key order. There is a test (`feature order matches defaults`) asserting `Object.keys(features) === BUNDLED_CONTEXT_WEIGHTS.featureOrder`. If you add features, update both files and the trainer's feature extraction together.

### Gotchas and non-obvious decisions

- **`findPython` duplication:** `contextRetrainTriggerHelpers.ts` duplicates `router/retrainTriggerHelpers.ts::findPython` with a `// TODO: extract to shared` comment. The router's version isn't exported from a non-circular location. Leave the TODO until a future "orchestration utilities" cleanup wave.
- **`countRows` mocking:** retrain trigger tests mock `countRows` rather than using real `fs.promises`. Real I/O leaves libuv callbacks outliving test boundaries. The helpers test covers `countRows` against a real tmpdir.
- **Shadow mode error-suppression is intentional:** classifier failures must NOT surface in the UI or block selection. One warn log per process lifetime via module-level boolean; everything else stays silent.
- **`researchDashboardHandlers.test.ts` has nested `vi.mock` warnings.** Pre-existing, not caused by Wave 31. The new `contextRankerDashboardHandlers.test.ts` mirrored the same pattern and also warns. Both tests pass; warnings are vitest future-deprecation notices. Fixing is a cross-cutting chore.
- **Config path for new flags:** `src/main/configSchemaTail.ts` owns the `context` sub-schema. Renderer-side mirror is `src/renderer/types/electron-foundation.d.ts` (AppConfig → context). Keep both in sync.

### Test regressions fixed mid-session

Landed Wave 30 required repairing two test files that broke on flag/plumbing changes:
- `src/main/research/triggerEvaluator.test.ts` — added `vi.mock('../config', () => ({ getConfigValue: vi.fn(() => undefined) }))` at top of file. Without this, the real ElectronStore instantiates at module load and hits the user's on-disk `profiles` field, failing schema validation with `Config schema violation: profiles must be array`.
- `src/renderer/components/AgentChat/AgentChatComposerSection.test.tsx` — added mocks for `ToastContext`, `ResearchModeToggle`, and `useResearchModeShortcut` (Phase G wired `useToastContext().toast` into the composer, and ResearchModeToggle tried to read `window.electronAPI.research.getSessionMode` which is undefined in jsdom).

### Verification summary at push time

```
npx tsc --noEmit           → clean
npm run lint               → 0 errors
timeout 540 npx vitest run → 469 test files, 5425 tests, all passing (260s)
```

---

## 5. What remains after Wave 31

The user said "do wave 31 and stop after that." Do not auto-start Wave 32.

Upcoming waves (scope in `roadmap/roadmap.md`):

- **Wave 32** — Mobile-Responsive Refinement
- **Wave 33** — Mobile Shell & Client-Server Hardening
- **Wave 34** — Cross-Device Session Dispatch
- **Wave 35** — Theme Import & Customization
- **Wave 36** — Multi-Provider Optionality
- **Wave 37** — Ecosystem Moat
- **Wave 38** — Platform & Onboarding
- **Wave 39** — Research Classifier (Contingent)
- **Wave 40** — System Cleanup & Deprecation

When the user signals to resume: draft `roadmap/wave-32-plan.md` first (Sonnet subagent), confirm with the user if scope is ambiguous, then implement one phase at a time.

---

## 6. Operational reminders

### File locations

- Plans: `roadmap/wave-NN-plan.md` (one per wave)
- Roadmap overview: `roadmap/roadmap.md`
- Auto-memory: `C:\Users\coles\.claude\projects\C--Web-App-Agent-IDE\memory\MEMORY.md` + per-topic files
- Rules: `.claude/rules/*.md` (auto-injected by glob) + `~/.claude/rules/*.md` (global)

### Commands

- `npm run dev` — dev server + Electron (HMR). Don't start a second instance unless testing.
- `npm run build` — electron-vite production build.
- `npx tsc --noEmit` — full typecheck.
- `npm run lint` — ESLint.
- `timeout 540 npx vitest run` — full test suite (runs in ~260s).
- `npx vitest run <path>` — scoped tests. Use this in subagents.

### Auto-memory highlights relevant to wave work

| Memory | Why it matters |
|--------|----------------|
| `feedback_wave_push_policy.md` | Per-wave push, parent reviews first |
| `feedback_agent_test_verification.md` | Subagents must not run full `npm test` |
| `feedback_agent_model_selection.md` | Subagents default to `model: "sonnet"` |
| `feedback_never_change_lint_rules.md` | ESLint caps are hard — extract helpers instead |
| `feedback_debug_before_fix.md` | Add logging before 2nd fix attempt |
| `feedback_verify_before_planning.md` | Read code, don't infer from docs, when scoping |
| `user_auth_subscription.md` | Max subscription only — no API key; use CLI spawn pattern |

### Meta-development warning

This IDE edits itself. A terminal session of Claude Code is always running in the host window. Never kill Electron. The hooks server on the named pipe receives events from both the current dev session and any child sessions — filter by session ID when debugging. See `.claude/rules/multi-process-debugging.md`.

---

## 7. Quick recovery checklist for next agent

- [ ] `git log -7 --oneline` to confirm Wave 31 commits are present locally.
- [ ] `git status` should be clean.
- [ ] `git log origin/master..HEAD` should be empty (all pushed).
- [ ] Read `roadmap/wave-31-plan.md` if touching context ranker code — feature flags, soak gates, and acceptance criteria live there.
- [ ] Before flipping either Wave 31 flag to true, verify the soak gate in §4 above.
- [ ] If starting Wave 32, confirm scope with user first; then draft plan doc before implementing.
