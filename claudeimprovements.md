# Claude Code Improvements Plan

Comprehensive list of all hooks, rules, commands, settings, and CLAUDE.md refinements discussed. Nothing should be implemented without being tracked here first.

---

## Phase 1 — Global Hooks (`~/.claude/settings.json`)

These apply to every project and every Claude Code session.

### 1.1 Security Gate (PreToolUse / Bash)

- **Event:** `PreToolUse`
- **Matcher:** `Bash`
- **Type:** `command`
- **What it does:** Blocks dangerous shell commands before execution. Exit code 2 = hard block.
- **Patterns to block:**
  - `rm -rf /` (recursive root deletion)
  - `git push --force` / `git push -f` to main/master
  - `git reset --hard`
  - `taskkill /IM electron` (kills host IDE — critical for this project)
  - `DROP TABLE` / `DROP DATABASE`
  - Fork bombs (`:(){ :|:& };:`)
  - `shutdown`, `reboot`, `format`
- **Script location:** `~/.claude/hooks/security_gate.ps1`
- **Scope:** Global — these are never acceptable in any project

### 1.2 Auto-Format on Edit (PostToolUse / Edit|Write|MultiEdit)

- **Event:** `PostToolUse`
- **Matcher:** `Edit|Write|MultiEdit`
- **Type:** `command`
- **What it does:** Detects file type by extension and runs the appropriate formatter. Missing formatters are skipped silently (no errors, no blocking).
- **Formatter map:**
  - `.ts`, `.tsx`, `.js`, `.jsx` → `npx prettier --write` (or biome if available)
  - `.py` → `black --quiet` or `ruff format`
  - `.go` → `goimports -w` + `go fmt`
  - `.md` → `npx prettier --write --parser markdown`
  - `.json` → `npx prettier --write --parser json`
  - `.css`, `.scss` → `npx prettier --write`
- **Script location:** `~/.claude/hooks/auto_format.ps1`
- **Design:** Graceful degradation — check `command -v` / `Get-Command` before running. Skip silently if formatter not installed.
- **Scope:** Global — formatting is always desirable regardless of project

### 1.3 Notification on Stop (Stop)

- **Event:** `Stop`
- **Matcher:** (none — fires on every stop)
- **Type:** `command`
- **What it does:** Shows a Windows toast notification (BalloonTip) when Claude finishes responding or a session ends.
- **Script location:** `~/.claude/hooks/notify_stop.ps1`
- **Implementation:** PowerShell `BalloonTipText` via `System.Windows.Forms.NotifyIcon`, or `New-BurntToastNotification` if module available
- **Scope:** Global — always want to know when agent finishes

### 1.4 Notification on Needs Input (Notification)

- **Event:** `Notification`
- **Matcher:** (none)
- **Type:** `command`
- **What it does:** Shows a Windows toast notification when Claude needs user attention (permission request, question, etc.)
- **Script location:** `~/.claude/hooks/notify_attention.ps1`
- **Scope:** Global — always want to know when agent needs input

### 1.5 Bash Command Logging (PreToolUse / Bash)

- **Event:** `PreToolUse`
- **Matcher:** `Bash`
- **Type:** `command`
- **What it does:** Appends every Bash command to `~/.claude/logs/bash-commands.log` with timestamp, session ID, and working directory. Fire-and-forget (non-blocking).
- **Script location:** `~/.claude/hooks/log_bash.ps1`
- **Log format:** `2026-03-25T14:30:00Z | session_abc123 | C:\Web App\Agent IDE | npm test`
- **Scope:** Global — audit trail across all projects

### 1.6 PreCompact Context Save (PreCompact)

- **Event:** `PreCompact`
- **Matcher:** (none)
- **Type:** `command`
- **What it does:** Before Claude compresses the conversation, saves critical context (current task, key decisions, modified files) to `~/.claude/logs/precompact/` with session ID and timestamp.
- **Script location:** `~/.claude/hooks/precompact_save.ps1`
- **Scope:** Global — any long session benefits from context preservation

### 1.7 Failure Loop Detection (PostToolUseFailure)

