# Wave 79 ADR — Config Key Cleanup

## Decision 1: windowSessions removal approach

**Context:** `windowSessions` schema key + type + migration function + session test suite. Two-release window expired per Wave 40 ADR. `sessionsData` SQLite is canonical; `restoreWindowSessions()` already reads `sessionsData` first.

**Options considered:**
- *Delete migration function + tests:* Migration is now dead code (sessionsData is always populated). Delete `migrateWindowSessionsToSessions`, its call site in `sessionStartup.ts`, and all test fixtures in `sessionMigration.test.ts` that test migration behavior. Keep `migrateAgentMonitorSettings` which is unrelated.
- *Keep migration, delete only schema:* Would leave unreachable code; defeats the purpose.

**Pick:** Delete migration function + tests — industry standard for one-shot migration cleanup after expiry window.

**Rationale:** The migration ran once per user boot, then became a no-op. Keeping it as dead code adds noise. Deleting with the test suite preserves the historical record in git log.

**Consequences:** Any user still on pre-Wave-40 config (no `sessionsData`, only `windowSessions`) will lose their session restore on next boot. Audit says two-release window expired; acceptable risk.

---

## Decision 2: codemode.routeInternalMcp removal approach

**Context:** Field is accepted in schema and on local types (`CodemodeConfig`, `CodeModeConfig`) but `readCodemodeFlags()` and `readScopeFromConfig()` never consult it. Routing is driven entirely by `excludeFromMultiplex`.

**Options considered:**
- *Conservative:* Remove field from schema + type + test fixtures only. Keep test cases whose assertions are still valid.
- *Cleanup:* Delete test cases that assert behavior involving `routeInternalMcp=true` where the behavior is now driven by different fields.

**Pick:** Conservative — remove field from fixtures, keep test case structure. Only delete test cases that are semantically dead (asserting on a specific `routeInternalMcp` behavior that no longer exists).

**Rationale:** Conservative pass reduces risk of accidentally invalidating valid routing assertions.

**Consequences:** Some test cases may have slightly odd naming ("falls back when routeInternalMcp=true") but assertion semantics are valid.

---

## Decision 3: internalMcp.transport removal approach

**Context:** `resolveTransport()` in `scopedMcpConfig.ts` returns `'sse'` by default; `'stdio'` branch is unreachable post-Wave-60. `claudeCodeMode.ts` also has an `InternalMcpConfig` interface with `transport` field.

**Options considered:**
- *Delete `resolveTransport()` entirely:* It returns a constant; nothing calls its return value in any branching.
- *Replace with constant:* Inline `'sse'` where `resolveTransport()` is called.
- *Remove schema only, keep function:* Leaves unreachable branch.

**Pick:** Delete `resolveTransport()` function and the `InternalMcpConfig` interface; remove field from schema and type. Verify no callers use the return value for branching.

**Rationale:** The function body reads a deleted config key and returns a constant. Deleting it is cleaner than leaving it as a wrapper around `getConfigValue('internalMcp')` that returns nothing useful.

**Consequences:** Any caller using `resolveTransport()` for branching would break at compile time — which is the correct outcome.

---

## Decision 4: InjectOptions.transport field removal

**Context:** Field is declared on `InjectOptions` with `@deprecated` comment. Production code `buildOuroborosEntry()` ignores it — entry shape is always `{type:'stdio', ...}`. One test fixture passes `transport: 'stdio'`.

**Pick:** Remove field from `InjectOptions` interface. Update one test fixture.

**Rationale:** Simple removal. `InternalMcpTransport` type stays — still used by `internalMcpRoutingPolicy.ts` and `scopedMcpConfig.ts`.

**Consequences:** Any caller passing `transport` in inject options gets a compile error — correct behavior.

---

## Decision 5: InjectOptions.stdioTransportPath removal — 3-step order

**Context:** `buildInjectOptions()` in `index.ts` passes `stdioTransportPath`. `buildOuroborosEntry()` reads `opts.standaloneScriptPath ?? opts.stdioTransportPath`. Removing the field before updating the caller leaves the `??` resolution as `undefined`, silently breaking MCP injection.

**Mandatory order (audit-specified):**
1. Update `src/main/internalMcp/index.ts:39` to pass `standaloneScriptPath` instead of `stdioTransportPath`. Verify build green.
2. Update all test fixtures (`~18`) to pass `standaloneScriptPath`. Verify tests green.
3. Delete `stdioTransportPath` field on `InjectOptions` + `??` fallback from `buildOuroborosEntry()`.

**Pick:** Follow the 3-step order exactly. Verify build and tests at steps 1 and 2 before proceeding.

**Rationale:** Reversing the order makes the `??` fall through to `undefined`, silently breaking MCP injection with no compile error since both fields are optional.

**Consequences:** After step 3, any caller passing `stdioTransportPath` gets a compile error (desired). The `??` fallback is gone; `standaloneScriptPath` is now required.
