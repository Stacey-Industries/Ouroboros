# Ouroboros v1.0 Readiness Audit

**Date:** 2026-03-22
**Auditor:** Claude Opus 4.6 (7 parallel subagents)
**Scope:** Full codebase — structural health, code quality, testing, UI/UX, build/release, documentation, polish
**Codebase:** ~450+ source files across `src/main/`, `src/renderer/`, `src/preload/`, `src/web/`, `src/shared/`

---

## Executive Summary

Ouroboros is in a **strong-but-incomplete** state for v1.0. The core architecture is sound, TypeScript discipline is excellent (zero type errors, 3 total `any` usages, zero `@ts-ignore`), and Electron security is best-in-class (sandbox, context isolation, path validation, CSP). The codebase reflects genuine engineering care.

However, there are **hard blockers** that will cause the packaged app to crash or fail to build, a **complete absence of CI/CD**, near-zero test coverage outside `src/main/`, no root README or LICENSE, and a dual CSS variable system that breaks light/high-contrast themes. The working tree also has 84 uncommitted source files and 549 modified files — the audit is running against an unstable snapshot.

### Health Scorecard

| Area                  | Grade  | Notes                                                                              |
| --------------------- | ------ | ---------------------------------------------------------------------------------- |
| TypeScript strictness | **A**  | Zero errors, strict mode, minimal `any`, no `@ts-ignore`                           |
| Security              | **A**  | Sandbox, CSP, path validation, protocol checks, no secrets                         |
| Architecture          | **B+** | Clean process separation, good module boundaries, one cross-process type leak      |
| Error handling        | **B+** | Consistent IPC pattern, all catch blocks annotated, one missing top-level boundary |
| UI component quality  | **B-** | Good primitives and patterns, but 87 oversized components, dual color systems      |
| Build pipeline        | **C**  | Builds work locally, but packaging has 3 crash-causing gaps                        |
| Testing               | **D**  | 15 test files, zero renderer/e2e tests, 5% thresholds, no CI                       |
| Documentation         | **D**  | No README, no LICENSE, stale API docs, no CHANGELOG                                |
| Release readiness     | **F**  | No CI, no code signing, placeholder update repo, no icons for macOS/Linux          |

### Estimated Effort to v1.0

| Priority             | Issue Count | Effort     |
| -------------------- | ----------- | ---------- |
| Critical (must fix)  | 14          | ~3-5 days  |
| High (should fix)    | 18          | ~5-8 days  |
| Medium (quality bar) | 22          | ~5-10 days |
| Low (polish)         | 15          | ~3-5 days  |

---

## Critical Issues (MUST fix before v1.0)

These will cause crashes, build failures, legal problems, or security exposure in a shipped product.

### C1. `better-sqlite3` missing from `asarUnpack` — packaged app will crash on launch

- **File:** `package.json` lines 146-150
- **What:** `asarUnpack` lists `node-pty`, `web-tree-sitter`, and `tree-sitter-wasms`, but not `better-sqlite3`. This native module's `.node` binding must be readable outside the asar archive.
- **Impact:** The packaged app crashes with `Cannot find module '.../better_sqlite3.node'` on first launch. Every user. Every platform.
- **Fix:** Add `"**/node_modules/better-sqlite3/**"` to `asarUnpack`.
- **Effort:** Trivial

### C2. `electron-rebuild` not in devDependencies — native modules won't rebuild on fresh install

- **File:** `package.json` lines 29-30
- **What:** `postinstall` and `rebuild:native` scripts call `electron-rebuild`, but it's not declared as a dependency. It only exists as a transitive dep of `electron-builder`. The actual package has been renamed to `@electron/rebuild`.
- **Impact:** `npm install` on a clean checkout silently fails to rebuild `better-sqlite3` and `node-pty`. The app crashes at runtime with ABI mismatch errors.
- **Fix:** Add `"@electron/rebuild": "^3.6.1"` to devDependencies. Update scripts to include `node-pty` in the rebuild list.
- **Effort:** Trivial

### C3. macOS icon (`icon.icns`) and Linux icon (`icon.png`) missing from `build-resources/`

- **File:** `build-resources/` (only `icon.ico` exists)
- **What:** `electron-builder` config references `icon.icns` (macOS) and `icon.png` (Linux), but neither file exists.
- **Impact:** macOS and Linux builds fail or produce an app with no icon.
- **Fix:** Create `icon.icns` (1024x1024 base) and `icon.png` (512x512 minimum).
- **Effort:** Low (30 min with source artwork)

### C4. No LICENSE file — legal blocker for any distribution

- **File:** Project root (missing)
- **What:** No `LICENSE`, `LICENSE.md`, or `LICENSE.txt`. The code is technically "all rights reserved" by default.
- **Impact:** Blocks open-source distribution, contribution, and enterprise adoption. GitHub shows "No license."
- **Fix:** Add appropriate `LICENSE` file (MIT for open-source, proprietary notice for closed).
- **Effort:** Trivial

### C5. Web access token logged to stdout — security exposure

- **File:** `src/main/main.ts:240`
- **What:** `console.log(`[web] Access URL: http://localhost:${webPort}?token=${token}`)` — the token grants full IDE access (file R/W, terminal spawn, git commands).
- **Impact:** Token visible in shell history, log capture, crash dumps, process monitoring.
- **Fix:** Log only the URL without the token. Provide a UI affordance to reveal the token on demand.
- **Effort:** Trivial

