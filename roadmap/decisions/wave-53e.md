# Wave 53e — Architecture Decision Record

**Status:** FINALIZED at Phase C close. Decisions 1–6 resolved.

This wave fixes a type/implementation mismatch in existing infrastructure rather than introducing new architecture. Most decisions are tactical. The only meaningful tradeoff is how to extend `GraphToolContext` (extend the existing type vs introduce a new wider type).

---

## Decision 1: Extend the existing `GraphToolContext` type rather than introducing a new wider type

**Context:** The handlers in `mcpToolHandlerDefs.ts` and `mcpToolHandlerHelpers.ts` access `db`, `queryEngine`, `cypherEngine` on the `context` parameter. The current `GraphToolContext` type doesn't declare these. Two options: (A) extend `GraphToolContext` to include them, or (B) leave `GraphToolContext` as-is (the "lightweight" context) and introduce a new `GraphToolHandlerContext` type that is the superset the handlers actually use.

**Pick:** A — extend `GraphToolContext`.

**Rationale:** There is no real "lightweight context vs handler context" distinction in practice. The only consumer of `GraphToolContext` is `createGraphMcpTools(context)`, which passes it directly to handlers that already access `db` / `queryEngine` / `cypherEngine`. The "lightweight" nature of the current type is fictional — it's just incomplete. Adding a parallel wider type would create two ways to express the same idea and confuse future readers. The straight extension is honest about what the type is for.

If a future caller wants only the lightweight subset (`pipeline.index` + project metadata), they can declare their own narrower type and pass a compatible object to whatever they're building.

**Consequences:** Any existing consumer of `GraphToolContext` outside of `createGraphMcpTools` would also be required to provide the new fields. The current investigation found exactly one consumer (`createGraphMcpTools`). If a hidden second consumer exists, the TypeScript compile will surface it — which is exactly the safety net the `as any` cast was suppressing.

---

## Decision 2: Keep `as any` removal as a hard requirement, not optional cleanup

**Context:** Phase A could leave the `as any` cast in `internalMcpTools.ts:57` and just extend the type — the cast would be redundant but harmless. Or it could remove the cast.

**Pick:** Remove the cast.

**Rationale:** The cast is the single most load-bearing signal that something is wrong. Leaving it would mean future writers see the cast, assume there's a reason, and continue to write code that doesn't match the type. The whole point of this fix is making the type system the source of truth again. Casts that suppress type errors should be removed when no longer needed; if the build still passes after removal, the type is correct.

**Consequences:** If extending the type doesn't fully cover what the handlers access (e.g., a field I missed during the inventory), the build will fail at the cast removal. That's a feature, not a bug — the build failure points exactly at the next missing field. Phase A iterates until the build is clean without `any`.

---

## Decision 3: Contract test asserts shape, not behavior

**Context:** Phase A adds a regression test. Two shapes available: (A) instantiate a real `GraphControllerCompat` and assert `getGraphToolContext()` returns an object with all the expected fields (shape test); (B) build a full integration test that calls a graph tool and asserts the response is non-error (behavior test).

**Pick:** A — shape test only.

