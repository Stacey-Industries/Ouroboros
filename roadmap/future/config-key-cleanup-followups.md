# Config key cleanup — A2 follow-ups (post-2026-05 cleanup pass)

**Status:** TODO — small focused wave
**Source:** `roadmap/audit-verification-pass.md` Section A2; `roadmap/cleanup/dead-config-keys.md`
**Filed:** 2026-05-01 — these are the A2 deletes that were too coupled-to-tests for the 2026-05 inline cleanup batch

## Why this is a wave, not an inline cleanup

The 2026-05-01 audit triage closed `llmJudgeSampleRate` (cleanly contained) but the rest of the A2 DELETE-flagged keys have one of three blockers:

1. **Dead fields used as test fixtures** — integration tests pass deprecated config fields (e.g. `routeInternalMcp`, `internalMcp.transport`) to drive routing-decision assertions whose actual behavior is now controlled by other fields. Removing the field requires either updating each test to pass the current config shape (and re-asserting the same outcomes) or deleting the test cases entirely.
2. **User-data migration** — `windowSessions` removal deletes a one-shot migration that converts old configs to the current `sessionsData` SQLite store. Two release windows have expired per the audit, but a careful sweep is warranted to confirm no users still rely on it.
3. **Caller migration order matters** — `InjectOptions.stdioTransportPath` removal is a load-bearing 3-step sequence (update the live caller in `src/main/internalMcp/index.ts:39` first, verify, then drop the deprecated field). Doing it in reverse silently breaks MCP injection.

Bundling these into one focused wave keeps each change reviewable and lets the test-rework happen in dedicated commits.

## Items to ship

### 1. `windowSessions` removal — large

**Surface:**
- `src/main/configSchema.ts:147,164` (schema entry + comment)
- `src/main/configAppTypes.ts:81` (type)
- `src/main/windowManagerSessions.ts:53,79,87` (deprecated read fallback)
- `src/main/session/sessionMigration.ts:47-58` (one-shot migration reader)
- `src/main/session/sessionStartup.ts:93` (migration call site)
- `src/main/configAppTypes.test.ts:38`, `src/main/windowManager.test.ts:604,606,701,704,728`, `src/main/session/sessionMigration.test.ts` (≈14 test fixtures)

**Sequencing:** schema removal forces type removal forces caller removal. All in one commit so the build doesn't go red mid-flight. The migration tests can either be deleted (the migration is gone) or pinned as a "this was historically supported" marker.

**Risk:** users still on pre-Wave-40 configs won't auto-migrate. Audit says the two-release window has expired, but worth confirming via session telemetry that no recent boots are reading `windowSessions` before deletion.

### 2. `codemode.routeInternalMcp` removal — test rework

**Surface:**
- `src/main/configSchemaTailExt.ts:305,312,315` (schema)
- `src/main/configAppTypes.ts:167` (type)
- `src/main/orchestration/providers/scopedMcpConfig.ts:178` (accepted on local type, never read)
- `src/main/orchestration/providers/claudeCodeMode.ts:38` (same)
- Integration tests: `src/main/codemode/codemode.internalMcp.integration.test.ts` (17 fixture references), `src/main/codemode/crashRecovery.test.ts` (9 fixture references)

**Approach:** the field is verified dead in production (`internalMcpRoutingPolicy.ts` only reads `enabled` + `excludeFromMultiplex`). The tests pass it as a fixture but the assertions actually test the routing decision driven by other fields. Two paths:

- **Conservative:** keep test cases; just remove `routeInternalMcp` from each fixture object. Asserted behavior should be identical.
- **Cleanup:** delete obsolete test cases (e.g. "falls back to direct-inject when routeInternalMcp=true but transport=sse" — both fields are now vestigial; the assertion is testing dead behavior).

Recommend conservative pass first; only delete tests whose assertion no longer makes semantic sense.

### 3. `internalMcp.transport` config key removal — test rework