### C6. `execSync(taskkill)` freezes main thread up to 5 seconds on Windows

- **Files:** `src/main/orchestration/providers/claudeStreamJsonRunner.ts:117`, `src/main/orchestration/providers/codexExecRunner.ts:201`
- **What:** `execSync('taskkill /T /F /PID ${child.pid}', { timeout: 5000 })` blocks the entire main process.
- **Impact:** On Windows, canceling an agent task freezes all UI, IPC, and event handling for up to 5 seconds.
- **Fix:** Use async `exec()` variant instead. The process is being killed — there's nothing to wait for.
- **Effort:** Trivial

### C7. `readFileSync` in IDE tool handler hot path

- **File:** `src/main/ideToolServerHandlers.ts:94`
- **What:** `fs.readFileSync(filePath, 'utf-8')` called synchronously in agent-triggered file read handler.
- **Impact:** Synchronous file I/O blocks the main process event loop. Large files cause visible UI freezes.
- **Fix:** Convert to `fs.promises.readFile(filePath, 'utf-8')`.
- **Effort:** Trivial

### C8. OAuth token refresh has no timeout — silent stall on network issues

- **File:** `src/main/orchestration/providers/anthropicAuth.ts:59+`
- **What:** `fetch(ANTHROPIC_TOKEN_ENDPOINT, ...)` with no `AbortSignal.timeout()` and no retry logic.
- **Impact:** Token refresh is in the critical path before each agent invocation. A network timeout silently stalls the agent indefinitely.
- **Fix:** Add `AbortSignal.timeout(10000)` and surface error as a user-facing toast.
- **Effort:** Trivial

### C9. ESLint violations mean `npm run validate` fails — no green CI gate

- **Files:** 30+ files exceeding `max-lines: 300`
- **What:** The ESLint config enforces `max-lines: 300` but dozens of files violate it. `npm run lint` fails, therefore `npm run validate` fails.
- **Impact:** The validation pipeline cannot pass, blocking any CI gate. The existing `lint-output.txt` (40KB) and `.lint-report.json` (1.4MB) at root confirm this.
- **Fix:** Split oversized files using the established `.parts.tsx`/`.model.ts`/`.view.tsx` pattern, or temporarily relax the rule with a ratchet plan.
- **Effort:** Large (systematic work across 30+ files)

### C10. 84 source files untracked, 549 files modified — unstable working tree

- **What:** Massive uncommitted change surface (13K insertions, 36K deletions). The audit ran against code that doesn't match any committed state.
- **Impact:** If the working tree is lost, all work is gone. Tests/typechecks may be running against stale state.
- **Fix:** Commit or stage all intended changes before proceeding with v1.0 work.
- **Effort:** Small (git operations)

### C11. No CI/CD pipeline exists

- **What:** No `.github/workflows/`, no `.gitlab-ci.yml`, no CI config of any kind.
- **Impact:** Build-breaking commits can merge undetected. No automated build, test, lint, typecheck, or packaging.
- **Fix:** Create GitHub Actions workflow: checkout -> `npm ci` -> `npm run validate` -> `npm run build`.
- **Effort:** Medium (2-4 hours)

### C12. Auto-updater publish repo is placeholder `ouroboros/ouroboros`

- **File:** `package.json` lines 192-196
- **What:** `"owner": "ouroboros"`, `"repo": "ouroboros"` — clearly placeholder values.
- **Impact:** All update checks in production silently fail. Users never receive updates.
- **Fix:** Set to actual GitHub organization/repository name.
- **Effort:** Trivial

### C13. No root README.md

- **What:** No `README.md` at project root. A comprehensive beginner's guide exists at `docs/guides/complete-beginners-guide.md` but is not discoverable.
- **Impact:** First thing anyone sees on GitHub. Without it, the project looks abandoned.
- **Fix:** Create README.md with: project description, prerequisites, quickstart, links to docs, screenshot.
- **Effort:** Small (2-4 hours)

### C14. `src/web/` directory not type-checked by `npm run typecheck`

- **File:** `tsconfig.web.json` (missing `src/web/**/*` in include)
- **What:** 4 web preload files (36KB) are built by Vite but never type-checked in the validation pipeline.
- **Impact:** Type errors in the web preload layer are invisible.
- **Fix:** Add `src/web/**/*` to `tsconfig.web.json` include array.
- **Effort:** Small

---

## High Priority (SHOULD fix before v1.0)

### H1. No top-level React error boundary

- **File:** `src/renderer/App.tsx` / `src/renderer/index.tsx`
- **What:** Panel-level boundaries exist in `InnerAppLayout`, but nothing wraps the bootstrap phase. A crash during provider initialization white-screens with no recovery.
- **Fix:** Wrap `<App>` in an error boundary in `index.tsx` with a "Reload" button.
- **Effort:** Small (30 min)

### H2. No structured logging / no log persistence

- **Files:** 93 files across main/renderer, ~268 `console.*` calls
- **What:** All logging is ad-hoc `console.*` with bracketed module prefixes. No log levels, no file output, no filtering, no rotation.
- **Fix:** Integrate `electron-log`. Route `console.*` to the logger in main. Add "Open Logs Folder" menu item.
- **Effort:** Medium (2-4 hours)

