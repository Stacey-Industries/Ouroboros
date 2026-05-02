# Wave 62 — Ephemeral Rule Toggles in Chat-Only Workbench

## Status

DRAFT · target v2.9.0 · depends on existing `rulesAndSkills` subsystem and chat-only workbench (Wave 42+/46+).

## Why this wave exists

In chat-only mode, the user has no way to mute a global or project rule for a single session. Rules at `~/.claude/rules/*.md` and `<project>/.claude/rules/*.md` are auto-injected by the Claude Code harness based on glob frontmatter — there is no runtime filter we can register, and no `--rules-dir` CLI flag to redirect discovery. The only durable lever is the filesystem itself.

The user's intent is **ephemeral** disabling: toggle a rule off, spawn a session that doesn't see it, and have the toggle reset to baseline on the next session — no manual re-enable required. This shape matches how the user already thinks about rules ("baseline on") and avoids the failure mode of forgetting that a rule was disabled three sessions ago.

## Goal

A toggle switch on every rule row in the existing `RulesTab` component that:

1. Disables a rule by moving its file to `.claude/rules-disabled/` (sibling of `.claude/rules/`).
2. Auto-restores all disabled rules to the active dir immediately after a chat session's first spawn completes (system prompt already ingested → on-disk state no longer affects the running session).
3. Surfaces the same toggle in both the chat-only utility drawer's Rules panel and the IDE-mode right-sidebar Claude Config panel — both already render via the same `RulesTab.tsx`.

Net UX: user opens rules popup, flips off `manual-smoke-gate.md`, sends a message, that session ignores manual-smoke-gate, and the next chat starts with manual-smoke-gate active again.

## Locked decisions

1. **Disable mechanism: move to sibling dir.** `<rules-root>/foo.md` → `<rules-root>-disabled/foo.md`. Reversible by file move; no extension munging; clean to inspect; survives if the user hand-edits while disabled.
2. **Restore timing: post-spawn, not pre-spawn.** Restore fires after the spawned `claudeStreamJsonRunner` confirms the session is up (system prompt has been built). Resumed sessions (`--resume`) don't re-read rules from disk, so restore is a no-op for them.
3. **Scope of toggle state: per-(global, project) pair, persisted only in memory + filesystem.** No new config schema entry. The "is this rule disabled right now" question is answered by `existsSync('<rules-disabled>/<id>.md')`.
4. **Single source of truth for the UI: `RulesTab.tsx`.** Both surfaces (chat-only utility drawer, IDE right-pane) already share it. Adding the toggle in one place lights up both.
5. **No Settings-modal mirror in v1.** User confirmed the popup placement is what matters; a Settings section can come later if needed. This keeps the wave tight.
6. **Crash-safety: orphan-restore on app start.** If the app or a session crashed while rules were disabled, leaving files in `.claude/rules-disabled/`, the main process restores them at boot. Baseline-on invariant holds across app lifetimes.

### Open questions for next agent

- Is there a meaningful difference between "first session-spawn" and "first message" in the chat-only resume model? (Project memory: chat uses `--resume` after first spawn.) Verify in `claudeStreamJsonRunner.ts` that the spawn-complete event we hook is the post-system-prompt-ingestion moment.
- Concurrent windows: if window A toggles off rule X and window B spawns a session simultaneously, window B's session also sees rule X disabled. Acceptable for v1 — document in the gotcha.

## Scope

**In scope:**

- New `disableRule(id, scope)` / `restoreAllDisabled(scope)` APIs in `src/main/rulesAndSkills/rulesDirectoryManager.ts`.
- IPC channel + preload bridge + `electron.d.ts` types for toggle/list-with-state/restore.
- Toggle switch in `RulesTab.tsx` (uses existing `ToggleSwitch` from `src/renderer/components/Settings/ToggleSwitch.tsx`).
- Hook update in `src/renderer/hooks/useRulesAndSkills.ts` to expose toggle action + per-rule disabled flag.
- Post-spawn restore wiring in the chat-only spawn path (likely `src/main/ipc-handlers/agentChatOrchestration.ts` `submitTaskToAdapter` or one layer in).
- Boot-time orphan restore in main process startup (likely `src/main/main.ts` or a dedicated init in `rulesAndSkills/`).
- Manual smoke checklist (required by `~/.claude/rules/manual-smoke-gate.md` — this wave touches `Layout/ChatOnlyShell/`).

**Out of scope:**