- **Event:** `PostToolUseFailure`
- **Matcher:** (none)
- **Type:** `command`
- **What it does:** Logs tool failures to `~/.claude/logs/failures.log`. Tracks consecutive failures per session. After 3 consecutive failures of the same tool, outputs a warning to Claude's context suggesting it try a different approach.
- **Script location:** `~/.claude/hooks/failure_tracker.ps1`
- **State file:** `~/.claude/logs/failure_state.json` (tracks consecutive count per session)
- **Scope:** Global — catches loops in any project

---

## Phase 2 — Project Hooks (`.claude/settings.local.json`)

These are specific to the Agent IDE Electron project.

### 2.1 ESLint on Edit/Write (PostToolUse / Edit|Write)

- **Event:** `PostToolUse`
- **Matcher:** `Edit|Write`
- **Type:** `command`
- **What it does:** Runs `npx eslint --no-warn-ignored <file>` on the changed file after every edit. Only for `.ts`/`.tsx` files. Skips `.test.ts`, `.d.ts`, and non-TS files. Output truncated to last 20 lines to prevent context bloat.
- **Script location:** `assets/hooks/post_edit_eslint.ps1`
- **Feedback loop:** Yes — if ESLint finds violations, output appears in Claude's context. Claude fixes them, ESLint runs again, passes, done. This is intentional.
- **Scope:** Project — ESLint config (max-lines:40, complexity:10) is project-specific

### 2.2 Test Existence Check + Run (PostToolUse / Edit|Write)

- **Event:** `PostToolUse`
- **Matcher:** `Edit|Write`
- **Type:** `command`
- **What it does:** After editing a source file (not a test file), checks if a corresponding `.test.ts` exists (colocated or in `__tests__/`). If it exists, runs it with `npx vitest run <test-file> --reporter=verbose`. If it doesn't exist, outputs a warning.
- **Script location:** `assets/hooks/post_edit_test.ps1`
- **Test file resolution:**
  - `src/main/foo.ts` → check `src/main/foo.test.ts` then `src/main/__tests__/foo.test.ts`
  - Skip if edited file IS a test file
  - Skip if edited file is `.d.ts`, config, or non-TS
- **Output:** Truncated to last 20 lines. Only outputs if test fails or test file missing.
- **Scope:** Project — test naming conventions are project-specific

### 2.3 Lint Gate Before Commit (PreToolUse / Bash)

- **Event:** `PreToolUse`
- **Matcher:** `Bash`
- **Type:** `command`
- **What it does:** When the Bash command matches `git commit`, runs `npx eslint src/ --quiet` first. If ESLint fails, blocks the commit (exit 2) and outputs violations. If it passes, allows the commit (exit 0).
- **Script location:** `assets/hooks/pre_commit_lint.ps1`
- **Scope:** Project — enforces this project's "never relax lint rules" policy at the hook level
- **Note:** This is stronger than CLAUDE.md instructions — it's deterministic, can't be bypassed

---

## Phase 3 — Project Rules (`.claude/rules/`)

Glob-matched markdown files injected into context only when relevant files are being worked on. Saves tokens compared to putting everything in CLAUDE.md.

### 3.1 Main Process Rule

- **File:** `.claude/rules/main-process.md`
- **Glob:** `src/main/**`
- **Content:**
  - Node.js only — never import from `@renderer/*`
  - Use `ipcMain.handle` for request/response, `webContents.send` for push events
  - All native dependencies must be externalized in electron.vite.config.ts
  - Security rules apply: `eslint-plugin-security` is enforced at error level
  - Never use `eval()`, `new Function()`, or dynamic `require()` in main process

### 3.2 Renderer Rule

- **File:** `.claude/rules/renderer.md`
- **Glob:** `src/renderer/**`
- **Content:**
  - Browser environment — no Node.js APIs, no `require`, no `fs`, no `path`
  - Always use `window.electronAPI` bridge (defined in preload) for IPC
  - Styling: Tailwind utilities + CSS custom properties only, never hardcode hex colors
  - Two event systems: Electron IPC (via preload) vs DOM CustomEvents (renderer-only) — never mix
  - Use semantic design tokens: `surface-*`, `text-semantic-*`, `interactive-*`, `status-*`

### 3.3 Preload Rule

- **File:** `.claude/rules/preload.md`
- **Glob:** `src/preload/**`
- **Content:**
  - Minimal surface area — only `contextBridge.exposeInMainWorld`
  - No business logic — just relay calls between renderer and main
  - Type definitions must match `src/renderer/types/electron.d.ts` exactly
  - Never expose raw `ipcRenderer` — always wrap in typed functions