### H3. Two coexisting CSS variable naming systems

- **Files:** 172 files use legacy vars (`var(--bg)`, `var(--text)`, etc.); 20 files use new semantic tokens (`var(--surface-base)`, `var(--text-primary)`)
- **What:** Both sets must be defined in every theme, creating permanent maintenance burden. Any theme that only defines one set produces blank/transparent colors in the other.
- **Fix:** Decide on canonical variable names, then migrate. Medium refactor.
- **Effort:** Medium

### H4. 116 hardcoded hex colors break light/high-contrast themes

- **Files:** 30 files, worst offenders: `RichInputBody.tsx` (16 instances), `ApprovalDialogCard.tsx`, `AgentChatDiffReview.tsx`, `TimeTravelDetails.tsx`
- **What:** Dark-mode-optimized hex values like `#3fb950`, `#f85149`, `#0d0d12` used directly in component styles.
- **Fix:** Replace with Tailwind token equivalents (`accent-green` -> `var(--status-success)`, etc.).
- **Effort:** Medium

### H5. Accessibility: 20 files with `<div onClick>` without keyboard access

- **Files:** `ApprovalDialogCard.tsx` (critical approval action), `EditorTabBar.tsx`, `FileViewerTabItem.tsx`, `BlameGutter.tsx`, `AgentChatPlanBlock.tsx`, etc.
- **What:** Interactive divs with click handlers but no `role="button"`, `tabIndex`, or `onKeyDown`.
- **Fix:** Replace with `<button>` or add `role="button"` + `tabIndex={0}` + Enter/Space keyboard handler.
- **Effort:** Medium (each fix is small but 20+ locations)

### H6. AgentChat message list not virtualized

- **File:** `src/renderer/components/AgentChat/AgentChatConversationBody.tsx`
- **What:** All messages rendered to DOM. Long sessions with many tool cards, code blocks, and expandable sections get progressively slower.
- **Fix:** Integrate `@tanstack/virtual` for the message list.
- **Effort:** High (variable-height items with streaming make this complex)

### H7. Renderer types cross-import from `src/main/` — process boundary violation

- **Files:** `src/renderer/types/electron-agent-chat.d.ts`, `electron-foundation.d.ts`, `electron-workspace.d.ts`
- **What:** `.d.ts` files import type from `../../main/agentChat/types` and `../../main/orchestration/types`, creating compile-time dependency from renderer onto main process source.
- **Fix:** Extract shared IPC shape types to `src/shared/types/`. Both main and renderer import from `@shared/*`.
- **Effort:** Medium

### H8. Code signing not configured for macOS or Windows

- **File:** `package.json` lines 171-174
- **What:** `"signingHashAlgorithms": null`, `"sign": null`, `"forceCodeSigning": false`. No macOS identity/entitlements.
- **Impact:** macOS Gatekeeper blocks unsigned apps. Windows SmartScreen warns on every install.
- **Fix:** Obtain certificates, configure in electron-builder and CI secrets.
- **Effort:** High (procurement + CI setup)

### H9. `node-pty` pinned to beta channel (`^1.2.0-beta.11`)

- **File:** `package.json` line 80
- **What:** Beta native addon in a production release. Beta releases can have breaking changes, memory leaks, or Windows-specific PTY regressions.
- **Fix:** Verify if stable `node-pty@^1.1.0` is compatible with Electron 33 and downgrade.
- **Effort:** Small

### H10. Zero IPC handler tests (31 handler files, 0 test files)

- **Files:** All of `src/main/ipc-handlers/`
- **What:** 43+ `ipcMain.handle` registrations with zero test coverage. `pathSecurity.ts` (path traversal prevention) is the highest priority gap.
- **Fix:** Start with `pathSecurity.ts` (pure function, trivially testable), then `gitDiffParser.ts`, `files.ts`, `config.ts`.
- **Effort:** Large (full test suite) / Small (priority security tests only)

### H11. Zero renderer/component tests

- **Files:** All of `src/renderer/`
- **What:** Vitest config uses `environment: 'node'` and `include: 'src/**/*.test.ts'` (no `.tsx`). React component tests are structurally impossible with current config.
- **Fix:** Add jsdom environment, update include pattern to `**/*.test.{ts,tsx}`. Start with store tests (`fileTreeStore.ts`).
- **Effort:** Medium (config) + Large (writing tests)

### H12. Zero e2e tests, no e2e framework installed

- **What:** No Playwright, Spectron, or Electron testing infrastructure. No automated verification the app launches.
- **Fix:** Install `@playwright/test` with Electron fixture. Write smoke test: app launches, main window renders.
- **Effort:** Medium

### H13. `api-contract.md` severely stale — missing 12+ IPC handler domains

- **File:** `docs/api-contract.md`
- **What:** Only documents 6 IPC domain groups. The actual codebase has 18+ including `agentChat:*`, `sessions:*`, `context:*`, `mcp:*`, `git:*`, `lsp:*`, and more.
- **Fix:** Document all handler groups following existing format.
- **Effort:** Medium (4-8 hours)

### H14. `@types/marked@5` incompatible with `marked@17`

- **File:** `package.json`
- **What:** `marked` v17 ships its own types. `@types/marked@5` provides types for a 12-major-version-old API.
- **Fix:** Remove `@types/marked` from devDependencies.
- **Effort:** Trivial

