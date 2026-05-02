# Tree-sitter grammar upgrade — `accessor` keyword + future TS features

**Status:** DEFERRED — `accessor` confirmed working; broader upgrade path preserved
**Source:** `roadmap/audit-verification-pass.md` Section D item #14 (Wave 67 follow-up)
**Filed:** 2026-05-01

## TL;DR — the immediate concern is resolved

The audit flagged this as a Wave 67 follow-up under the framing *"Tree-sitter `accessor` keyword via `@vscode/tree-sitter-wasm` upgrade."* That framing assumed the current grammar didn't handle `accessor`.

**It does.** Confirmed 2026-05-01 by adding `AutoAccessorClass` to the modern-TS regression fixture (`src/main/codebaseGraph/__fixtures__/modernTs.ts`) and asserting it appears in the extracted definitions. The test passes — `@vscode/tree-sitter-wasm@0.3.1` recognizes `accessor` as a class-member modifier and tree-sitter extracts the class correctly.

So no upgrade is required for `accessor` specifically. This deferred note exists because:

1. Other TS 5.x features beyond `accessor` are still untested
2. Future TS releases will continue adding syntax
3. The Wave 67 brief flagged a runtime/ABI mismatch that will eventually need addressing

## What was already learned (Wave 67 result brief)

From `roadmap/auto-briefs/wave-67-result.md:134`:

> *"`@vscode/tree-sitter-wasm@0.3.1` JS/Python wasms are at tree-sitter ABI 15 but `web-tree-sitter@0.22.6` runtime supports up to 14. The rejection happens at `parser.setLanguage`, not `Language.load`; my first fallback caught the wrong gate."*

Translation: the grammar package and the runtime package have a coupling that's already at its compatibility ceiling. Bumping `@vscode/tree-sitter-wasm` to a newer version (which would target ABI 15) requires a paired `web-tree-sitter` runtime upgrade. Doing one without the other breaks parsing entirely.

This means *any* future grammar upgrade is a paired upgrade — not a clean version bump.

## Trigger conditions to revisit

Move from `deferred/` to `future/` (or commit to a wave directly) if any become true:

- **`parseAnomalies` count rises on a real codebase.** Wave 67's `parseAnomalies` field in `index_status` output is the canary. If a user opens a project where it spikes, a syntactic feature the current grammar can't parse has appeared in real code.
- **A user reports missing class members in a TS 5.x or TS 6.x project.** The visible symptom would be `get_code_snippet` or `search_graph` returning empty for symbols that demonstrably exist in the source.
- **We're already touching `web-tree-sitter` for another reason.** Bundling the upgrade with another runtime change reduces total churn.
- **A TS feature lands that we know we want to support immediately** (e.g., a hypothetical TS 6.0 syntax shift that user code starts using broadly).

## Investigation path when activated

### Phase A — Audit current grammar coverage (cheap, ~1 hour)

Add fixtures for each TS 5.x feature not currently covered in `__fixtures__/modernTs.ts`:

| Feature | Already tested? |
|---|---|
| `accessor` keyword | ✅ Yes (added 2026-05-01) |
| `using`/`await using` | ✅ Yes |
| `satisfies` | ✅ Yes |
| Stage-3 decorators | ✅ Yes |
| `const` type parameters | ✅ Yes |
| `import type`/inline-type imports | ✅ Yes |
| Resource management with `Symbol.dispose` | ⚠️ Partial — `Symbol.dispose` is in scope but `[Symbol.dispose]` as method name isn't asserted |
| Variance annotations (`in`/`out`) | ❌ Not tested |
| Template literal type narrowing | ❌ Not tested |

For each gap, add to fixture, run test, observe. Cost: ~5 min per feature.

### Phase B — Decide whether to upgrade

If Phase A surfaces a real gap:

1. **Check `web-tree-sitter` releases on npm.** Has a version above 0.22.6 shipped? Does it support ABI 15? Does it remain compatible with `tree-sitter-wasms@0.1.13` for the other languages we use (Python, Go, Rust, Java, C++)?
2. **Check `@vscode/tree-sitter-wasm` releases.** Newer versions exist? What ABI? Do they include the missing feature?
3. **Verify cross-language compatibility.** A runtime upgrade affects Python parsing, not just TS. The Python wasm needs the same ABI level.
4. **Plan the paired upgrade.** Two npm bumps in lockstep; verify with the full test suite (not just the modernTs fixture).

### Phase C — Execute

Standard runtime upgrade discipline. Run the full test suite. Confirm `parseAnomalies` count remains low post-reindex on a real project.

## Why this isn't `WAVE-IT` urgency

Three reasons:

1. **No confirmed break.** Acting on a hypothetical gap is investing without evidence.
2. **The safety net works.** `parseAnomalies` will surface real failures within one reindex cycle. The system is not silently broken — it's loudly self-monitoring.
3. **Coupled risk is real.** Without a clear forcing function, the runtime/grammar/multi-language coordination is overhead for marginal benefit.

The cheap part (adding fixtures) can happen anytime; the expensive part (the upgrade itself) should wait for a forcing function.

## References

- `src/main/codebaseGraph/__fixtures__/modernTs.ts` — regression fixture (now includes `AutoAccessorClass`)
- `src/main/codebaseGraph/treeSitterParser.test.ts` — companion test
- `src/main/codebaseGraph/treeSitterParser.ts` — parser entry, `resolveGrammarPath()` selects `@vscode/tree-sitter-wasm` then falls back to `tree-sitter-wasms`
- Wave 67 result brief: `roadmap/auto-briefs/wave-67-result.md:134-139` — runtime/ABI mismatch detail + deferral context
- Audit: `roadmap/audit-verification-pass.md` Section D item #14