**Surface:**
- `src/main/configSchemaTailExt.ts:303` (schema default)
- `src/main/internalMcp/internalMcpTypes.ts:15` (`transport` field on type)
- `src/main/orchestration/providers/scopedMcpConfig.ts:102` (`resolveTransport()` — returns `'sse'` by default; `'stdio'` branch unreachable)
- `src/main/orchestration/providers/internalMcpRoutingPolicy.ts:52` (accepts but doesn't gate on it)
- Same integration tests as above (≈20 fixture references across `codemode.internalMcp.integration.test.ts` and `crashRecovery.test.ts`)

**Approach:** same as #2. Field is vestigial post-Wave-60 (standalone has only one shape). Schema removal + type removal + remove from test fixtures. `resolveTransport()` collapses to a constant, so it can either be inlined or kept as a constant export for future-proofing.

### 4. `InjectOptions.transport` field removal — small

**Surface:**
- `src/main/internalMcp/internalMcpAutoInject.ts:129` (field declaration)
- `src/main/internalMcp/internalMcpAutoInject.test.ts:123` (one fixture passes `transport: 'stdio'`)
- Audit: `Keep the InternalMcpTransport type — only remove the field.`

**Approach:** straightforward. Drop the field, drop the test fixture property. The `InternalMcpTransport` type stays (still used by `internalMcpRoutingPolicy.ts:52` and `scopedMcpConfig.ts:102`).

### 5. `InjectOptions.stdioTransportPath` removal — load-bearing 3-step

**Surface:**
- `src/main/internalMcp/internalMcpAutoInject.ts:121-135` (the deprecated field + the `??` fallback)
- `src/main/internalMcp/index.ts:39` (the live caller; passes `stdioTransportPath` instead of `standaloneScriptPath`)
- `src/main/internalMcp/internalMcpAutoInject.test.ts` (≈18 test fixtures pass `stdioTransportPath`)

**Sequencing (audit-mandated, MUST be in this order):**
1. Update `src/main/internalMcp/index.ts:39` to pass `standaloneScriptPath` instead of `stdioTransportPath`. Verify build green.
2. Update each test fixture to pass `standaloneScriptPath`. Verify tests green.
3. THEN delete the `stdioTransportPath` field on `InjectOptions` and the `??` fallback.

Doing it in reverse breaks MCP injection silently — `opts.standaloneScriptPath ?? opts.stdioTransportPath` resolves to `undefined`.

## Items NOT in scope (already filed or kept)

- `multiRoots` — KEEP per audit; six live callers.
- `routerSettings.autoRetrainEnabled` — KEEP per Wave 61 ADR (intentional gate).
- `ecosystem.rulesAndSkillsInstallEnabled` — already filed as a separate WAVE-IT (flip to true once install path wired); see `roadmap/follow-ups/follow-ups.md` Wave 41 entry.
- `TRAINING_CUTOFF_DATE` — KEEP per audit; `stalenessMatrix.ts:14,119` has live consumer until all call sites pass `modelCutoffDate`.
- `routerSettings.llmJudgeSampleRate` — DONE in 2026-05-01 cleanup batch (commit history).

## Rough effort estimate

- #1 windowSessions: 1-2 hours (large surface + careful migration removal)
- #2 routeInternalMcp: 1 hour (mechanical test fixture sweep)
- #3 internalMcp.transport: 1 hour (same shape as #2)
- #4 InjectOptions.transport field: 15 minutes
- #5 stdioTransportPath migration: 30 minutes (3-step sequence is small per step)

Total: ~half a day if batched. Each item could ship in its own commit; recommend one wave with five sequential commits.

## References

- Audit: `roadmap/audit-verification-pass.md` Section A2 (the source-of-truth recommendation table)
- Source audit: `roadmap/cleanup/dead-config-keys.md` (per-key analysis)
- Related: `roadmap/future/graph-mcp-polish.md` (drops legacy parameter aliases — same flavor of cleanup)