### H15. `streamdown` is in `dependencies` but has zero imports

- **File:** `package.json` line 85
- **What:** Dead dependency. No import or require found in any source file.
- **Fix:** Remove from `dependencies`.
- **Effort:** Trivial

### H16. `@types/express` and `@types/ws` in production `dependencies`

- **File:** `package.json` lines 55-56
- **What:** Type declaration packages should be in devDependencies. They emit no JavaScript.
- **Fix:** Move both to `devDependencies`.
- **Effort:** Trivial

### H17. No `engines` field in `package.json`

- **What:** No declared Node/npm version requirements. Contributors on wrong Node version get cryptic build failures.
- **Fix:** Add `"engines": { "node": ">=20.0.0", "npm": ">=9.0.0" }`.
- **Effort:** Trivial

### H18. No `SIGTERM`/`SIGINT` handlers in main process

- **File:** `src/main/main.ts`
- **What:** On macOS/Linux, `SIGTERM` from Docker/systemd bypasses Electron lifecycle. PTY sessions, DB connections, and file watchers won't be cleaned up.
- **Fix:** Add `process.on('SIGTERM', () => app.quit())` and `process.on('SIGINT', () => app.quit())`.
- **Effort:** Trivial (2 lines)

---

## Medium Priority (significant quality improvement)

### M1. No CHANGELOG

- **Fix:** Create `CHANGELOG.md` following Keep a Changelog format. Document major milestones.
- **Effort:** Low setup, ongoing maintenance

### M2. No CONTRIBUTING.md

- **Fix:** Cover: prerequisites, setup, coding conventions, PR process, "never kill Electron" warning.
- **Effort:** Small (1-2 hours)

### M3. No system theme preference detection

- **File:** `src/renderer/hooks/useTheme.ts`
- **What:** App always opens in saved theme (defaults to dark `modern`). No `matchMedia('(prefers-color-scheme: dark)')` check.
- **Fix:** Auto-select `light` vs `modern` on first launch based on system preference.
- **Effort:** Low

### M4. `data-model.md` stale — AppConfig is a 7-key subset of actual config

- **File:** `docs/data-model.md`
- **Fix:** Update `AppConfig` interface to reflect current `config.ts`. Add new state types.
- **Effort:** Small (2-4 hours)

### M5. `architecture.md` component tree stale

- **File:** `docs/architecture.md`
- **What:** References pre-modernization components (`FileList`, old `AgentMonitorManager`, old Settings structure).
- **Fix:** Update component tree to current structure.
- **Effort:** Small (2-3 hours)

### M6. `ai/deferred.md` referenced but doesn't exist

- **File:** `CLAUDE.md` references it; the file is missing.
- **Fix:** Create the file or remove the reference.
- **Effort:** Trivial

### M7. Duplicate content in subsystem CLAUDE.md files

- **Files:** `src/main/agentChat/CLAUDE.md`, `src/main/orchestration/CLAUDE.md`, `src/renderer/components/FileViewer/CLAUDE.md`, others
- **What:** `<!-- claude-md-auto:start -->` / `<!-- claude-md-manual:preserved -->` markers left duplicate content blocks.
- **Fix:** Strip auto-generated scaffolding blocks, keep manual content.
- **Effort:** Trivial

### M8. `readFileSync`/`writeFileSync` in auth credential path

- **File:** `src/main/orchestration/providers/anthropicAuth.ts:38,48`
- **What:** Credentials read/written synchronously. `readCredentials()` called before every authenticated request.
- **Fix:** Cache in-memory credential object, only hit disk on refresh. Make async.
- **Effort:** Small

### M9. `readFileSync` in web SPA route handler (per-request)

- **File:** `src/main/web/webServer.ts:118`
- **What:** Synchronous HTML read on every SPA route hit for token injection.
- **Fix:** Cache HTML at server startup. Regenerate only when token changes.
- **Effort:** Trivial

### M10. `sleepSync` in approval retry loop blocks main thread

- **File:** `src/main/approvalManager.ts:226-244`
- **What:** `writeResponseWithRetry` calls synchronous `sleepSync(EMFILE_RETRY_DELAY_MS)` on EMFILE errors.
- **Fix:** Convert to async retry with `setTimeout`.
- **Effort:** Small

### M11. Extension/MCP marketplace fetches have no timeout

- **Files:** `src/main/ipc-handlers/extensionStoreMarketplace.ts`, `mcpStoreSupport.ts`
- **What:** `fetch()` calls with no `AbortSignal.timeout()` or offline detection.
- **Fix:** Wrap with timeout (15s) and user-friendly error state.
- **Effort:** Small

### M12. No third-party license attribution

- **What:** No `THIRD_PARTY_LICENSES` file. Distribution of compiled Electron apps requires attribution.
- **Fix:** Use `license-checker` or `generate-license-file` in build pipeline.
- **Effort:** Small

### M13. About dialog uses `alert()` instead of proper dialog

- **File:** `src/renderer/components/Layout/TitleBar.menus.ts:124-130`
- **What:** `alert()` is a blocking native dialog that can't be themed.
- **Fix:** Replace with custom modal component showing version, links, "Open Logs Folder."
- **Effort:** Small

### M14. No remote crash reporting

