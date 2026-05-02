# Unused npm Dependencies

**Generated:** 2026-05-01.
**Method:** Read `package.json`, grep `src/`, `tools/`, `scripts/`, and root config files for `from '<pkg>'` and `require('<pkg>')`. Cross-checked against `package.json` `scripts` for CLI-tool references.
**Caveat:** False-positive risk — packages used dynamically (`require(variable)`), via configuration-file-only consumption, or via post-install hooks won't show up via grep. Verify before removing any single entry. Run `npx knip` (already configured at `knip.config.ts`) for a stronger check.

---

## High confidence — no imports, no script references

These appear unused and have no obvious dynamic-load justification. Safe candidates for `npm uninstall`:

- `@xenova/transformers`
- `babel-plugin-react-compiler`
- `depcheck`
- `jsdom`
- `postcss`
- `remark-gfm`
- `rich-textarea`
- `rollup-plugin-visualizer`
- `vitest-axe`

## Low confidence — possible dynamic / tooling use

Verify before removing:

- **`@capacitor-mlkit/barcode-scanning`** — other `@capacitor/*` packages are present and used; this specific subpackage appears unused. Possibly slated for a future mobile feature.
- **`knip`** — referenced in `package.json` scripts but no source invocations (which is expected — knip is a CLI). Keep.
- **`tree-sitter-wasms`** — listed as fallback in `treeSitterParser.ts` comments; all grammars currently resolve via `@vscode/tree-sitter-wasm` primary path. May be kept for compatibility; remove only after verifying no fallback ever triggers.

## Types-only — keep

These are `@types/*` packages used implicitly by their corresponding runtime package. Not "unused" in any meaningful sense:

- `@types/adm-zip`
- `@types/better-sqlite3`
- `@types/dompurify`
- `@types/express`
- `@types/node`
- `@types/react`
- `@types/react-dom`
- `@types/ws`

---

## Recommended next step

Run `npx knip` to get a fuller picture — it will catch unused exports, files, and dependencies in one pass with the project's own configured rules. The list above is a starting point; treat any single removal as needing a `npm test` + `npm run build` verification.
