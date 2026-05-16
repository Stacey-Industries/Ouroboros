---
vendor: web-tree-sitter
sdkVersion: ^0.26.8
lastVerified: 2026-05-16
relatedPaths:
  - src/main/codebaseGraph/treeSitterParser.ts
  - src/main/codebaseGraph/treeSitterParser*.ts
  - src/main/codebaseGraph/treeSitterParser.integration.test.ts
sourceWave: 93
---

# web-tree-sitter — vendor gotchas

WASM-based tree-sitter bindings for Node and browser. Loaded eagerly in
`src/main/codebaseGraph/treeSitterParser.ts` for the codebase-graph indexer.

## Pinned current version

`^0.26.8` as of Wave 93 (was `0.22.6` from Wave 14 to Wave 92).

## Why version pinning matters here

The package's TypeScript ABI version determines which grammar `.wasm` files
it can load. Tree-sitter grammar files declare an ABI version in their
binary header; `Parser.prototype.setLanguage` throws
`Incompatible language version N. Compatibility range M through L.` when
the grammar's ABI is outside the host's supported range. Failures are
runtime-only — they don't surface in typecheck, lint, or unit tests that
don't actually exercise grammar loading.

## ABI compatibility cheat sheet

| `web-tree-sitter` | Supported grammar ABI |
|---|---|
| `0.22.x` | 13–14 |
| `0.23.x` | 13–14 (no ABI 15 yet) |
| `0.24.x` | 13–14 |
| `0.25.x+` | 13–15 |
| `0.26.x+` | 13–15 |

`@vscode/tree-sitter-wasm@0.3.x` ships ABI 15 grammars. `tree-sitter-wasms@0.1.13`
(used as a fallback) ships ABI 13/14. **If you bump `@vscode/tree-sitter-wasm`
to a major that ships a newer ABI, check `web-tree-sitter` supports it
before merging** — the fallback path masks the regression in production
because the IDE's `treeSitterParser.ts` silently falls back to the older
grammars, but symbol-resolution accuracy degrades.

## 0.25.0 — breaking changes from 0.22 → 0.25+

The package was rewritten in TypeScript with ESM/CJS dual publishing.
**Surface changes that bit Agent IDE during Wave 93 Phase C**:

1. **Default export gone.** `import Parser from 'web-tree-sitter'` no longer
   works. Use named imports:
   ```ts
   import { Language, type Node, Parser } from 'web-tree-sitter';
   ```

2. **Type namespace flattened.** Pre-0.25 had `Parser.Language`,
   `Parser.SyntaxNode`, `Parser.Tree` as type members. These are now
   top-level exports:
   ```diff
   - Parser.Language → Language
   - Parser.SyntaxNode → Node
   - Parser.Tree → Tree
   - Parser.TreeCursor → TreeCursor
   ```
   Mechanical rename. Use `replace_all: true` on each pattern per file.
   Agent IDE had 54 `Parser.SyntaxNode` references across 4 support files
   plus 11 in the main parser file.

3. **`Language.load` is now top-level** (was `Parser.Language.load`).
   Update call sites.

4. **`Query` API rewritten** — `Language.query()` is deprecated in favor of
   `new Query(language, source)`. `QueryMatch.pattern` → `patternIndex`.
   Agent IDE does NOT use the query API (verified via grep), so this didn't
   bite — but consumers that DO need to migrate or the bump will silently
   produce wrong query results.

## 0.26.0 — WASM resolution change

The WASM asset (`web-tree-sitter.wasm`) moved out of the package's main
directory into an explicit exports map entry:

```json
"exports": {
  ".": { ... },
  "./web-tree-sitter.wasm": "./web-tree-sitter.wasm"
}
```

The `locateFile` callback to `Parser.init()` MUST use the export key:
```ts
await Parser.init({
  locateFile(scriptName: string) {
    try {
      const wasmPath = require.resolve('web-tree-sitter/web-tree-sitter.wasm');
      return path.join(path.dirname(wasmPath), scriptName);
    } catch {
      return scriptName;
    }
  },
});
```

The pre-0.26 pattern `require.resolve('web-tree-sitter')` returns the JS
entry point's path; in 0.26+ that's `web-tree-sitter.js`, which is co-located
with the WASM — so the existing pattern happened to keep working in 0.26.x.
But the explicit `web-tree-sitter/web-tree-sitter.wasm` resolution is more
future-proof and matches the package's documented contract.

## ESM-vs-CJS subtlety

Package declares `"type": "module"`. In Vite's electron-main bundle (the
context Agent IDE runs `treeSitterParser.ts` in), `require.resolve` IS
available via electron-vite's CJS adaptation. In Vitest's pure-Node fork
environment, `require` is also available via `createRequire`. No special
handling needed for either context — `require.resolve` works.

## Worker-thread implication

`indexingWorker.ts` runs `TreeSitterParser` in a worker thread. The worker
must be built with the same web-tree-sitter version as the main process —
the build config handles this automatically (single `node_modules/web-tree-sitter`
resolved at bundle time), but if you ever split the worker into a separate
package, pin the version explicitly in both.

## Lockfile interaction

The bump in Wave 93 Phase C was done via `npm install --package-lock-only
--ignore-scripts` rather than `npm run lockfile:sync`. Reason: full
WSL2 from-scratch regen pulls drift on unrelated transitives (the bug Wave 92
shipped around). For single-dep bumps where you want a minimal-delta
lockfile change, `--package-lock-only` is the safe pattern. After running
it, manually write `.lockfile-sync.marker` with `generatedBy:
'<descriptive-name>'` so the pre-push guard accepts the push.

The drift checker (Wave 93 Phase A) catches unintended transitive bumps when
`lockfile:sync` IS used. Use it. But for narrow surgical bumps, the
`--package-lock-only` pattern is still appropriate.

## Symptoms to watch for

- `[treeSitterParser] load failed: <lang> @ <path>: Error: Incompatible language version N` in main-process logs — grammar ABI exceeds host's supported range. Fix: bump `web-tree-sitter` to a version supporting that ABI, OR pin `@vscode/tree-sitter-wasm` to a version emitting an older ABI.
- Codebase-graph queries return less accurate symbol info for a specific language after a bump — fallback to `tree-sitter-wasms@0.1.13` may have kicked in silently. Check main-process logs for "load failed" lines.
- `Cannot read properties of undefined (reading 'init')` when calling `Parser.init()` — you're on 0.25+ but still using `import Parser from 'web-tree-sitter'` (default import). Switch to `import { Parser } from 'web-tree-sitter'`.

## Related

- `tree-sitter-wasms` — fallback grammar package, ABI 13/14. Kept for languages not in `@vscode/tree-sitter-wasm` (e.g., Ruby, PHP, Java in some configurations).
- `@vscode/tree-sitter-wasm` — primary grammar source, ABI 15 as of 0.3.x. Currently pinned to `^0.3.1`.

## Wave 93 Phase C reference

- Acceptance test pattern: `src/main/codebaseGraph/treeSitterParser.integration.test.ts` — directly probes `Parser.setLanguage` with an explicit ABI 15 grammar. Re-use this shape if you need to verify a future ABI compatibility claim.
- Lockfile pattern: `npm install --package-lock-only --ignore-scripts` for single-dep bumps + manual marker write. See the file's deletion notes / wave-93-result for the exact recovery.