- **File:** `src/main/main.ts:50-90`
- **What:** Crash logs written to `userData/crashes/*.log` locally. No Sentry or `electron.crashReporter`.
- **Fix:** Add `@sentry/electron` or `electron.crashReporter.start()`.
- **Effort:** Small

### M15. No `aria-live` for streaming chat output

- **File:** `src/renderer/components/AgentChat/AgentChatConversationBody.tsx`
- **What:** Screen readers can't perceive live streaming updates.
- **Fix:** Add `aria-live="polite"` to the streaming message container.
- **Effort:** Trivial

### M16. `electron-updater` loaded twice with independent instances

- **Files:** `src/main/main.ts:40-48`, `src/main/ipc-handlers/miscRegistrars.ts:46-56`
- **What:** Two separate `require()` calls for `electron-updater`. Although both resolve to the same singleton, it's fragile.
- **Fix:** Centralize in `src/main/updater.ts`.
- **Effort:** Low (1 hour)

### M17. CSP `connect-src` allows all localhost in production

- **File:** `src/main/windowManager.ts:300`
- **What:** `http://localhost:*` is broader than needed in production builds.
- **Fix:** Restrict to the specific web server port in production.
- **Effort:** Small

### M18. `tsconfig.node.json` includes `src/renderer/types/**/*`

- **File:** `tsconfig.node.json` line 28
- **What:** Renderer type declarations compiled by the Node config, creating circular reference between compile units.
- **Fix:** Remove from node tsconfig once shared types are moved to `src/shared/`.
- **Effort:** Small (depends on H7)

### M19. `no-console` ESLint rule absent

- **File:** `eslint.config.mjs`
- **What:** 92 `console.log` calls in `src/main/` with no lint gate.
- **Fix:** Add `'no-console': ['warn', { allow: ['warn', 'error'] }]`. Migrate to structured logger (H2).
- **Effort:** Small (rule) + Medium (migration)

### M20. Context layer (`src/main/contextLayer/`) has zero tests — 11 files

- **What:** The AI context enrichment pipeline is entirely untested.
- **Fix:** Start with `importGraphAnalyzer.ts` and `languageStrategies.ts` (pure logic, testable).
- **Effort:** Medium

### M21. Agent chat bridge (`chatOrchestrationBridge*.ts`) has zero tests — 8 files

- **What:** The core streaming bridge — chunk buffering, reconnection, git revert logic — all untested.
- **Fix:** Priority: test the git revert logic (destructive operations).
- **Effort:** Medium

### M22. `React.Suspense fallback={<div />}` — invisible loading state

- **File:** `src/renderer/components/Layout/InnerAppLayout.tsx:197`
- **What:** Empty `<div />` fallback produces jarring layout jump.
- **Fix:** Replace with `<Skeleton />` or sized placeholder.
- **Effort:** Trivial

---

## Low Priority (polish / post-v1.0)

### L1. Temp lint artifacts at repo root not in `.gitignore`

- **Files:** `tmp-lint-parse.js`, `tmp-lint-groups.js`, `lint-output.txt`, `.lint-report.json`
- **Fix:** Add `tmp-*.js`, `lint-output.txt`, `.lint-report.json` to `.gitignore`. Delete the files.
- **Effort:** Trivial

### L2. `version` is `0.1.0` — must bump to `1.0.0` before release

- **Fix:** Update `package.json` version field.
- **Effort:** Trivial

### L3. Copyright year is 2025 in a 2026 codebase

- **Fix:** Update to `2025-2026`.
- **Effort:** Trivial

### L4. No `clean` script in `package.json`

- **Fix:** Add `"clean": "rimraf out dist coverage .vite"`.
- **Effort:** Trivial

### L5. `react`/`react-dom` in devDependencies instead of dependencies

- **Fix:** Move to `dependencies` (semantic correctness).
- **Effort:** Trivial

### L6. `marked` used in 1 file; replaceable with already-installed `react-markdown`

- **File:** `src/renderer/components/Settings/ExtensionStoreSection.tsx`
- **Fix:** Replace with `react-markdown`. Remove `marked` from deps.
- **Effort:** Small

### L7. `src/shared/` contains only 1 file

- **What:** The shared module boundary has minimal content. Shared types live in `src/main/`.
- **Fix:** Migrate IPC shape types to `src/shared/types/` (part of H7 work).
- **Effort:** Medium

### L8. Four "misc" files in `ipc-handlers/` — taxonomy incomplete

- **Files:** `miscRegistrars.ts`, `miscGraphHandlers.ts`, `miscLspHandlers.ts`
- **Fix:** Rename/merge into domain-appropriate handlers.
- **Effort:** Medium

### L9. `webPreloadApis2.ts` overflow naming

- **Fix:** Rename to domain-based names (e.g., `webPreloadApisAgentChat.ts`).
- **Effort:** Trivial

### L10. `configSchema.ts` uses `any` (3 total instances in codebase)

- **Fix:** Type as `Record<string, unknown>` or use `electron-store` generics.
- **Effort:** Small

### L11. No `.env.example` documenting `ANTHROPIC_API_KEY`

- **Fix:** Create `.env.example` with documented env vars.
- **Effort:** Trivial

### L12. `USE_MONACO` is a hardcoded compile-time flag, no runtime escape hatch

- **File:** `src/renderer/components/FileViewer/ContentRouter.tsx:24`
- **Fix:** Expose as user config option or localStorage dev override.
- **Effort:** Low

