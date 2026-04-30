# Wave 62 — Result Brief: Ephemeral Rule Toggles

**Status:** SHIPPED 2026-04-30 · target v2.9.0
**Plan:** `roadmap/wave-62-rule-toggles.md`
**ADR:** `roadmap/decisions/wave-62.md`

## What shipped

A toggle switch on every rule row in the chat-only utility drawer's Rules panel and the IDE-mode right-pane Claude Config panel (both render via the shared `RulesTab.tsx`). Flipping a toggle moves the rule's `.md` file from `<rules-root>/` to a sibling `<rules-root>-disabled/` directory, taking it out of Claude Code's auto-injection set. The toggle is **ephemeral**: immediately after the spawning chat session finishes constructing its system prompt, all disabled rules are moved back to active. Net UX — disable a rule, send one message, the next chat is back to baseline.

## Files changed

| File                                                         | Change                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types/claudeConfig.ts`                           | `RuleDefinition.disabled?: boolean` added                                                                                           |
| `src/main/rulesAndSkills/rulesDirectoryManager.ts`           | `disableRule`, `enableRule`, `restoreAllDisabled` exports; `discoverRuleFiles` extended to scan disabled dirs                       |
| `src/main/rulesAndSkills/rulesDirectoryManager.test.ts`      | New — 12 unit tests for disable/enable/restore round-trip                                                                           |
| `src/main/rulesAndSkills/postSpawnRestore.ts`                | New — `firePostSpawnRestore` (post-spawn) + `fireBootRestore` (boot-time)                                                           |
| `src/main/rulesAndSkills/postSpawnRestore.test.ts`           | New — 7 smoke tests for restore + crash-safety                                                                                      |
| `src/main/rulesAndSkills/CLAUDE.md`                          | Gotcha appended on post-spawn restore timing                                                                                        |
| `src/main/ipc-handlers/rulesAndSkills.ts`                    | Wires `registerRulesToggleHandlers`                                                                                                 |
| `src/main/ipc-handlers/rulesAndSkillsToggle.ts`              | New — `rulesDir:toggle` + `rulesDir:restoreAll` channel handlers                                                                    |
| `src/main/ipc-handlers/rulesAndSkillsToggle.test.ts`         | New — 6 smoke tests for the handlers                                                                                                |
| `src/main/orchestration/providers/claudeCodeHelpers.ts`      | `wrapEventWithRestore` fires once per spawn on first `system { subtype: 'init' }`; warm path fires immediately after `sendWarmTurn` |
| `src/main/orchestration/providers/claudeCodeLaunchInputs.ts` | Plumbs `projectRoot: args.cwd` into `launchHeadless` so project-scope restore fires                                                 |
| `src/main/main.ts`                                           | Calls `fireBootRestore(defaultRoot)` during `initializeApplication`, before windows open                                            |
| `src/preload/preloadSupplementalRulesSkills.ts`              | Adds `toggleRuleFile` + `restoreAllDisabledRules`                                                                                   |
| `src/renderer/types/electron-rules-skills.d.ts`              | Mirror types for the two new methods                                                                                                |
| `src/renderer/components/AgentChat/RulesTab.tsx`             | Per-row `RuleRowToggle`, dimmed disabled rows, "off this session" pill, conditional "Restore all" button                            |
| `src/renderer/components/AgentChat/RulesTabToggle.tsx`       | New — toggle switch, pill, restore-all button, `useRuleToggle` / `useRestoreAll` hooks                                              |
| `src/renderer/components/AgentChat/RulesTabToggle.test.tsx`  | New — 12 component tests                                                                                                            |
| `.gitignore`                                                 | Adds `.claude/rules-disabled/`                                                                                                      |

## Test results

- `rulesDirectoryManager.test.ts` — 12/12 ✓
- `rulesAndSkillsToggle.test.ts` — 6/6 ✓
- `postSpawnRestore.test.ts` — 7/7 ✓
- `RulesTabToggle.test.tsx` — 12/12 ✓
- `claudeStreamJsonRunner.test.ts` (regression) — passing
- `npx tsc --noEmit` — clean
- `npx eslint` on every touched file — clean

## Manual smoke gate

UI surface touched: `src/renderer/components/AgentChat/RulesTab.tsx` (used by `Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx` and IDE right-sidebar). Manual smoke required by `~/.claude/rules/manual-smoke-gate.md`.

```
## Manual smoke gate
- [ ] Launched app with the wave's flag(s) on
- [ ] Title bar: every visible control clicked, behavior verified
- [ ] Each panel opened and closed via its own affordance (not via dev tools / config edit)
- [ ] Every interactive control in the touched surface fires a real action
  - Toggle off `manual-smoke-gate.md` in chat-only Rules panel — file moves to `~/.claude/rules-disabled/`
  - Send a chat message — within ~1s of spawn-confirm, file appears back in `~/.claude/rules/`
  - Open new chat — toggle UI shows ON for `manual-smoke-gate.md`, file in active dir
  - Open IDE-view right-pane Claude Config → Rules → flip a project rule off — same behavior
  - Click "Restore all" while at least one rule is disabled — disabled rules return to active
- [ ] No debug labels visible (no enum dumps, no "Active X: …" patterns, no untranslated state)
- [ ] No white-on-dark / fabricated-token borders
- [ ] No console errors on cold boot or first interaction
- [ ] Existing surfaces (menus, overlays, keyboard shortcuts) still reachable
- [ ] Boot-restore: quit app with a file artificially moved to `~/.claude/rules-disabled/`; relaunch; file returns to active dir; logs show `[trace:rules-restore]` with `trigger: 'boot'`
- [ ] Smoke signed: __________________ on ____________
```

The orchestrator did not run the manual smoke (no GUI session active). User must complete the checklist before push per `roadmap/session-handoff.md`.

## Known limitations / follow-ups

- **No persistent rule profiles.** All toggles are ephemeral by design (Decision 2 + 3 in the ADR). Persistent profiles would need a config schema entry and were explicitly deferred.
- **Concurrent windows race.** If window A toggles off rule X and window B spawns simultaneously, B sees X disabled. Documented in the ADR as acceptable for v1.
- **No telemetry.** Toggle usage is not instrumented; deferred per scope.
- **No Settings-modal mirror.** User opted to keep v1 to the popup-style surface only.

## Decisions worth remembering

The full ADR is `roadmap/decisions/wave-62.md`. Highlights:

1. Disable = move to sibling dir (not rename, not manifest).
2. Restore fires post-spawn, not pre-spawn — anchored to first `system { subtype: 'init' }`.
3. Filesystem is the only source of truth for "is this rule disabled right now."
4. Boot-time orphan-restore preserves the baseline-on invariant across crashes.
