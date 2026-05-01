# Wave 67 — ADR: Indexer Definition-Pass Coverage Repair

**Status:** LOCKED 2026-04-30 by orchestrator.
**Plan:** `roadmap/wave-67-indexer-coverage-repair.md`

---

Wave 66 smoke testing revealed a class of silent data-quality failures: a subset of source files exist in the graph as `File` nodes but have zero `DEFINES` edges — no `Function`, `Class`, `Method`, `Interface`, `Type`, or `Enum` children. At least 6 files are affected, including `graphDatabase.ts` (58 definitions), `hooks.ts`, `windowManager.ts`, and `internalMcp/index.ts`. From an agent's perspective, querying these files returns empty results that look like success; the tools don't fail, they lie.

The obvious suspects have been eliminated. Tree-sitter parses every affected file correctly (0 ERROR nodes, 0 MISSING nodes). `TreeSitterParser.parseFile` in vitest returns the expected definition records — 59 for `graphDatabase.ts` alone. The `@vscode/tree-sitter-wasm` migration is already done. Inline-type imports don't correlate with the failure. The bug is in the **pipeline orchestration between extraction and DB write** — in `parsePass`, `definitionPass`, or the incremental-indexing logic in `indexingPipeline.ts` / `indexingPipelinePasses.ts`. The six decisions below govern how Wave 67 finds and fixes it.

---

## Decision 1: Diagnose first, fix second

**Context:** The root cause is unknown — it could be a race between `deleteNodesByFile` and `processDefinitionChunk`, an `filterChangedFiles` misclassification that skips extraction for affected files, a worker-thread vs. main-thread state divergence, or an early-exit in the definition pipeline. Proposing a fix before the cause is named carries high blast-radius risk: the indexing pipeline is load-bearing for every graph feature.

**Options considered:**
- *Diagnose-first:* Phase A is non-mutating. Instrument the pipeline, reproduce the failure, name the exact file:line cause. Phase B blocked until Phase A delivers written evidence.
- *Fix-and-test:* Skip structured diagnosis; implement a plausible fix (e.g., reorder delete/insert), run tests, see if the symptom goes away. Faster if the guess is right; catastrophic if it's wrong or masks a deeper issue.
- *Instrument-then-fix in the same phase:* Add logging and fix in one pass. Combines the risk of both: the fixer may stop as soon as the symptom disappears, before the true cause is fully understood.

**Pick:** Diagnose-first. Phase A is a read-only `sonnet-diagnostician` dispatch; its deliverable is `roadmap/wave-67-diagnostic.md` with file:line evidence and a recommended fix shape. Phase B does not start until the orchestrator reviews and accepts that diagnosis.

**Rationale:** The pipeline touches every indexed file. A wrong fix has project-wide blast radius. The cost of Phase A is one agent dispatch and a written diagnosis; the cost of skipping it is an untraceable regression. Diagnosis-as-a-deliverable also provides an audit trail for future maintainers.

**Consequences:** Phase B (and C, D, E) are blocked on Phase A completing. Orchestrator is responsible for reviewing the diagnosis before dispatching the fix. If the diagnosis is ambiguous, a second independent diagnostician dispatch is authorized before any code changes.

---

## Decision 2: Detection is permanent

**Context:** The current failure was invisible for the entire Wave 66 lifecycle. There is no automated check that counts files processed but emitting zero definitions. A smoke test discovered it; the next regression might not be caught until another smoke test happens to query the right symbol.

**Options considered:**
- *Ad-hoc count after reindex:* Run a Cypher query post-fix to verify the count is zero. Catches the current regression; does nothing for future ones.
- *Dedicated method with a return value:* Add a `countParseAnomalies()` call to the indexing pipeline that surfaces a count in the reindex return value. Structured, queryable, but not surfaced to operators without a separate API call.
- *Structured field in `index_status` output:* Add `parseAnomalies: { count: N, samples: [...] }` to `IndexingResult` and expose it in the `index_status` MCP tool response. Future regressions surface on the next `index_status` call — no separate query required.

**Pick:** Structured field in `index_status`. A `countParseAnomalies(indexedFiles)` helper (Phase C) feeds into `IndexingResult.parseAnomalies`; `handleIndexStatus` surfaces it in tool output; the `index_status` tool description is updated to document the field.

**Rationale:** Silent correctness failures are the most dangerous failure mode for a data store that agents trust. The detection cost (one helper function + one output field) is low; the benefit is that any future regression in definition extraction is visible to any caller of `index_status` within one reindex cycle. Ad-hoc queries require knowing to ask; a structured field announces itself.

**Consequences:** `IndexingResult` gains a `parseAnomalies` field (count + sample paths). The threshold for flagging is `parsed != null && parsed.definitions.length === 0 && lineCount > 30` — excludes config/index barrels. Re-export-only barrel files (zero own-definitions by design) are excluded via `parsed.exportedNames.length` check. Phase C implements and unit-tests the helper across edge cases.

---

## Decision 3: Regression-test fixture in repo

**Context:** The pipeline-orchestration bug was not caught by existing tests. A future grammar change, worker-thread refactor, or incremental-indexing tweak could reintroduce the same class of failure. The test coverage gap is in modern TypeScript syntactic features — the exact features that correlate most closely with the affected files.