### L13. Electron version pinned to `^33.2.1` (security-outdated)

- **Fix:** Upgrade to `electron@^34` or `^35`, test for regressions.
- **Effort:** Medium

### L14. `electron-store@8` is CJS in ESM-leaning project

- **Fix:** Plan migration to `electron-store@9+` post-v1.0.
- **Effort:** Medium

### L15. No screenshots or demo assets anywhere in the repo

- **Fix:** Add at minimum one screenshot of main IDE layout to README.
- **Effort:** Small

---

## Detailed Findings by Phase

### Phase 1: Structural Health

#### 1.1 Project Configuration

**package.json scripts:** 18 scripts defined covering dev, build, test, lint, format, typecheck, validate, dist, preview, knip, depcheck, audit. Missing: `clean`, `release`.

**TypeScript:** `strict: true` in both configs. Path aliases clean (`@main/*`, `@preload/*`, `@renderer/*`, `@shared/*`). Two issues: (1) `tsconfig.node.json` includes renderer types creating circular compile reference [M18], (2) `tsconfig.web.json` missing `src/web/` include [C14].

**ESLint:** Flat config (ESLint 9), strict complexity rules (`max-lines-per-function: 40`, `complexity: 10`, `max-lines: 300`, `max-depth: 3`, `max-params: 4`), security plugin on main/preload. Missing `no-console` rule [M19]. `@typescript-eslint/no-explicit-any` at `warn` not `error`.

**.gitignore:** Comprehensive for standard Electron project. Missing: temp lint artifacts [L1].

#### 1.2 Dependency Health

**Lockfile:** `package-lock.json` present, committed, lockfile version 3. Good.

**Issues found:**

- `@types/express`, `@types/ws` in prod deps [H16]
- `react`, `react-dom` in devDeps [L5]
- `@types/marked@5` incompatible with `marked@17` [H14]
- `node-pty` on beta [H9]
- `streamdown` unused [H15]
- `electron-rebuild` undeclared [C2]
- `marked` duplicates `react-markdown` [L6]

#### 1.3 Architecture & File Organization

**Process separation:** Clean. No `ipcMain`/`BrowserWindow` imports in renderer. All 308 renderer IPC calls go through `window.electronAPI.*`. Single cross-process type leak via `.d.ts` imports [H7].

**File organization:** Well-structured feature folders. 84 untracked files [C10]. `src/shared/` underutilized [L7]. Four "misc" handler files [L8]. `webPreloadApis2.ts` overflow naming [L9].

**God files:** No single file exceeds 500 lines. 25+ files exceed 300 lines (ESLint violation) [C9]. The ongoing `.parts.tsx`/`.model.ts`/`.view.tsx` refactoring pattern is effective where applied.

---

### Phase 2: Code Quality

#### 2.1 TypeScript Strictness

- **Type errors:** Zero (`tsc --noEmit` clean)
- **`any` usage:** 3 instances in 3 files — all in infrastructure/glue code, all justified
- **Suppressions:** Zero `@ts-ignore`, zero `@ts-expect-error`. ~70 `eslint-disable-next-line` all with rationale comments (security false-positives)
- **Return types:** Consistently declared on exported functions in key files
- **Central types:** Well-organized: `src/renderer/types/electron.d.ts` for IPC, `src/main/orchestration/types.ts` for domain, `src/main/config.ts` for AppConfig

#### 2.2 Error Handling

- **try/catch coverage:** Substantial in all IPC handlers. Zero `catch(e: any)`. All empty catches are intentional with comments.
- **IPC pattern:** `{ success: true, ...data }` / `{ success: false, error: string }` — consistent across 22 handler files, 102 instances
- **React error boundaries:** Two classes, all major panels wrapped. Missing: top-level boundary [H1]
- **One gap:** `dispatchFileOpenEvent().catch(() => {})` swallows extension errors silently (low severity)

#### 2.3 Logging & Observability

- **268 `console.*` calls** across 93 files — no structured logger [H2]
- **No log levels, no file output, no rotation, no filtering**
- **Sensitive value logged:** Web access token to stdout [C5]
- **One custom logger exists:** `createLogger` in `src/main/codemode/mcpClient.ts` — serves only MCP client

#### 2.4 Security

| Check                              | Status                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| `contextIsolation: true`           | PASS                                                        |
| `nodeIntegration: false`           | PASS                                                        |
| `sandbox: true`                    | PASS (exceeds minimum)                                      |
| `webSecurity: true`                | PASS                                                        |
| Preload minimal/well-scoped        | PASS                                                        |
| `shell.openExternal` URL validated | PASS (protocol check)                                       |
| Hardcoded secrets                  | PASS (none found)                                           |
| Path traversal prevention          | PASS (`assertPathAllowed` consistently applied)             |
| CSP configured                     | PASS (with `unsafe-inline` trade-off, mitigated by sandbox) |
| `eval()`/`innerHTML`               | PASS (none found)                                           |

**Security is the strongest area of the codebase.**

---

### Phase 3: Testing

#### 3.1 Current State

- **Framework:** Vitest 2.1.0, Node environment (no jsdom)
- **Test files:** 15 (all in `src/main/`)
- **Test cases:** ~110-120 leaf tests
- **Coverage thresholds:** 5% (placeholder, not meaningful)
- **Include pattern:** `src/**/*.test.ts` — `.tsx` excluded, making React component tests impossible
- **Renderer tests:** 0
- **E2E tests:** 0
- **CI:** None

