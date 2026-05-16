---
status: PARTIAL
created: 2026-05-13
updated: 2026-05-16
partialResolution: tree-sitter half resolved by wave-93 Phase C (web-tree-sitter 0.22.6 → ^0.26.8, ABI 15)
remainingOpen: tailwind v4 codepoint error (section 1)
---

# Dev-server runtime errors: tailwind codepoint + tree-sitter wasm version drift

Two unrelated environmental issues surfaced in the running dev session on 2026-05-13. Both pre-exist Wave 88; both are real bugs worth fixing.

**UPDATE 2026-05-16**: Tailwind half (section 1) was actually fixed during Wave 88 ship tail (per the HANDOFF context — tailwind `@source not` directive added for `roadmap/wave-*-output/**` paths). Tree-sitter half (section 2) resolved by Wave 93 Phase C — `web-tree-sitter` bumped to ^0.26.8 with ABI 15 support; `@vscode/tree-sitter-wasm@0.3.1` grammars now load cleanly. Both halves effectively closed; this file remains for historical record.

## 1. Tailwind v4 — `Invalid code point 11509978` in `globals.css`

### Symptom

```
RangeError: Invalid code point 11509978
    at String.fromCodePoint (<anonymous>)
    at node_modules/tailwindcss/dist/lib.js:1:5549
    at String.replace (<anonymous>)
    at ke (node_modules/tailwindcss/dist/lib.js:1:5478)
    at mt.markUsedVariable (node_modules/tailwindcss/dist/lib.js:1:7716)
    at Object.build (node_modules/tailwindcss/dist/lib.js:38:1073)
    at Object.Once (node_modules/@tailwindcss/postcss/dist/index.js:10:5866)
[vite] Internal server error: [postcss] tailwindcss:
  C:/Web App/Agent IDE/src/renderer/styles/globals.css:1:1:
  Invalid code point 11509978
```

### Diagnosis

- `String.fromCodePoint` throws when its argument exceeds 0x10FFFF (1,114,111). The value `11,509,978` is ~10× over the valid Unicode range, so tailwind's `markUsedVariable` is decoding a malformed escape sequence somewhere in the project's CSS or class strings.
- Stack trace flags `mt.markUsedVariable` — tailwind v4's CSS variable escape parser is the culprit. It scans for `\<hex>` escapes in CSS identifiers / class names.
- Likely a CSS variable name or token containing an unescaped `\` followed by a long-looking hex digit run that tailwind tries to interpret as a unicode escape.
- Affected file (entry point): `src/renderer/styles/globals.css:1:1`. Actual offending content may be in an `@import`-ed file (`tokens.css`, `fonts.css`, `mobile.css`) or in any class string the renderer emits.

### Affected versions

- `tailwindcss@4.2.2` (`devDependencies`)
- `@tailwindcss/postcss@4.2.2`

### Fix shape

Three likely vectors, listed in order of probability:

1. **A token / CSS variable name contains a stray backslash.** Grep tokens.css / fonts.css / mobile.css for `\` outside known-safe contexts.
2. **A component's `className` or inline style has a malformed unicode escape.** Possibly a glyph from a recent commit (font icon constant, terminal escape constant).
3. **A tailwind v4 regression** in the variable-tracking path — file upstream if (1) and (2) come up clean. Workaround: pin to a known-working v4 minor.

### Verification

After fix: `npm run dev` boots without the postcss error, and `src/renderer/styles/globals.css` compiles cleanly.

### Blast radius

CSS compilation is fully blocked when this fires — the dev server can't transform `globals.css`, so the renderer loads with no styles. This blocks Wave 88 manual smoke (Phases 1, 3, 4) since the smoke walkthrough requires a working dev session.

---

## 2. Tree-sitter wasm — incompatible language version

### Symptom

```
[treeSitterParser] load failed: javascript @ ...tree-sitter-javascript.wasm:
  Error: Incompatible language version 15. Compatibility range 13 through 14.
[treeSitterParser] load failed: python @ ...tree-sitter-python.wasm:
  Error: Incompatible language version 15. Compatibility range 13 through 14.
```

### Diagnosis

- `web-tree-sitter@0.22.6` parser runtime supports language ABI versions 13-14.
- `@vscode/tree-sitter-wasm@0.3.1` ships grammar wasms compiled against ABI version 15.
- The two packages drifted: vscode bumped grammar ABI, but the project's `web-tree-sitter` host wasn't bumped to match.

### Affected versions

- `web-tree-sitter@0.22.6`
- `@vscode/tree-sitter-wasm@0.3.1`

### Fix shape

Either:
1. **Bump `web-tree-sitter`** to a version that supports ABI 15 (check upstream releases — likely `0.23.x` or `0.24.x`).
2. **Pin `@vscode/tree-sitter-wasm`** to a version still emitting ABI 13/14 grammars (likely `~0.2.x`).

Prefer (1) — moving forward beats holding the grammar package back.

### Verification

After fix: `treeSitterParser` loads `javascript` and `python` grammars without throwing. Codebase-graph indexing pipeline runs without the warnings.

### Blast radius

Codebase indexing falls back to non-tree-sitter parsing for affected languages — symbol resolution accuracy degrades. NOT a blocker for Wave 88 smoke (the dock terminal doesn't depend on tree-sitter), but visible in any session with the graph indexer running.

---

## Why both filed together

Both surfaced in the same dev-session log paste; both pre-exist Wave 88; both are environmental, not wave-related. Bundling so the next session triaging follow-ups sees them as the same kind of finding (dependency drift / runtime errors, not feature gaps).