**Rationale:** The Wave 53d smoke is the authoritative behavior test (live JSON-RPC against the running server). Re-implementing that as a unit test would require mocking the entire MCP server, the SSE transport, the worker thread, and the SQLite database — an enormous mock surface that would test the mock more than the code. The shape test is cheap, focused, and catches the specific regression class this wave fixes (someone removes a field from `GraphToolContext` or `getGraphToolContext()`'s return).

Behavior coverage stays as the Phase B smoke + the existing integration tests in `codebaseGraph/`.

**Consequences:** A bug where `getGraphToolContext()` returns the right shape but the inner objects don't actually work would slip past this test. That's acceptable — it'd surface in the Phase B smoke or in agent usage, and a separate test could be added at that layer if it ever happened.

---

## Decision 4: Replace the local `GraphToolContext` duplicate in `mcpToolHandlers.ts` with an import

**Context:** Phase A discovered that `src/main/codebaseGraph/mcpToolHandlers.ts` had a *local* duplicate of the `GraphToolContext` interface, which had been silently diverging from the canonical type in `graphTypes.ts`. The handlers in that file (and `mcpToolHandlerDefs.ts` / `mcpToolHandlerHelpers.ts`) were typed against the local duplicate, which had its own (incorrect) field set.

**Pick:** Delete the local duplicate. Import `GraphToolContext` from `graphTypes.ts`. Re-export from `mcpToolHandlers.ts` if any external consumer needs it (one entry point for the type per logical surface).

**Rationale:** The local duplicate was the deeper root cause of the bug. With one canonical type, Phase A's extension (Decision 1) automatically propagates to the handlers via TypeScript's structural typing. Without removing the duplicate, the fix would have been incomplete: handlers would still reference the (now stale) local copy and the `as any` cast would still be needed to bridge the gap. This change reduces "two places to update when the contract changes" to one.

**Consequences:** Any future contributor adding to `GraphToolContext` only updates `graphTypes.ts`. `mcpToolHandlers.ts` picks up the change automatically. The duplicate cannot silently re-emerge unless someone re-introduces a local definition — which the contract test catches if it changes the runtime shape, and which lint/code review catches if it doesn't.

---

## Decision 5: Inline structural type for `pipeline.index` rather than full `IndexingPipeline`

**Context:** Phase A's implementer noted that `getGraphToolContext()` builds an adapter over `workerClient.runIndex` rather than passing a real `IndexingPipeline` instance. Two options for typing the `pipeline` field: (A) full `IndexingPipeline` class type, (B) inline structural type `{ index: (options) => Promise<{ success: boolean }> }`.

**Pick:** B — inline structural type.

**Rationale:** A would fail compilation because the value passed isn't an `IndexingPipeline` instance — it's an object literal with a single `index` method that delegates to `workerClient.runIndex`. The structural type is honest about the contract: the handlers only need to call `pipeline.index(options)` and don't touch any other `IndexingPipeline` surface. Forcing a full class type would either require constructing a real `IndexingPipeline` (overkill — the handlers don't need its lifecycle) or introducing a class that satisfies the full surface (infrastructure for hypothetical future needs).

**Consequences:** If a future tool needs other `IndexingPipeline` methods, the type extends naturally — add the method signature to the structural type, and the runtime constructor in `getGraphToolContext()` provides it. The structural type is a lower bound that accommodates growth without committing to a specific implementation.

---

## Decision 6: Wave 54's blocker pivots from "Wave 53e graph-context fix" to "Wave 54 adoption smoke"

**Context:** Wave 53d's ADR Decision 9 set Wave 54's blocker to "Wave 53e graph-context runtime wiring fix." Wave 53e Phase B confirmed the fix works (four representative tools return real content). The remaining question is: do agents actually reach for these tools when they're available?

**Pick:** Wave 54's blocker becomes "Wave 54 adoption smoke." This is the manual smoke described in `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke — still pending the user." A fresh Claude Code session (post-restart) asks a graph-shaped question; the user observes whether the agent picks the right tool and whether responses are useful. Three possible verdicts: Greenlit, Redesigned, Retired.

**Rationale:** The wiring is now verified functional. Adoption is the only remaining unknown. It's a qualitative observation, not a metric — same shape as Wave 53d Phase D's deferred-to-user smoke. Trying to gate Wave 54 on additional measurement infrastructure would compound the deferral pattern that 53c was supposed to break.

**Consequences:** Wave 54's plan stays in `roadmap/wave-54-plan.md`. The blocker line gets updated to point at the adoption smoke. When the user records adoption observations and resolves Wave 53d's Decision 9, Wave 54's status pivots to one of {Greenlit / Redesigned / Retired}. The decision belongs in Wave 53d's ADR (where it was originally deferred), not duplicated here.