### 3.4 Terminal Rule

- **File:** `.claude/rules/terminal.md`
- **Glob:** `src/renderer/components/Terminal/**`
- **Content:**
  - Package: `@xterm/xterm` (NOT legacy `xterm` — incompatible)
  - Double-rAF after `term.open()` before calling `fit()` — viewport not ready until then
  - Use `isReadyRef` guard pattern to prevent premature fit calls
  - Block OSC 10/11/12 via `term.parser.registerOscHandler` — prevents theme color override
  - No WebGL addon — causes ghost cursor artifacts during rapid output
  - Canvas renderer only

### 3.5 IPC Contract Rule

- **File:** `.claude/rules/ipc-contract.md`
- **Glob:** `src/renderer/types/electron*.d.ts`
- **Content:**
  - This file is the single source of truth for all IPC shapes
  - Changes here cascade to: preload bridge, main handlers, renderer consumers
  - Channel naming convention: `domain:action` (e.g., `pty:spawn`, `files:readDir`)
  - After editing, run `npx tsc --noEmit` to verify type consistency across all three processes
  - All handlers return `{ success: boolean; error?: string }` pattern

### 3.6 Test File Rule

- **File:** `.claude/rules/test-files.md`
- **Glob:** `src/**/*.test.ts`
- **Content:**
  - Test framework: vitest (not jest, not mocha)
  - Use `describe`/`it`/`expect` from vitest
  - Relaxed lint rules: `max-lines-per-function` and `max-lines` are OFF for test files
  - Test behavior, not implementation — avoid testing internal state
  - Prefer integration tests over mocks where practical
  - Colocate test files with source (e.g., `foo.ts` + `foo.test.ts`)

### 3.7 Config Files Rule

- **File:** `.claude/rules/config-files.md`
- **Glob:** `*.config.*`
- **Content:**
  - Changes to build config affect ALL three targets (main, preload, renderer)
  - After editing: run `npm run build` to verify, then `npm test`
  - Monaco plugin CJS/ESM interop: `vite-plugin-monaco-editor` uses `.default ?? module` — do not simplify
  - `optimizeDeps.force: true` prevents stale hash mismatches — do not change in dev
  - File watcher exclusions in electron.vite.config.ts prevent agent file changes from triggering HMR

### 3.8 ESLint Awareness Rule (Complements Hook #2.1)