- Persistent / per-session rule profiles (would need a real config schema).
- Settings-modal section.
- Toggling individual rules INSIDE `~/.claude/CLAUDE.md` or project `CLAUDE.md` (those aren't separate files).
- Toggling skills, commands, hooks, memory entries — only `*.md` rule files in `<rules-root>/`.
- Telemetry on toggle usage (defer to a follow-up).

## Phases

| Phase | Topic                        | Notes                                                                                                                                                                                                                                     |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | ADR                          | Write `roadmap/decisions/wave-62.md` capturing the move-to-sibling decision, post-spawn restore timing, and the rejected alternatives (extension rename, manifest+staging).                                                               |
| A     | Backend disable/restore APIs | Extend `rulesDirectoryManager.ts` with `disableRule`, `enableRule`, `restoreAllDisabled`, and a `discoverRuleFiles` extension that also reads `<rules-disabled>/` and tags those entries `disabled: true`. Unit tests against a temp dir. |
| B     | IPC + preload + types        | New channels: `rules:toggle`, `rules:restoreAll`, `rules:listWithState`. Update `electron.d.ts`. Standard `{ success, error? }` envelope.                                                                                                 |
| C     | Renderer hook + UI           | Update `useRulesAndSkills.ts` to read `disabled` flag and expose `toggleRule(id, scope)`. Add `<ToggleSwitch>` to each row in `RulesTab.tsx`. Disabled rows render with reduced opacity + an "off this session" hint.                     |
| D     | Spawn-time restore           | Identify the post-spawn confirmation event in `claudeCodeLaunch.ts` / `claudeStreamJsonRunner.ts`. Call `restoreAllDisabled()` on that signal. Ensure idempotency — restore is safe to call when nothing is disabled.                     |
| E     | Boot-time orphan restore     | Call `restoreAllDisabled()` once during main-process startup, before any window opens. Log how many files were restored.                                                                                                                  |
| F     | Manual smoke + result brief  | Run the smoke checklist from `roadmap/session-handoff.md`. Sign in `roadmap/auto-briefs/wave-62-result.md`.                                                                                                                               |

## Risks

| Risk                                                                                  | Mitigation                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore fires before Claude Code actually reads rules                                 | Hook into the _post-spawn_ event the runner emits after the system prompt is constructed — not the PTY-spawn moment. Verify in Phase D with a debug log on both sides per `~/.claude/rules/debug-before-fix.md`. |
| User edits a rule while it's in the disabled dir; restore overwrites                  | Restore moves, doesn't overwrite. If a same-named file already exists in active dir (shouldn't happen — we moved it out), abort the restore for that file and warn.                                              |
| Two windows racing on toggle/restore                                                  | File operations are atomic per-file via `fs.rename`. Worst case: one window's toggle is invisible to a sibling window's already-spawned session. Acceptable for v1.                                              |
| Concurrent same-name across global + project (e.g., both have `manual-smoke-gate.md`) | Toggle is keyed by `(scope, id)`. Disabled dirs are separate per scope (`~/.claude/rules-disabled/` vs `<project>/.claude/rules-disabled/`).                                                                     |
| Disabled dir gets git-tracked unintentionally                                         | Document in result brief: project-scope disabled dir should be gitignored. Wave 62 adds `/.claude/rules-disabled/` to the project's `.gitignore` proactively.                                                    |

## Acceptance criteria

- [ ] ADR at `roadmap/decisions/wave-62.md`.
- [ ] `npm test` passes; new unit tests for `rulesDirectoryManager` disable/restore round-trip.
- [ ] Toggle on a rule in the chat-only utility drawer → file appears in `<rules-root>-disabled/`. Submit a chat message → session spawns → file moves back to active dir within ~1s of spawn confirmation.
- [ ] Same flow works in IDE-mode right-pane Claude Config panel (no extra UI work — shared component).
- [ ] App restart with files left in disabled dir restores them on boot, logged at `info`.
- [ ] `.gitignore` updated.
- [ ] Manual smoke entry signed in `roadmap/auto-briefs/wave-62-result.md`.
- [ ] Subsystem `CLAUDE.md` (`src/main/rulesAndSkills/CLAUDE.md` if it exists, else top-level) gains a Gotchas line about post-spawn restore timing.

## Files the next agent should read first

1. `src/main/rulesAndSkills/rulesDirectoryManager.ts` — discovery surface to extend.
2. `src/renderer/hooks/useRulesAndSkills.ts` — data flow into the UI.
3. `src/renderer/components/AgentChat/RulesTab.tsx` — where the toggle switch lands.
4. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx` (lines 127–149) — confirms shared rendering.
5. `src/main/orchestration/providers/claudeCodeLaunch.ts` and `claudeStreamJsonRunner.ts` — spawn lifecycle; locate the post-system-prompt event for restore timing.
6. `src/main/ipc-handlers/agentChatOrchestration.ts` (`submitTaskToAdapter`) — pre/post-spawn seam.
7. `src/renderer/components/Settings/ToggleSwitch.tsx` — reuse, do not re-implement.
8. `roadmap/wave-61-delegation-coach.md` — wave file shape and tone.

## Verification (end-to-end)

1. `npm run dev`. Open the chat-only workbench. Open the rules panel in the utility drawer.
2. Toggle off a known harmless rule (e.g. `manual-smoke-gate.md`). Observe file appears in `<rules-disabled>/`.
3. Send a chat message. While streaming, observe the file is moved back to the active dir.
4. In the same session, ask the agent to recite the rule's content — it should not appear in its system context (best-effort verification; primary check is the file move).
5. Open a NEW chat. Confirm baseline (file in active dir, toggle UI shows ON).
6. Repeat in IDE-mode right pane to confirm the shared `RulesTab` component carries the toggle.
7. Quit and relaunch the app with a file artificially left in `<rules-disabled>/` — confirm boot-time orphan restore moves it back.
8. `npx vitest run src/main/rulesAndSkills` for the new unit tests.
9. Full `npm test` + `npm run build` once before push (per `~/.claude/rules/test-scope.md`).

## A note to the next agent on tone

This is a small wave — one subsystem extension, one IPC channel, one new UI control. Resist the urge to grow it. No telemetry, no settings-modal mirror, no per-session profiles. The user explicitly chose ephemeral over persistent — honor that.

The post-spawn restore is the only subtle bit. Add a `log.info('[trace:rules-restore]', { count, scope })` line on both sides of the event seam during Phase D so we can debug timing without code-reading. Keep the structural log; remove only investigation-specific noise.
