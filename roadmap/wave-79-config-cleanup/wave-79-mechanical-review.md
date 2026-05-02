# Wave 79 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-79-config-cleanup/waveplan-79.md`
- Diff range: `8e631b7^..85f4933` (6 implementation commits; docs commit `c70d7ac` excluded)
- Graph: FALLBACK (ouroboros unavailable — all traces done via grep + import-following; findings marked accordingly)
- Run timestamp: 2026-05-02T19:45:00Z

---

## Check 1: Forward-trace (fallback trace)

Changed symbols enumerated from diff (pure deletion wave — no net-new functions; only signature simplifications and body modifications):

| Symbol | Kind | Change |
|---|---|---|
| `initSessionServices` | export function | parameter `config: ConfigAccess` removed |
| `restoreWindowSessions` | export function | body: legacy fallback branch removed |
| `isRoutedThroughCodemode` | private function | body: `transport === 'stdio'` guard replaced with `return true` |
| `buildInjectOptions` | export function | body: `stdioTransportPath` → `standaloneScriptPath` |
| `decideInternalMcpRouting` | export function | `RoutingInputs.transport` parameter removed from interface |

**Traces:**

- `initSessionServices()` → called at `src/main/main.ts:266` inside `initializeApplication()` → production consumer (Electron `app.whenReady` path). **Clean.**
- `restoreWindowSessions()` → called at `src/main/main.ts:236` inside `initializeApplication()` → production consumer. **Clean.**
- `isRoutedThroughCodemode()` → called by `decideInternalMcpRouting` (same file) → called by `scopedMcpConfig.ts:196` (`deriveRoutingDecision`) and `claudeCodeMode.ts:62` (`resolveProxiedServerNames`) → both are main-process production paths. **Clean.**
- `buildInjectOptions()` → called at `src/main/main.ts:117` → result passed to `injectIntoProjectSettings` → production consumer. **Clean.**
- `decideInternalMcpRouting` (modified `RoutingInputs`) → callers in `scopedMcpConfig.ts` and `claudeCodeMode.ts` both updated in the same commits to drop the `transport:` field. **Clean.**

**Change sites traced: 5**
**Paths reaching production consumer: 5**
**Paths flagged as dead: 0**

---

## Check 2: Plan universal-quantifier cross-reference

Universals found in wave plan:

1. (line 11) "all flagged keys have at least one reader" — context sentence, not an imperative.
2. (line 21) "Remove **all 5** deprecated config keys" — imperative over a named set of 5.

**Verification for universal #2 — "all 5 deprecated config keys":**

| Item | Commit |
|---|---|
| `windowSessions` | `8e631b7` Phase A |
| `codemode.routeInternalMcp` | `665fd76` Phase B |
| `internalMcp.transport` | `61f6cd3` Phase C |
| `InjectOptions.transport` | `615a3d4` Phase D |
| `InjectOptions.stdioTransportPath` | `99d3ff0` Phase E |

All 5 instances covered by the diff.

**Universals found in plan: 2**
**Universals where diff covers all instances: 2**
**Universals flagged as narrowed: 0**

---

## Check 3: Export audit (fallback trace)

Net-new exports added by the wave: zero new `export function`, `export class`, `export const` additions.

**Stale re-export found:**

The deletion of `migrateWindowSessionsToSessions` in Phase A removed the function from `sessionMigration.ts` but left a barrel re-export in `session/index.ts:16` that still references it. This is a dead export introduced by omission in the deletion phase.

- **`migrateWindowSessionsToSessions`** at `src/main/session/index.ts:16`
  - Source: `export { migrateWindowSessionsToSessions } from './sessionMigration'` — symbol no longer exists in `sessionMigration.ts`
  - Consumer count (non-test): 0 — grep of `src/` finds no import of this name from any non-test file
  - TypeScript behavior: `tsc --noEmit` passes silently (TypeScript does not error on re-exporting a missing named export from a JS module); runtime export value would be `undefined`
  - Deferral marker: none
  - Phase: A

**New exports added: 0 (one stale re-export of deleted symbol)**
**Exports with production consumers: 0**
**Exports flagged as dead: 1**

---

## Verdict

**FLAG**

Check 3 fires on one stale re-export: `session/index.ts:16` still exports `migrateWindowSessionsToSessions` which was deleted from `sessionMigration.ts` in Phase A. TypeScript passes silently because it doesn't error on re-exporting a missing named export — the dead re-export is invisible to the build gate. Fix: delete line 16 from `src/main/session/index.ts`. One-line change; no test impact (zero consumers confirmed by grep).