- **File:** `.claude/rules/eslint-awareness.md`
- **Glob:** `src/**/*.{ts,tsx}`
- **Purpose:** Proactive — tells Claude the ESLint constraints BEFORE writing code, so it produces fewer violations in the first place. The ESLint hook (#2.1) is reactive — catches what this rule misses. Together they minimize edit→lint→fix cycles.
- **Content:**
  - MUST follow these ESLint constraints when writing or editing code:
  - `max-lines-per-function: 40` (skipBlankLines, skipComments) — extract helpers if a function exceeds this
  - `complexity: 10` — max cyclomatic complexity; use early returns and guard clauses to reduce branching
  - `max-lines: 300` per file (skipBlankLines, skipComments) — split into separate modules if approaching limit
  - `max-depth: 3` — max nesting levels; flatten with early returns or extract nested logic
  - `max-params: 4` — use an options object if more parameters are needed
  - `no-console: warn` — only `console.warn` and `console.error` are allowed; remove `console.log` before finishing
  - `simple-import-sort/imports: error` — imports must be sorted (auto-fixable, but write them sorted to avoid churn)
  - `simple-import-sort/exports: error` — exports must be sorted
  - Security rules (main/preload only): `security/detect-object-injection`, `security/detect-non-literal-regexp`, `security/detect-non-literal-require`, `security/detect-non-literal-fs-filename`, `security/detect-eval-with-expression`, `security/detect-child-process` — all at error level
  - Test files (`*.test.ts`) are exempt from `max-lines-per-function` and `max-lines`
- **Relationship to hook:** This rule reduces iterations. The hook guarantees correctness. Use both.

---

## Phase 4 — Global Rules (`~/.claude/rules/`)

Universal rules that apply across all projects.

### 4.1 No Secrets Rule

- **File:** `~/.claude/rules/no-secrets.md`
- **Glob:** `**/.env*`
- **Content:**
  - MUST NOT log, print, echo, or commit values from .env files
  - MUST NOT modify .env files without explicit user instruction
  - MUST NOT create new .env files — ask user to create manually
  - If a secret is needed for testing, use placeholder: `sk-test-placeholder`

### 4.2 Lockfiles Rule

- **File:** `~/.claude/rules/lockfiles.md`
- **Glob:** `**/package-lock.json,**/pnpm-lock.yaml,**/yarn.lock`
- **Content:**
  - MUST NOT manually edit lockfiles — they are auto-generated
  - Use the appropriate package manager command to modify dependencies
  - If lockfile conflicts occur during merge, delete and regenerate — do not manually resolve

### 4.3 Minified Files Rule

- **File:** `~/.claude/rules/no-minified.md`
- **Glob:** `**/*.min.js,**/*.min.css`
- **Content:**
  - These are build artifacts — do not read, edit, or analyze
  - Find the source file instead (usually same name without .min)
  - If you need to understand minified code, ask the user where the source is

---

## Phase 5 — Global Commands (`~/.claude/commands/`)

User-level slash commands available in every project.

### 5.1 `/user:tdd`

- **File:** `~/.claude/commands/tdd.md`
- **Purpose:** Universal test-driven development cycle
- **Template:**
  ```
  Follow a strict TDD cycle for: $ARGUMENTS

  1. RED: Write a failing test that describes the expected behavior
  2. GREEN: Write the minimum code to make the test pass
  3. REFACTOR: Improve the code while keeping tests green
  4. VERIFY: Run the full test suite to ensure no regressions

  After each phase, show me what you did and wait for confirmation before proceeding.
  ```

### 5.2 `/user:review`

- **File:** `~/.claude/commands/review.md`
- **Purpose:** Multi-perspective code review on recent changes
- **Template:**
  ```
  Review the recent uncommitted changes from multiple perspectives:

  1. **Architecture**: Does this follow established patterns? Any boundary violations?
  2. **Security**: Any injection risks, exposed secrets, unsafe operations?
  3. **Performance**: Any N+1 queries, unnecessary re-renders, memory leaks?
  4. **Quality**: Code clarity, naming, complexity, test coverage?

  For each issue found, rate severity (CRITICAL/HIGH/MEDIUM/LOW) and suggest a fix.
  $ARGUMENTS
  ```

### 5.3 `/user:explain`

- **File:** `~/.claude/commands/explain.md`
- **Purpose:** Deep explanation of a file or function
- **Template:**
  ```
  Provide a deep explanation of: $ARGUMENTS

  1. What it does and why it exists
  2. Who calls it and what it calls (trace the dependency chain)
  3. Design decisions — why was it built this way?
  4. Gotchas — what would trip up someone modifying this?
  5. Related files that would need to change if this changes
  ```

### 5.4 `/user:deps-audit`

- **File:** `~/.claude/commands/deps-audit.md`
- **Purpose:** Dependency health check
- **Template:**
  ```
  Audit the project dependencies:

  1. Run `npm audit` and summarize vulnerabilities by severity
  2. Check for outdated packages: `npm outdated`
  3. Look for unused dependencies (check imports vs package.json)
  4. Flag any packages with known issues or that are unmaintained
  5. Check license compatibility

  Provide a summary table and recommended actions.
  $ARGUMENTS
  ```

### 5.5 `/user:onboard`

- **File:** `~/.claude/commands/onboard.md`
- **Purpose:** Explore and understand an unfamiliar codebase
- **Template:**
  ```
  Explore this codebase and help me understand it:

  1. What does this project do? (read README, package.json, entry points)
  2. Tech stack and key dependencies
  3. Architecture — how is the code organized? What are the main modules?
  4. Entry points — where does execution start?
  5. Key patterns and conventions used
  6. How to build, test, and run
  7. Any gotchas or non-obvious setup steps

  $ARGUMENTS
  ```

### 5.6 `/user:smart-fix`

- **File:** `~/.claude/commands/smart-fix.md`
- **Purpose:** Describe a bug, agent diagnoses and fixes
- **Template:**
  ```
  Fix this issue: $ARGUMENTS

  1. Reproduce: Understand the symptoms and identify where the bug manifests
  2. Diagnose: Trace the code path to find the root cause (not just symptoms)
  3. Fix: Implement the minimal fix that addresses the root cause
  4. Test: Write or update tests to cover this case
  5. Verify: Run relevant tests to confirm the fix and check for regressions

  Show your reasoning at each step.
  ```

### 5.7 `/user:context-save`

- **File:** `~/.claude/commands/context-save.md`
- **Purpose:** Persist session state for continuity
- **Template:**
  ```
  Save the current session context to a file for future reference:

  1. What task was I working on?
  2. What approach was chosen and why?
  3. What has been completed so far?
  4. What remains to be done?
  5. Any key decisions or constraints discovered?
  6. Any blockers or open questions?

  Write this to a `context-snapshot.md` file in the project root.
  $ARGUMENTS
  ```

---

## Phase 6 — Project Commands (`.claude/commands/`)

Project-specific slash commands for the Agent IDE.

### 6.1 `/project:blast-radius`

- **File:** `.claude/commands/blast-radius.md`
- **Purpose:** Impact analysis using codebase graph
- **Template:**
  ```
  Run impact analysis on current uncommitted changes:

  1. Use `detect_changes` from codebase-memory-mcp to find affected symbols with risk levels
  2. For any CRITICAL or HIGH risk symbols, run `trace_call_path` to show the full dependency chain
  3. Check if test files exist for each affected symbol
  4. Summarize: files affected, risk levels, test coverage gaps, and recommended actions

  $ARGUMENTS
  ```

### 6.2 `/project:pre-commit`

- **File:** `.claude/commands/pre-commit.md`
- **Purpose:** Quality gate before committing
- **Template:**
  ```
  Run pre-commit quality checks:

  1. TypeScript: `npx tsc --noEmit` — verify no type errors across all three processes
  2. ESLint: `npx eslint src/ --quiet` — verify no lint violations
  3. Tests: Run tests for any files changed in this session
  4. Process boundaries: Verify no cross-process imports (main ↔ renderer)
  5. Design tokens: Verify no hardcoded hex colors in renderer code

  Report pass/fail for each check. If all pass, proceed with commit.
  $ARGUMENTS
  ```

### 6.3 `/project:safe-check`

- **File:** `.claude/commands/safe-check.md`
- **Purpose:** Verify project-specific safety invariants
- **Template:**
  ```
  Run safety checks specific to this Electron IDE:

  1. Process boundaries: grep for `@renderer` imports in src/main/ and `require` in src/renderer/
  2. Legacy xterm: grep for imports from `xterm` (should be `@xterm/xterm`)
  3. Hardcoded colors: grep for hex color values (#xxx, #xxxxxx, rgb()) in src/renderer/
  4. Raw IPC: grep for `ipcRenderer` usage outside of src/preload/
  5. Electron kill: grep for `taskkill` or `kill.*electron` in any file

  Report any violations found with file:line references.
  $ARGUMENTS
  ```

### 6.4 `/project:graph-sync`

- **File:** `.claude/commands/graph-sync.md`
- **Purpose:** Re-index and report on codebase graph
- **Template:**
  ```
  Re-index the codebase graph and report changes:

  1. Run `index_repository` from codebase-memory-mcp
  2. Run `get_architecture` with aspects=['hotspots'] to find most-connected functions
  3. Compare hotspots to previous known hotspots
  4. Report: new files indexed, removed files, new hotspots, changed connections

  $ARGUMENTS
  ```

### 6.5 `/project:lint-fix-all` (Sonnet-delegated bulk cleanup)

- **File:** `.claude/commands/lint-fix-all.md`
- **Purpose:** Bulk ESLint cleanup delegated to a Sonnet subagent for cost efficiency. Use this instead of manually fixing lint across many files. Opus stays on architectural/creative work; Sonnet handles mechanical fixes.
- **When to use:** During periodic cleanup sessions (the 2-5 day cleanup cycle), or before a release/PR when many files have accumulated violations.
- **Template:**
  ```
  Perform a bulk ESLint cleanup across the codebase using a cost-efficient approach:

  1. Run `npx eslint src/ --format json` to get ALL current violations
  2. Group violations by file
  3. For each file with violations, spawn a Sonnet subagent (Agent tool with model: "sonnet") to fix them:
     - The subagent should read the file, understand the violations, and fix them
     - It must respect the existing code style and architecture
     - It should extract helper functions to meet max-lines-per-function (40)
     - It should reduce complexity with early returns and guard clauses
     - It must NOT change behavior — only restructure to pass lint
  4. After all subagents complete, run `npx eslint src/ --quiet` to verify zero violations remain
  5. Run `npm test` to verify no regressions
  6. Report: files fixed, violations resolved, any remaining issues

  $ARGUMENTS
  ```
- **Cost rationale:** Sonnet is significantly cheaper than Opus for mechanical refactoring. A cleanup session that touches 20+ files saves substantial cost by routing the repetitive fix work to Sonnet while Opus orchestrates.

---

## Phase 7 — CLAUDE.md Refinement

Based on research finding that enforceable rules should graduate to hooks, and CLAUDE.md should contain only non-obvious context that can't be derived from code.

### Rules to Graduate to Hooks (remove from CLAUDE.md)

These are currently in CLAUDE.md as text instructions but should become deterministic hooks:

- "NEVER kill Electron processes" → Security gate hook (#1.1)
- "Never hardcode colors" → Could be a lint rule or safe-check command
- Formatting expectations → Auto-format hook (#1.2)
- "Run tests/lint after changes" → ESLint hook (#2.1) + test hook (#2.2)

### Content to Keep in CLAUDE.md

Non-obvious context that hooks can't enforce:

- Meta-development warning (building the IDE from within itself)
- Two event systems distinction (IPC vs DOM CustomEvents)
- Terminal gotchas (xterm double-rAF, OSC blocking, no WebGL)
- Monaco CJS/ESM interop quirk
- Web build ordering (vite.web.config.ts before vite.webpreload.config.ts)
- Task-type skip list (which docs to read for which task)
- Path aliases table
- Design token system documentation
- Known tech debt items

### Target

Reduce actionable rules portion to ~80 lines by moving enforcement to hooks and context to rules files.

---

## Phase 8 — Additional Settings

### 8.1 Status Line

- **Setting:** `statusLine` in `~/.claude/settings.json`
- **What it does:** Shows real-time info bar (branch, model, token usage) in the terminal
- **Implementation:** PowerShell script or lightweight binary
- **Priority:** Low — nice to have, not critical

### 8.2 UserPromptSubmit Hook

- **Event:** `UserPromptSubmit`
- **What it does:** Runs before Claude processes user input. Could inject git context (current branch, recent changes), suggest relevant skills, or validate prompts.
- **Priority:** High effort — requires prompt engineering to be useful without being noisy
- **Defer:** Implement after Phase 1-6 are stable

---

## Implementation Notes

### Hook Script Language

- All scripts in PowerShell (`.ps1`) for Windows compatibility
- Corresponding `.sh` versions for cross-platform support (CI, Linux, macOS)
- Scripts read stdin JSON, extract relevant fields with `ConvertFrom-Json`

### Hook Ordering

- Multiple hooks on the same event fire sequentially
- Existing Ouroboros relay hooks remain — new hooks are ADDITIONAL, not replacements
- Security gate should fire BEFORE Ouroboros relay (order in settings.json array matters)

### Performance Budget

- Each hook should complete in <500ms
- ESLint on single file: ~1s (acceptable)
- Vitest on single file: ~2-3s (acceptable)
- Auto-format: <500ms per file
- Security gate regex check: <50ms

### Error Handling

- All hooks exit 0 on internal errors (never block Claude due to hook bugs)
- Exception: security gate exits 2 to block dangerous commands
- Ouroboros not running → skip silently (existing pattern)
- Formatter not installed → skip silently (graceful degradation)

### File Locations Summary

```
~/.claude/
  settings.json          ← Add new global hook entries
  hooks/
    security_gate.ps1    ← NEW: Block dangerous commands
    auto_format.ps1      ← NEW: Language-detecting formatter
    notify_stop.ps1      ← NEW: Windows toast on session end
    notify_attention.ps1 ← NEW: Windows toast on needs input
    log_bash.ps1         ← NEW: Bash command audit log
    precompact_save.ps1  ← NEW: Save context before compression
    failure_tracker.ps1  ← NEW: Track consecutive failures
    (existing Ouroboros hooks remain unchanged)
  commands/
    tdd.md               ← NEW: /user:tdd
    review.md            ← NEW: /user:review
    explain.md           ← NEW: /user:explain
    deps-audit.md        ← NEW: /user:deps-audit
    onboard.md           ← NEW: /user:onboard
    smart-fix.md         ← NEW: /user:smart-fix
    context-save.md      ← NEW: /user:context-save
  rules/
    no-secrets.md        ← NEW: Protect .env files
    lockfiles.md         ← NEW: Don't edit lockfiles
    no-minified.md       ← NEW: Skip minified files
  logs/
    bash-commands.log    ← Created by log_bash hook
    failures.log         ← Created by failure_tracker hook
    precompact/          ← Created by precompact_save hook

<project>/.claude/
  settings.local.json    ← Add project hook entries
  rules/
    main-process.md      ← NEW: Node.js main process rules
    renderer.md          ← NEW: Browser renderer rules
    preload.md           ← NEW: Preload bridge rules
    terminal.md          ← NEW: xterm.js gotchas
    ipc-contract.md      ← NEW: IPC type contract rules
    test-files.md        ← NEW: Vitest conventions
    config-files.md      ← NEW: Build config caution
    eslint-awareness.md  ← NEW: Proactive ESLint constraints (complements hook 2.1)
  commands/
    blast-radius.md      ← NEW: /project:blast-radius
    pre-commit.md        ← NEW: /project:pre-commit
    safe-check.md        ← NEW: /project:safe-check
    graph-sync.md        ← NEW: /project:graph-sync
    lint-fix-all.md      ← NEW: /project:lint-fix-all (Sonnet bulk cleanup)

<project>/assets/hooks/
  post_edit_eslint.ps1   ← NEW: ESLint after edit
  post_edit_test.ps1     ← NEW: Test check after edit
  pre_commit_lint.ps1    ← NEW: Lint gate before commit
```

---

## Checklist

### Phase 1 — Global Hooks
- [x] 1.1 Security gate (PreToolUse/Bash)
- [x] 1.2 Auto-format (PostToolUse/Edit|Write|MultiEdit)
- [x] 1.3 Notification on stop (Stop)
- [x] 1.4 Notification on needs input (Notification)
- [x] 1.5 Bash command logging (PreToolUse/Bash)
- [x] 1.6 PreCompact context save (PreCompact)
- [x] 1.7 Failure loop detection (PostToolUseFailure)

### Phase 2 — Project Hooks
- [x] 2.1 ESLint on edit/write (PostToolUse/Edit|Write)
- [x] 2.2 Test existence check + run (PostToolUse/Edit|Write)
- [x] 2.3 Lint gate before commit (PreToolUse/Bash)

### Phase 3 — Project Rules
- [x] 3.1 Main process rule
- [x] 3.2 Renderer rule
- [x] 3.3 Preload rule
- [x] 3.4 Terminal rule
- [x] 3.5 IPC contract rule
- [x] 3.6 Test file rule
- [x] 3.7 Config files rule
- [x] 3.8 ESLint awareness rule (proactive complement to hook 2.1)

### Phase 4 — Global Rules
- [x] 4.1 No secrets rule
- [x] 4.2 Lockfiles rule
- [x] 4.3 Minified files rule

### Phase 5 — Global Commands
- [x] 5.1 /user:tdd
- [x] 5.2 /user:review
- [x] 5.3 /user:explain
- [x] 5.4 /user:deps-audit
- [x] 5.5 /user:onboard
- [x] 5.6 /user:smart-fix
- [x] 5.7 /user:context-save

### Phase 6 — Project Commands
- [x] 6.1 /project:blast-radius
- [x] 6.2 /project:pre-commit
- [x] 6.3 /project:safe-check
- [x] 6.4 /project:graph-sync
- [x] 6.5 /project:lint-fix-all (Sonnet-delegated bulk cleanup)

### Phase 7 — CLAUDE.md Refinement
- [x] Graduate enforceable rules to hooks
- [x] Remove duplicated content now covered by rules files
- [x] Target ~80 lines for actionable portion

### Phase 8 — Settings (Deferred)
- [ ] 8.1 Status line configuration
- [ ] 8.2 UserPromptSubmit hook
