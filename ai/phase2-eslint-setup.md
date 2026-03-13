# Phase 2 — ESLint Setup

## Goal
Add ESLint with the user's preferred complexity/size rules. Run initial audit. Auto-fix safe issues.

## User's Preferred Rules
- `max-lines-per-function`: 40
- `complexity`: 10
- `max-lines` (file): 300
- `max-depth`: 3
- `max-params`: 4 (likely the forgotten one)

## Tasks

### 2.1 Install ESLint + plugins
```bash
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
```

### 2.2 Create eslint.config.mjs (flat config format)
- Use flat config (eslint v9+ style)
- Include:
  - `@eslint/js` recommended
  - `typescript-eslint` recommended
  - `eslint-plugin-react` + `react-hooks`
  - Custom complexity rules (warn, not error — so existing code doesn't block builds):
    - `max-lines-per-function: ["warn", { max: 40, skipBlankLines: true, skipComments: true }]`
    - `complexity: ["warn", 10]`
    - `max-lines: ["warn", { max: 300, skipBlankLines: true, skipComments: true }]`
    - `max-depth: ["warn", 3]`
    - `max-params: ["warn", 4]`
  - Ignore patterns: `node_modules/`, `dist/`, `out/`, `build-resources/`

### 2.3 Add lint scripts to package.json
```json
"lint": "eslint src/",
"lint:fix": "eslint src/ --fix"
```

### 2.4 Run initial audit
- Run `npx eslint src/ --format compact` to get violation counts
- Summarize: how many warnings per rule, which files are worst offenders
- Do NOT auto-fix yet — just report

### 2.5 Auto-fix safe issues
- Run `npx eslint src/ --fix` for auto-fixable issues only
- Review what changed
