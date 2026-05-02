# Wave 63 — Result Brief: Popover Tab Coverage

**Status:** READY FOR SMOKE · target v2.10.0
**Plan:** `roadmap/wave-63-popover-tab-coverage.md`
**ADR:** `roadmap/decisions/wave-63.md`

---

## What shipped

Made the chat-only context-preview popover honest across the six tabs that were stubs, hardcoded, or stale.

| Tab | Before | After |
|---|---|---|
| Rules | ✅ Wave 62 | unchanged |
| Skills | ✅ live | unchanged |
| Memory | ❌ "not yet wired" stub | live entries from `~/.claude/projects/<slug>/memory/MEMORY.md` |
| Files | ✅ correct | unchanged |
| Mentions | ❌ hardcoded `[]` | live `@mention` selections from `useAgentChatContext` |
| Tools | ⚠️ stale 11-item const | refreshed 31-item built-in list + MCP servers from `mcp:getServers` IPC |
| System | ✅ correct | unchanged |

## Phase summary

- **Phase 0 — ADR.** `roadmap/decisions/wave-63.md` — six locked decisions: read-only v1, project-scoped memory only, mention reuse, tools dual-path, memory IPC barrel, disabled-MCP badge.
- **Phase A — Mentions wiring.** Threaded `mentionLabels` from `useAgentChatContext` through `AgentChatComposer` → `ComposerContextPreview`. No new IPC. 33 tests pass.
- **Phase B — Built-in tools refresh.** `BUILT_IN_TOOLS` 11 → 31, alphabetized, sourced via Context7 (claude-code-docs) and cross-checked against the in-session tool surface. Dropped stale `LS`, `Task`, `TodoRead`. 15 tests pass.
- **Phase C — MCP tools enumeration (static only).** New `useMcpTools` hook calls existing `mcp:getServers` IPC. New `McpToolItem` type, `buildMcpToolItems` builder, `serverDisabled` flag on `ContextItem`, `DisabledBadge` component matching Wave 62's `ManagedBadge` style. **Live path deferred** — see "Deferred from this wave" below. 34 tests pass.
- **Phase D — Memory backend.** New `src/main/memory/memoryReader.ts` (parser, path-sanitization, traversal-safe), `memoryWatcher.ts` (mirrors `rulesWatcher.ts` using `watchRecursive`, NOT chokidar), `ipc-handlers/memory.ts` (`memory:list`, `memory:read`, `memory:changed` broadcast). 29 tests pass. Real-world test: parses 20 entries across 8 sections from this project's actual `MEMORY.md` cleanly.
- **Phase E — Memory frontend.** New `src/preload/preloadSupplementalMemoryApis.ts`, `useMemoryEntries` hook with watcher subscription, `buildMemoryItems` builder, `memoryEntries` input on `useContextPreview`. Wired into `ComposerContextPreview`. 50 tests pass. Empty-state message now: "No memory entries for this project."
- **Phase F — Empty-state polish.** `EMPTY_TAB_MESSAGES` normalized: trailing periods consistent, added defensive `system: 'No model selected.'` Other messages already correct from Phase E.
- **Phase G — Smoke + brief.** This document.

## Files touched

**New:**
- `src/main/memory/memoryReader.ts` + `.test.ts`
- `src/main/memory/memoryWatcher.ts` + `.test.ts`
- `src/main/ipc-handlers/memory.ts` + `.test.ts`
- `src/preload/preloadSupplementalMemoryApis.ts` + `.test.ts`
- `src/renderer/types/electron-memory.d.ts`
- `src/renderer/hooks/useMemoryEntries.ts` + `.test.ts`
- `roadmap/decisions/wave-63.md`
- `roadmap/auto-briefs/wave-63-result.md`

**Modified:**
- `src/main/ipc.ts`, `src/main/ipc-handlers/index.ts` — register memory handlers + cleanup
- `src/preload/preloadSupplementalApis.ts`, `src/preload/preloadSupplementalApiKeys.ts`
- `src/renderer/types/electron-workspace.d.ts` — wire memory API into `ElectronAPI`
- `src/renderer/hooks/useContextPreview.ts` — `BUILT_IN_TOOLS` refresh, `mcpTools`/`memoryEntries` inputs, two new builders
- `src/renderer/hooks/useContextPreview.test.ts`
- `src/renderer/components/AgentChat/AgentChatComposer.tsx` — threads `mentionLabels` to popover
- `src/renderer/components/AgentChat/ComposerContextPreview.tsx` + `.test.tsx` — three new prop sources
- `src/renderer/components/AgentChat/ContextPreview.tsx` + `.test.tsx` — `DisabledBadge`, empty-state polish