**Options considered:**
- *No fixture:* Rely on Phase A's diagnosis to prevent recurrence. Low maintenance cost; does nothing to catch future regressions.
- *Fixture file in `node_modules` or external:* Use an existing third-party TypeScript file as a corpus reference. Brittle — the file can change; it's not in version control; it can't be targeted precisely.
- *Fixture file in repo (`__fixtures__/modernTs.ts`):* A committed test fixture with one instance of each syntactic feature that has caused parse-output drift: inline-type imports, `satisfies`, `using`, decorators, abstract classes, exported classes with full class-body, namespace declarations, ambient declarations. Test asserts expected node kinds and minimum counts.

**Pick:** `src/main/codebaseGraph/__fixtures__/modernTs.ts` committed to the repo. Test in `treeSitterParser.test.ts` parses it and asserts 1 Class + N Methods + correct definition kinds.

**Rationale:** Grammar versions change. Worker-thread isolation changes. Orchestration order changes. A committed fixture with explicit assertions is the only guard that fires automatically in CI on any of those changes. It also documents exactly which syntactic features the indexer is expected to handle — useful for future contributors.

**Consequences:** `treeSitterParser.test.ts` gains a fixture-based test section (Phase D). The fixture must be updated if new syntactic features are added to the project. The node-count assertions are intentionally narrow — they catch regressions in what's asserted, not in the full file.

---

## Decision 4: No tree-sitter package change

**Context:** An early hypothesis was that the `@vscode/tree-sitter-wasm` migration was incomplete or the grammar version was wrong. This theory was empirically tested during Wave 66 smoke work.

**Options considered:**
- *Upgrade `@vscode/tree-sitter-wasm`:* Try a newer version; see if the affected files parse differently. Speculative; not evidence-based.
- *Downgrade to `tree-sitter-wasms@0.1.13`:* Revert to the previous package. Also speculative.
- *No change:* The grammar parses every affected file correctly. `0 ERROR nodes`, `0 MISSING nodes`, `1 class_declaration` at the right line for `graphDatabase.ts`. Package change is not indicated.

**Pick:** `@vscode/tree-sitter-wasm@0.3.1` stays as-is. No lockfile changes in this wave.

**Rationale:** The parse output is correct. The bug is downstream of parsing. Changing the grammar package while simultaneously fixing the orchestration bug would make it impossible to isolate cause — any improvement could be attributed to either change. If Phase A's diagnosis reveals a grammar-level gap, that becomes a separate Wave 68 item.

**Consequences:** If the post-fix audit (Phase E) reveals files still failing that have syntactic features the current grammar genuinely can't handle, that is documented in the result brief and deferred to a separate wave. It is not in scope for Wave 67.

---

## Decision 5: Forced reindex after fix

**Context:** After the pipeline bug is fixed, the existing graph will still contain stale state — File nodes that have no DEFINES edges, built under the buggy pipeline. Simply deploying the fix does not repair the existing data; the affected files must be re-processed.

**Options considered:**
- *Incremental reindex only:* Trigger a reindex with the normal incremental logic. If the incremental classifier still considers affected files "unchanged" (possible — their mtime/hash may not have changed), they won't be reprocessed and the stale data persists.
- *Forced full reindex (`incremental: false`):* Clear the incremental cache and reprocess every file. Guaranteed to re-run the fixed pipeline over all affected files.
- *Explicit deletion + reindex:* Delete the affected File nodes and their relationships manually, then trigger a partial reindex. More surgical; higher coordination complexity.

**Pick:** Forced full reindex (`incremental: false`). Phase E triggers this explicitly after the fix is deployed.

**Rationale:** The incremental classifier is exactly the kind of logic that might have contributed to the bug (see "Note to the implementer" in the wave plan). Trusting it to reprocess the right files after a pipeline orchestration fix is the wrong bet. A full reindex is slower (bounded; documented in the result brief) but unambiguous. Surgical deletion adds coordination complexity with no advantage at this repo's scale.

**Consequences:** Reindex time is expected to be under 60 seconds for this repo. Phase E documents the actual time in the result brief. After Phase E, Phase F probes the originally-failing files to confirm DEFINES edges exist.

---

## Decision 6: Audit scope is project-wide

**Context:** Only 6 files were identified as definitively failing during Wave 66 smoke testing. The actual blast radius could be larger — any file that went through the buggy pipeline path is a candidate.

**Options considered:**
- *Targeted audit:* Only verify the 6 known-failing files post-fix. Fast; misses any files that were also affected but not specifically queried during smoke testing.
- *Project-wide audit:* Query for ALL `File` nodes with no outgoing `DEFINES` edges and `lineCount > 30`. Bounds the true blast radius before the fix; validates the fix is complete after the reindex.
- *Sample-based audit:* Spot-check a random 10% of files. Cheaper; produces a probability estimate rather than a definitive answer.

**Pick:** Project-wide audit. Phase A counts `MATCH (f:File) WHERE NOT exists { (f)-[:DEFINES]->() } AND f.lineCount > 30 RETURN count(f)` as a pre-fix baseline. Phase E runs the same query post-fix and asserts the count is < 5 (or documents the remaining set with explanations).

**Rationale:** A graph that's partially fixed is not meaningfully better than a graph that's fully broken for agent use. The project-wide count is a one-line Cypher query; there's no cost reason to scope it narrowly. The < 5 threshold accounts for legitimately sparse files (empty exported types, pass-through re-exports) that are not bugs.

**Consequences:** The acceptance criterion is `< 5 File-only nodes with lineCount > 30` post-reindex, not zero. Any file remaining in that set must be named and explained in the result brief. The `parseAnomalies` detection layer (Decision 2) will flag any post-fix stragglers automatically.

---
