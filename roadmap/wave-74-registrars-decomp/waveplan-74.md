# Wave 74 — `miscRegistrars.ts` domain decomposition

**Status:** IN PROGRESS
**Source:** `roadmap/future/misc-registrars-decomposition.md` (audit A8)
**Filed:** 2026-05-02

## Context

`src/main/ipc-handlers/miscRegistrars.ts` is 336 lines and registers IPC channels
for 10 unrelated domains. It violates the 300-line ESLint ceiling (currently
grandfathered by a disable comment) and forces unrelated changes to share commit
history. Approach (A): delete `miscRegistrars.ts` after all domains are extracted,
update `misc.ts` to import the named registrars directly.

## Goal

Split `miscRegistrars.ts` into 9 per-domain handler files. Delete the source file.
Update `misc.ts` to import directly. No behavioral change; all IPC channels remain
registered.

## Locked decisions (ADR)

`roadmap/wave-74-registrars-decomp/wave-74-decisions.md`

- Approach (A): delete `miscRegistrars.ts`, no barrel.
- One commit per domain extraction.
- No behavioral change; no channel renames; no bug fixes.

## Scope

**In scope:**
- `src/main/ipc-handlers/miscRegistrars.ts` — source file (deleted at end)
- `src/main/ipc-handlers/misc.ts` — updated to import named registrars
- 9 new per-domain handler files under `src/main/ipc-handlers/`

**Out of scope:**
- Channel renaming
- Handler logic changes / bug fixes
- New domains
- Any file outside `src/main/ipc-handlers/`

## Phases

| # | Domain | New file | Channels |
|---|---|---|---|
| 1 | updater | `updaterHandlers.ts` | `updater:check`, `updater:download`, `updater:install` |
| 2 | cost | `costHandlers.ts` | `cost:addEntry`, `cost:getHistory`, `cost:clearHistory` |
| 3 | usage | `usageHandlers.ts` | `usage:getSummary`, `usage:getSessionDetail`, `usage:getRecentSessions`, `usage:getWindowedUsage`, `usage:getUsageWindowSnapshot` |
| 4 | crash | `crashHandlers.ts` | `app:getCrashLogs`, `app:clearCrashLogs`, `app:openCrashLogDir`, `platform:openCrashReportsDir`, `app:logError` |
| 5 | shellHistory | `shellHistoryHandlers.ts` | `shellHistory:read` |
| 6 | symbol | `symbolHandlers.ts` | `symbol:search` |
| 7 | approval | `approvalHandlers.ts` | `approval:respond`, `approval:alwaysAllow`, `approval:remember`, `approval:listMemory`, `approval:forget` |
| 8 | trust (workspace) | `trustHandlers.ts` | `workspace:isTrusted`, `workspace:trustLevel`, `workspace:trust`, `workspace:untrust` |
| 9 | cleanup | delete `miscRegistrars.ts` | — |

Note: `registerWindowHandlers` and `registerExtensionHandlers` already live in
`miscRegistrarsHelpers.ts`. `registerPerfHandlers` already lives in
`perfHandlers.ts`. `registerGraphHandlers` in `graphHandlers.ts`.
`registerLspHandlers` in `lspHandlers.ts`. These are re-exported from
`miscRegistrars.ts` — that re-export goes away in phase 9 when `misc.ts`
imports directly.

## Phase ordering

Phases 1–8 are independent; each can be done in any order. Phase 9 (delete)
is last — all extractions must be complete first, and `misc.ts` must be updated
to import each new registrar directly.

## Risks

| Risk | Mitigation |
|---|---|
| Shared utility functions (`ok`, `fail`, `runAction`, `runQuery`, `registerChannel`) duplicated across extracted files | These are short, simple, local helpers — duplication is the correct pattern here; the CLAUDE.md says "define local type aliases — don't import across files" |
| `getCrashLogDir` / `getCrashLogFiles` helpers in crash domain — must move with the domain | Copy all crash-domain helpers to `crashHandlers.ts` |
| Re-export stubs (`registerPerfHandlers`, `registerGraphHandlers`, `registerLspHandlers`, `registerWindowHandlers`, `registerExtensionHandlers`) currently forwarded through `miscRegistrars.ts` — must be wired directly in `misc.ts` | Phase 9 update to `misc.ts` imports each directly |
| ESLint: 40-line function limit may bite complex handlers | Crash domain handlers are long; extracted helpers stay local |

## Test coverage by phase

Run after each domain extraction:
```
npx vitest run src/main/mobileAccess/channelCatalog
```

These tests verify channel registration shape but do not execute the handlers
(they are static catalog checks). A full type-check also runs after each phase:
```
npx tsc --noEmit
```

## Acceptance criteria

- Each new file < 300 lines
- `misc.ts` imports all registrars directly — no `miscRegistrars` import
- `miscRegistrars.ts` deleted
- All existing IPC channels still registered (catalog tests pass)
- No `--no-verify`, no ESLint disable additions, no behavioral changes
- `npx tsc --noEmit` clean

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like |
|---|---|---|---|
| 1–8 (each extraction) | Internal — no observation point | Pure file-shape refactor; IPC channels unchanged | Channel catalog tests pass; tsc clean |
| 9 (delete + misc.ts update) | Internal — no observation point | `misc.ts` no longer imports `miscRegistrars`; file deleted | `git status` shows `miscRegistrars.ts` deleted; tsc clean; catalog tests pass |

All phases in this wave are `Internal — no observation point`. This is a pure
mechanical refactor with no user-observable behavioral change.

## Note to the implementer

Before declaring a phase complete, restate the observation point from the
Verification table in your own words and describe what you actually observed there.
If you could not observe it directly — no live IDE, no triggered chat session, no
rendered panel — say so explicitly. Do not substitute "tests pass" for runtime
observation. Tests passing at the unit boundary is necessary but not sufficient.

For this wave: all phases are internal. The correct declaration is: "this phase is
internal — no user-observable observation point. tsc is clean and catalog tests pass."

## Orchestrator dispatch checklist

- [x] Wave plan authored
- [x] ADR created
- [ ] Phase 1 (updater) committed
- [ ] Phase 2 (cost) committed
- [ ] Phase 3 (usage) committed
- [ ] Phase 4 (crash) committed
- [ ] Phase 5 (shellHistory) committed
- [ ] Phase 6 (symbol) committed
- [ ] Phase 7 (approval) committed
- [ ] Phase 8 (trust) committed
- [ ] Phase 9 (delete + misc.ts update) committed
- [ ] Channel catalog tests pass
- [ ] tsc clean
- [ ] `/review 74` PASS
- [ ] Result brief authored
- [ ] Push to remote
