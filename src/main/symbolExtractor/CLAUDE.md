<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
**Regex vs AST trade-off here**: This module deliberately avoids AST parsing (no `@typescript-eslint/parser`, no `ts-morph`). That makes it fast and dependency-free but means it can only handle the *textual* shape of exports — it can't resolve `export * from` chains or infer `kind` for re-exports. The `kind: 'unknown'` on re-exports is the visible seam of this trade-off.

**Comment stripping preserves line numbers**: Instead of removing comment text, `stripComments` replaces each non-newline character with a space. This means line N in the stripped source still corresponds to line N in the original — critical for the `line` field on `ExtractedSymbol` to be accurate.

**The `MULTILINE_LOOKAHEAD = 5` cap is load-bearing**: Without a cap, a pathological file with no closing paren would cause the inner loop to scan the entire file for every function definition. The fixed window keeps worst-case behavior linear in file size.
`─────────────────────────────────────────────────`

The CLAUDE.md covers: the no-AST design, all six symbol kinds and their edge cases (especially `const` arrow functions), the two silent-skip conditions (`.d.ts` and >500KB), the multiline lookahead mechanism, every consumer module, and the `SymbolIndex` API including the destructive `build()` behavior.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/symbolExtractor/` — Regex-Based TypeScript Symbol Extractor

Extracts exported symbols (functions, classes, interfaces, types, enums, consts) from TypeScript/JavaScript source files using line-by-line regex — no AST. Produces typed symbol records with names, kinds, signatures, and line numbers for indexing and search.

## File Map

| File | Role |
|------|------|
| `symbolExtractor.ts` | Entry point — `extractSymbols(filePath, content)` strips comments, scans export lines, dispatches to parsers |
| `symbolExtractorHelpers.ts` | Signature extraction (paren matching, multiline lookahead) + individual export parsers (`parseNamedFunction`, `parseConstExport`, `parseDefaultExport`, `parseExportSpecifiers`) |
| `symbolExtractorTypes.ts` | Three core types: `ExtractedSymbol`, `FileSymbolExtraction`, `ModuleSymbolExtraction` |
| `symbolIndex.ts` | `SymbolIndex` class — builds a flat searchable index from `ModuleSymbolExtraction[]`; exposes `searchByName` and `getModuleSymbols` |
| `index.ts` | Barrel export |
| `symbolExtractor.test.ts` | Vitest tests for `extractSymbols` covering all symbol kinds and edge cases |

## Key Behaviors

**Comment stripping before parsing**: `stripComments` replaces comment content with spaces, preserving line numbers. This prevents false matches on `// export function foo` or string literals containing `export`.

**`.d.ts` and large files are silently skipped**: `extractSymbols` returns `[]` for `.d.ts` files and files > 500 KB. Callers receive an empty array — no error thrown.

**`export const` arrow functions become `kind: 'function'`**: If the RHS looks like `= (args) =>` or `= async function`, the symbol gets `kind: 'function'` with an extracted signature. Plain `export const FOO = 42` gets `kind: 'const'` with `signature: null`.

**Re-exports get `kind: 'unknown'`**: `export { foo, bar } from '...'` and `export { foo }` are indexed with `kind: 'unknown'` because the original kind can't be determined without following the import chain.

**Multiline signature lookahead**: When a function signature spans multiple lines (opening paren on line N, closing paren on line N+k), the helpers peek up to 5 lines ahead (`MULTILINE_LOOKAHEAD = 5`). Signatures are truncated to 120 chars.

**`security/detect-object-injection` suppressions**: ESLint fires on `text[ci]` array indexing inside loops. Each suppression comment has `-- ci is a bounded loop index` explaining why it is safe. Do not remove them without also satisfying the lint rule another way.

## Consumers

| Module | Usage |
|--------|-------|
| `contextLayer/contextLayerController.ts` | Extracts symbols from project files for context enrichment |
| `contextLayer/moduleSummarizer.ts` | Uses symbol lists to build module summaries |
| `codebaseGraph/graphParser*.ts` | Feeds extracted symbols into graph node construction |
| `internalMcp/internalMcpToolsGraph.ts` | Exposes symbol search via MCP tool responses |

## `SymbolIndex` API

```ts
const index = new SymbolIndex()
index.build(moduleExtractions)          // replaces existing data
index.searchByName('handleFoo', 20)     // case-insensitive substring, limit=20
index.getModuleSymbols('src/main/foo')  // all symbols for a module
index.size                              // total symbol count
```

`build()` is destructive — calling it again replaces all previous entries.

## Gotchas

- **Decorator lines are skipped**: Lines starting with `@` are ignored entirely. A decorator immediately before an `export` statement will not interfere, but `export` lines that begin with `@` (unusual but valid TS) will be missed.
- **`export * from '...'` is not handled**: Star re-exports produce no symbols. Only named re-exports with explicit brace lists are indexed.
- **`SymbolIndex.filePath` is always `''`**: `build()` takes `ModuleSymbolExtraction[]` which doesn't carry per-file paths. The `filePath` field on `SymbolIndexEntry` is populated only if callers do additional enrichment after building.