#### 3.2 Test Gaps (Priority)

| Area                   | Files | Tests | Gap Rating |
| ---------------------- | ----- | ----- | ---------- |
| IPC handlers           | 31    | 0     | CRITICAL   |
| Renderer components    | 300+  | 0     | CRITICAL   |
| Agent chat bridge      | 8     | 0     | CRITICAL   |
| E2E / app launch       | --    | 0     | CRITICAL   |
| Preload bridge         | 1     | 0     | HIGH       |
| Path security          | 1     | 0     | HIGH       |
| Context layer          | 11    | 0     | HIGH       |
| PTY utilities          | 7     | 0     | HIGH       |
| Hook/approval system   | 3     | 0     | HIGH       |
| Shared pricing utility | 1     | 0     | HIGH       |

---

### Phase 4: UI/UX

#### 4.1 Component Quality

- **87 components over 200 lines**, 25 over 300 lines
- **State management:** Intentional hierarchy (Zustand for FileTree, Contexts for cross-component, useState for local). No conflicting libraries. Zustand isolated to one feature.
- **Accessibility:** Significant gap — 20 files with `<div onClick>` [H5], no `aria-live` for streaming [M15], `ApprovalDialogCard` uses hardcoded hex with no ARIA roles on action buttons
- **Loading states:** Skeleton components exist, 212 loading-state variables across 49 files. Gaps: `React.Suspense fallback={<div />}` [M22], AgentChat no skeleton during thread load
- **Empty states:** `EmptyState.tsx` exists and used in primary views. Gaps: secondary views (SessionReplay, TimeTravel, Analytics)
- **Error states:** Good for crashes (ErrorBoundary), poor for API errors (often just `console.error`)

#### 4.2 Layout

- **Window constraints:** `minWidth: 900`, `minHeight: 600` — appropriate
- **Hardcoded pixels:** 78 occurrences in 30 files, mostly intentional. Notable: `InnerAppLayout` hardcodes panel sizes [M22 context]
- **Overflow handling:** Adequate in lists and layout. One gap: `AgentChatTabBar` hides scrollbar with no visual overflow affordance

#### 4.3 Theme Consistency

- **7 built-in themes** (retro, modern, warp, cursor, kiro, light, high-contrast) + custom
- **No system theme detection** — no `matchMedia` call [M3]
- **Dual CSS variable systems** — 172 files on legacy, 20 on new semantic tokens [H3]
- **116 hardcoded hex colors** in 30 files [H4]
- **Tailwind token system:** Well-structured but not canonical — `var(--success)` used pervasively but not defined in Tailwind config

#### 4.4 Performance

- **Memoization:** Well-used (493 `useMemo`, 1719 `useCallback`)
- **Virtualization:** FileTree has custom virtualization. AgentChat messages NOT virtualized [H6]. CommandPalette results not virtualized.
- **Memory leaks:** Event listener cleanup generally good. All `setInterval`/`setTimeout` have cleanup. IPC preload listeners all return cleanup functions.
- **Re-render risk:** `InnerAppLayout` creates new objects on every render for panel sizes (breaks memo downstream)

---

### Phase 5: Build, Package & Release

#### 5.1 Build Pipeline

- Three-target Vite config (Electron main/preload/renderer + web + web preload) — well-configured
- Bundle analysis via `rollup-plugin-visualizer` gated on `ANALYZE=true`
- Source maps not explicitly configured for production (implicit defaults)
- Monaco CJS/ESM interop handled correctly

#### 5.2 Electron Packaging

- `appId: com.arcflow.ouroboros` — correct reverse-DNS format
- `better-sqlite3` missing from `asarUnpack` [C1]
- Code signing disabled for all platforms [H8]
- macOS/Linux icons missing [C3]
- Auto-updater correctly implemented but repo is placeholder [C12]
- `electron-updater` loaded twice [M16]

#### 5.3 Release Infrastructure

- No CI/CD [C11]
- No CHANGELOG [M1]
- Version `0.1.0` [L2]
- `npm run validate` exists but never enforced automatically

#### 5.4 Environment

- `.env` in `.gitignore` (correct). No `.env.example` [L11]
- `process.env` usage minimal and well-controlled (4 vars)
- `USE_MONACO` is only feature flag — hardcoded, no runtime toggle [L12]

---

### Phase 6: Documentation

#### 6.1 README

- **No root README.md** [C13]
- `docs/guides/complete-beginners-guide.md` exists (26 sections, comprehensive) but buried
- `CLAUDE.md` exists but targets AI agents, not human contributors

#### 6.2 Code Documentation

- Sparse JSDoc — 12 total `@param`/`@returns`/`@throws` tags across entire codebase
- 32 subsystem-level CLAUDE.md files of exceptional quality (architecture, patterns, gotchas, dependencies)
- Duplicate content in several subsystem CLAUDE.md from auto-generation markers [M7]
- No ADR process

#### 6.3 User-Facing Docs

- Keyboard shortcuts discoverable in Settings UI (`KeybindingsSection.tsx`)
- No user-facing config reference
- `docs/web-remote-access.md` — user-facing, current, high quality
- No screenshots [L15]

#### 6.4 Missing Files

