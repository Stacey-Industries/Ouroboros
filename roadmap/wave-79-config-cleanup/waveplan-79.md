# Wave 79 — Config Key Cleanup Follow-ups

**Status:** In Progress
**Slug:** config-cleanup
**Branch:** wave-79-config-cleanup
**Source plan:** `roadmap/future/config-key-cleanup-followups.md`
**Filed:** 2026-05-02

## Context

The 2026-05-01 audit triage (`roadmap/cleanup/dead-config-keys.md`) confirmed all flagged keys have at least one reader, but several are `@deprecated` migration/fallback readers only. Five keys are safe to delete now:

1. `windowSessions` — two-release window expired; `sessionsData` SQLite is canonical
2. `codemode.routeInternalMcp` — superseded by `excludeFromMultiplex`; dead in routing
3. `internalMcp.transport` — vestigial post-Wave-60; standalone has one shape
4. `InjectOptions.transport` — back-compat field, ignored in production
5. `InjectOptions.stdioTransportPath` — superseded by `standaloneScriptPath`; MUST follow 3-step order

## Goal

Remove all 5 deprecated config keys cleanly with proper test fixture updates, verified builds, and no regression.

## Scope

**In:** Remove deprecated config keys, update test fixtures, update migration code
**Out:** `multiRoots`, `routerSettings.autoRetrainEnabled`, `ecosystem.rulesAndSkillsInstallEnabled`, `TRAINING_CUTOFF_DATE`, `routerSettings.llmJudgeSampleRate`

## Phases

| Phase | Item | Commit | Verification |
|-------|------|--------|--------------|
| A | `windowSessions` removal | `chore(wave-79): remove windowSessions config key` | tsc + targeted tests |
| B | `codemode.routeInternalMcp` removal | `chore(wave-79): remove routeInternalMcp config key` | tsc + targeted tests |
| C | `internalMcp.transport` removal | `chore(wave-79): remove internalMcp.transport config key` | tsc + targeted tests |
| D | `InjectOptions.transport` removal | `chore(wave-79): remove InjectOptions.transport field` | tsc + targeted tests |
| E | `InjectOptions.stdioTransportPath` removal (3-step) | `chore(wave-79): remove stdioTransportPath — step 1/2/3` | tsc + tests after each step |

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like |
|-------|-------------------|------------|--------------------------|
| A | Internal — no observation point | Schema deletion → type deletion → migration removal | Build passes; sessionMigration tests deleted; windowManager tests updated |
| B | Internal — no observation point | Schema field deletion → type field deletion → test fixture removal | Build passes; integration test fixtures updated |
| C | Internal — no observation point | Schema field deletion → type field deletion → `resolveTransport()` removed | Build passes; integration test fixtures updated |
| D | Internal — no observation point | Field deletion from `InjectOptions` → test fixture removal | Build passes; autoInject test updated |
| E | Internal — no observation point | 3-step: caller→fixtures→field | Build green at each step; tests green after step 2 before step 3 |

## ADR pointer

`roadmap/wave-79-config-cleanup/wave-79-decisions.md`

## Note to the implementer

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

All phases here are `Internal — no observation point` — this is the correct classification for pure deletion phases with no UI surface.