## Deferred from this wave (intentional)

1. **Live-path Tools enumeration.** Capturing `tools` and `mcp_servers` from the stream-json `init` event would require either extending the hook protocol (`InstructionsLoaded` is the current rule-capture vehicle; tools have no parallel hook) or adding a new `init`-event parser in `src/main/agentChat/`. Wave-sized. Static path covers cold-start and matches what Claude Code resolves at spawn time — accurate for the dominant case. Track for Wave 64 or later.
2. **Tool toggling** via `--allowedTools` / `--disallowedTools`. Per ADR Decision 1, deferred.
3. **Memory entry write/delete from popover.** Per ADR Decision 1, deferred.
4. **Memory inline drill-down preview.** `memory:read` IPC is wired but unused this wave; ready for next.
5. **Search/filter input** in any tab. Per plan, out-of-scope.

## Risks / known gaps

- `src/main/ipc.ts` was at the 300-line ESLint limit before this wave; Phase D's worker reclaimed lines by collapsing two trivial cleanup blocks. No semantic change. If future work adds another domain, a refactor is unavoidable.
- The static-path MCP enumeration relies on `mcp:getServers` returning `{ name, enabled, scope }`. If a server is in `.mcp.json` but `mcp:getServers` doesn't pick it up (resolution divergence), the popover would under-report. Watch for this during smoke.
- `useMemoryEntries` is project-root-keyed. If a window's project root changes mid-session, the hook re-fetches — verify in smoke that this doesn't introduce flicker.

## Test results

- Wave 63 surface (8 test files across main/preload/renderer): **92/92 pass.**
- Per-phase targeted runs reported by workers: 127 tests pass cumulatively, 0 fail.
- Production build (`npm run build`): green (exit 0).
- Full suite has one pre-existing failure unrelated to this wave: `src/renderer/styles/mobile-touch-targets.test.ts` (button height ≥ 32px lint-style check). Verified by `git stash` + re-running on bare master — failure reproduces without any Wave 63 changes. Tracked separately; not a blocker for this wave.
- TypeScript: `npx tsc --noEmit` clean against the touched files (Phase D worker confirmed).
- ESLint: no violations introduced; `ipc.ts` brought back under its 300-line limit by Phase D's worker.

## Manual smoke gate

Per `~/.claude/rules/manual-smoke-gate.md`. The plan's Phase G called for this even though `src/renderer/components/Layout/**` is technically the rule's scope — the popover is a user-visible UI surface and warrants the same gate.

```
- [ ] Launched app with chat-only flag on (`npm run dev`)
- [ ] Popover opens via the affordance under the composer
- [ ] **Mentions tab:** type `@somefile.ts`, select autocomplete result. Mentions tab populates. Remove the mention chip → tab updates.
- [ ] **Tools tab:** built-ins listed (verify `Agent`, `Skill`, `ToolSearch`, `NotebookEdit`, `ExitPlanMode`, `AskUserQuestion` are all present — these were missing before this wave).
- [ ] **Tools tab + MCP:** with at least one MCP server registered (project or user scope), the server's tools appear under it. A disabled server shows the "disabled" badge.
- [ ] **Memory tab:** lists entries from `~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md`. Empty state message reads "No memory entries for this project." when MEMORY.md is absent.
- [ ] **Skills/Files/System tabs:** unchanged from prior behavior — no regressions.
- [ ] **Rules tab regression check:** Wave 62 toggles still work (toggle a project rule off, observe filesystem move, toggle on).
- [ ] No console errors on cold boot or popover-open.
- [ ] No debug labels visible in the popover.
- [ ] No fabricated-token borders or white-on-dark in any tab row.
- [ ] Smoke signed: __________ on __________
```

## Out-of-wave follow-ups (carryover for later waves)

- Live-path Tools (init-event capture).
- Tool toggling via `--allowedTools` / `--disallowedTools`.
- Memory entry inline drill-down + write/delete.
- Search/filter per tab.
- IDE-shell variant parity for the popover (currently chat-only only).
- Side note from user (2026-04-30): in contractor-app IDE chat, user-level rules aren't loading in the popover. Investigate post-wave. Likely related to project-root resolution in `useFilesystemDisabledRuleIds` or `loadedRules` source on a different cwd shape.