| File                               | Present? |
| ---------------------------------- | -------- |
| `README.md`                        | No [C13] |
| `CONTRIBUTING.md`                  | No [M2]  |
| `CHANGELOG.md`                     | No [M1]  |
| `LICENSE`                          | No [C4]  |
| `CODE_OF_CONDUCT.md`               | No       |
| `SECURITY.md`                      | No       |
| `.github/ISSUE_TEMPLATE/`          | No       |
| `.github/PULL_REQUEST_TEMPLATE.md` | No       |

---

### Phase 7: Polish & Nice-to-Haves

#### 7.1 Crash Reporting

- Local crash file logging exists (`userData/crashes/*.log`) via `uncaughtException`/`unhandledRejection` handlers
- No remote crash reporting (Sentry, etc.) [M14]
- Renderer errors captured via `useErrorCapture` hook and forwarded to main process

#### 7.2 Settings UI

- Comprehensive: 16 tabs, full-text search, save/cancel/draft pattern, external-change sync
- No version/about info in Settings panel

#### 7.3 About Dialog

- Implemented as `window.alert()` — blocking, unthemeable [M13]

#### 7.7 Memory Leak Audit

- **All `setInterval` usages confirmed to have cleanup** (14 files checked)
- **All IPC preload listeners return cleanup functions**
- **58+ `addEventListener` files matched by 71 `removeEventListener` files** — cleanups present
- **One concern:** `sleepSync` in approval retry loop blocks main thread [M10]
- **One concern:** Context selection cache never expires (documented as known)

#### 7.8 Graceful Shutdown

- Well-structured two-phase shutdown in `main.ts` (`window-all-closed` for services, `will-quit` for IPC/DB)
- Missing `SIGTERM`/`SIGINT` handlers [H18]

#### 7.9 Offline Resilience

- WebSocket transport has exponential backoff reconnect (correct)
- OAuth token refresh has no timeout [C8]
- Extension/MCP marketplace fetches have no timeout [M11]
- No global offline detection or network status indicator

#### 7.10 Performance Bottlenecks

| Location                                                  | Issue                                                  | Priority      |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| `ideToolServerHandlers.ts:94`                             | `readFileSync` in agent tool handler hot path          | Critical [C7] |
| `claudeStreamJsonRunner.ts:117`, `codexExecRunner.ts:201` | `execSync(taskkill)` blocks 5s on Windows              | Critical [C6] |
| `anthropicAuth.ts:38,48`                                  | `readFileSync`/`writeFileSync` in auth credential path | Medium [M8]   |
| `webServer.ts:118`                                        | `readFileSync` per SPA route hit                       | Medium [M9]   |
| `hookInstaller.ts:34+`                                    | Multiple sync reads at startup (one-shot, acceptable)  | Low           |
| `storage/migrate.ts`                                      | Sync reads during migration (one-time, by design)      | Informational |

---

## Recommended Execution Order

### Sprint 1: Blockers (Days 1-2)

1. **C1** — Add `better-sqlite3` to `asarUnpack` (2 min)
2. **C2** — Add `@electron/rebuild` to devDependencies, fix scripts (15 min)
3. **C3** — Create macOS/Linux icons (30 min)
4. **C4** — Add LICENSE file (5 min)
5. **C5** — Remove token from stdout log (5 min)
6. **C6** — Replace `execSync(taskkill)` with async `exec` (10 min)
7. **C7** — Convert `readFileSync` to async in IDE tool handler (5 min)
8. **C8** — Add timeout to OAuth fetch (5 min)
9. **C12** — Set actual GitHub repo in publish config (2 min)
10. **C14** — Add `src/web/` to tsconfig.web.json (5 min)
11. **H14-H17** — Dependency cleanup (30 min total)
12. **H18** — Add SIGTERM/SIGINT handlers (2 min)
13. **L1-L3** — Gitignore, version bump, copyright (10 min)

### Sprint 2: Quality Gates (Days 3-5)

14. **C11** — Create GitHub Actions CI workflow
15. **C9** — Triage lint violations, split oversized files or adjust thresholds with ratchet plan
16. **C10** — Commit all intended changes
17. **C13** — Write root README.md
18. **H1** — Add top-level error boundary
19. **H2** — Integrate structured logging

### Sprint 3: Test Foundation (Days 6-10)

20. **H10** — Write IPC handler tests (start with `pathSecurity.ts`)
21. **H11** — Configure vitest for React components (jsdom + .tsx)
22. **H12** — Set up Playwright e2e, write smoke test
23. **M20-M21** — Context layer and agent chat bridge tests

### Sprint 4: UI/Theme Cleanup (Days 11-15)

24. **H3** — Unify CSS variable systems
25. **H4** — Replace hardcoded hex colors
26. **H5** — Fix accessibility violations
27. **M3** — Add system theme detection

### Sprint 5: Polish (Days 16-20)

28. **H6** — Virtualize AgentChat message list
29. **H7** — Extract shared types to `src/shared/`
30. **H8** — Configure code signing
31. **M1-M2** — CHANGELOG, CONTRIBUTING.md
32. **H13** — Update api-contract.md
33. Remaining medium/low priority items

---

_This audit was produced by 7 parallel Sonnet subagents coordinated by Opus 4.6. Each phase agent independently explored the codebase without modifying any files. All file paths and line numbers reference the working tree state as of 2026-03-22._
