# Wave 50 — Rule Classification Audit

Authored 2026-04-27 as Phase A of Wave 50 (Rule-to-Hook Migration).

## Methodology

Each rule was evaluated against one question: **does this rule change agent behavior in a way that requires judgment, or is it a mechanical constraint that can be enforced deterministically?**

Disposition categories:

- **`keep`** — The rule contains judgment guidance, reference material, or project-specific context that must be in the model's context window to affect behavior. A hook or slash command cannot substitute for it.
- **`hook`** — The rule is a binary constraint (allow/deny a specific file pattern or command shape) that a `PreToolUse` or `PostToolUse` harness hook can enforce at zero token cost and 100% adherence.
- **`slash-command`** — The rule is scenario-specific guidance (e.g., "how to run this task correctly") that should load only when invoked, not on every session. It's too large and too situational to justify persistent context burn.
- **`delete`** — The rule duplicates a global rule or is fully superseded by existing enforcement (pre-commit hook, existing harness hook, etc.).

The bar for `keep` is concrete: "if this weren't in context, the agent would make a different (wrong) decision on a routine task." Anything that passes only on "it might help sometimes" is a candidate for `hook` or `slash-command`.

---

## Summary

| Disposition | Count | Bytes (rules only) |
|---|---|---|
| `keep` | 16 | ~25,213 |
| `hook` | 4 + 1 pending | ~849 + ~350 est. (saved when migrated) |
| `slash-command` | 2 | ~4,610 (saved when migrated) |
| `delete` | 0 | — |

**Total current load:** 33,081 bytes across 23 files.
**Potential savings after B+C:** ~5,809 bytes (~18%, ~1,450 tokens) removed from per-session context once hooks + slash commands are live.

---

## Global rules (~/.claude/rules/)

### `agent-catalog.md`
- **Bytes:** 7,216
- **Enforces:** Custom agent routing table — which agent type to dispatch for which task shape, plus disambiguation logic and the tier discipline.
- **Disposition:** `keep`
- **Reason:** Pure judgment. The catalog only pays off if the routing table is in context — the agent must recognize which task shape applies and pick the right catalog entry. A hook cannot substitute: there is no `PreToolUse` event for agent dispatch, and the routing logic is not binary. At 7,216 bytes this is the single most expensive rule, but the cost is justified: wrong agent dispatch causes cascading cost and quality problems (e.g., using `general-purpose` when `haiku-explorer` suffices, or vice versa). The harness hook at `agent_catalog_enforce.mjs` already denies built-in agent types — that's the `hook` side; this rule is the `keep` side (the routing table and disambiguation guidance).

### `agent-model-selection.md`
- **Bytes:** 415
- **Enforces:** "Use `model: 'sonnet'` for all subagent dispatches; never default to Opus without user authorization."
- **Disposition:** `keep`
- **Reason:** The `agent-catalog.md` harness hook blocks unauthorized agent types, but model selection within a dispatch is a judgment call at invocation time — there is no hook event shape that intercepts per-model overrides on subagent launch in the current harness. At 415 bytes the token cost is negligible. The rule protects against a real failure mode (Opus overkill on every subagent) observed in prior sessions.

### `context7.md`
- **Bytes:** 1,308
- **Enforces:** "Before writing code that touches a library/framework/SDK, use Context7 MCP to fetch current docs — not training-data memory."
- **Disposition:** `keep`
- **Reason:** This is a behavioral trigger fired by the agent's judgment: "am I about to write code touching a library?" No hook can intercept that intent before the Write/Edit happens — by the time a Write fires, the code is already written from stale training data. The rule must be in context to change the approach before code is written. The `research-before-implementing.md` rule is a companion that broadens the trigger; both are needed because they frame slightly different scenarios.

### `debug-before-fix.md`
- **Bytes:** 2,118
- **Enforces:** "After a first failed fix, add debug logging before proposing more code changes. Log at both emission and reception sides. Never propose 3+ fixes based solely on code reading."
- **Disposition:** `keep`
- **Reason:** Pure judgment about debugging discipline. The rule fires when a fix fails — which is only detectable through conversation context, not a file operation the harness can intercept. The proactive logging guidance (areas that warrant baseline debug coverage) actively shapes what code the agent writes — it cannot be moved to a hook. The `multi-process-debugging.md` project rule extends this with project-specific IPC guidance; the global rule handles the general case.

### `frontend-design.md`
- **Bytes:** 1,454
- **Enforces:** "Use design tokens and existing UI primitives; never hardcode hex/rgb values in components."
- **Disposition:** `keep`
- **Reason:** The "no hardcoded hex" enforcement piece is already handled by a pre-commit hook (confirmed in `renderer.md` — "The pre-commit hook will block commits with new hardcoded colors"). That means this rule's enforcement function is already a hook — but the **guidance** (reach for primitives before bespoke markup, extract new primitives on first use, etc.) requires judgment and must be in context. The token table guidance is covered more concretely in the project-level `renderer.md`. **Flag:** there is meaningful content overlap with the project `renderer.md` rule (color/token guidance). The project rule is more specific and authoritative for this codebase; the global rule provides the general principle. Both are worth keeping, but Phase E should consider whether the global rule's color section can be trimmed given `renderer.md` covers it with project-specific tokens.

### `graph-tool-routing.md`
- **Bytes:** 2,572
- **Enforces:** Two concerns: (1) routing table — when to use graph tools vs. Grep/Read by task shape; (2) "don't use Grep/Read for symbol queries" — enforcement piece.
- **Disposition:** `keep` (routing table) + `hook` (enforcement piece — **pending Phase D decision**)
- **If hook:** event = `PreToolUse`; check = Grep/Read call where pattern is a bare symbol identifier (not a string literal, not a file path glob). Phase D's adherence analyzer will determine whether this enforcement should ship and at what severity.
- **Reason (keep):** The routing table requires judgment — recognizing whether a task has a "clear return shape" or is "open-ended" is not mechanically detectable. The project-specific context (Agent IDE: ~1.4K nodes, ~2.3K edges — queries cheap) is also worth having in context. **Reason (hook-pending):** The "don't Grep for symbol queries" piece is binary in principle, but requires reliable shape classification to avoid false positives. Phase D builds the classifier and evaluates adherence. If adherence is ≥70%, enforcement stays log-only; below that, it graduates to warn or block. Do not pre-empt the Phase D decision.

### `init-safety.md`
- **Bytes:** 2,227
- **Enforces:** Pre-flight checks before running `/init` or creating a `CLAUDE.md` — directory type verification, backup-before-overwrite, stale-artifact detection.
- **Disposition:** `slash-command`
- **If slash-command:** name = `/init-safety`; invoked when = the user asks the agent to initialize, create, or scaffold a `CLAUDE.md`, or when the `/init` slash command is being run.
- **Reason:** This rule is highly specific to one scenario (CLAUDE.md authoring) that happens rarely. Paying 2,227 bytes per session to guard a task that occurs once per project initialization is a poor token trade. As a slash command, the agent loads the rule precisely when needed. The pre-classified baseline agrees; this audit confirms.

### `lockfiles.md`
- **Bytes:** 300
- **Enforces:** "Never manually edit lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`); use the package manager instead."
- **Disposition:** `hook`
- **If hook:** event = `PreToolUse` on `Edit` or `Write`; check = `path` matches `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`. Emit deny with message: "refusing to edit lockfile — regenerate with `npm install` / `pnpm install` / `yarn` instead."
- **Reason:** The rule is a binary constraint with zero judgment content. The file names are fixed; the action is always deny. Pre-classified baseline agrees.

### `manual-smoke-gate.md`
- **Bytes:** 2,319
- **Enforces:** "UI-bearing waves must include a signed manual smoke checklist in the result brief before push."
- **Disposition:** `keep`
- **Reason:** This is a process gate requiring judgment: recognizing whether a wave is "UI-bearing" (touches `src/renderer/components/Layout/**`) and whether a smoke checklist has been signed. Neither is mechanically checkable by a `PreToolUse` hook — the gate fires at wave close, not at individual file operations. The rule is also used as a reference during result-brief authoring. At 2,319 bytes it's expensive, but the failure mode it prevents (shipping invisible defects with green CI) is high-cost. The checklist template is genuinely needed in context to be completed correctly.

### `no-minified.md`
- **Bytes:** 253
- **Enforces:** "Don't read, edit, or analyze `*.min.js` / `*.min.css` files — find the source instead."
- **Disposition:** `hook`
- **If hook:** event = `PreToolUse` on `Read`, `Edit`, or `Write`; check = `path` matches `*.min.js`, `*.min.css`, or `*.min.mjs`. Emit deny with message: "refusing to read/edit minified output — find the source file instead."
- **Reason:** Binary constraint, zero judgment, fixed file patterns. Pre-classified baseline agrees.

### `no-secrets.md`
- **Bytes:** 296
- **Enforces:** "Don't log, print, echo, or commit `.env*` values; don't modify `.env*` files without explicit instruction."
- **Disposition:** `hook`
- **If hook:** event = `PreToolUse` on `Write` or `Edit`; check = `path` matches `.env*` but NOT `.env.sample`, `.env.example`, or `.env.template`. Emit deny with message: "refusing to write to secret file — ask the user to populate manually."
- **Reason:** Binary constraint. The only judgment piece is the allowlist for `.env.sample`/`.env.example`/`.env.template`, which is encodable in the hook. Pre-classified baseline agrees.

### `project-claude-md-template.md`
- **Bytes:** 2,383
- **Enforces:** Required sections and style for a project's top-level `CLAUDE.md` (title, commands, key files, folder map, gotchas, tech debt, style guidance).
- **Disposition:** `slash-command`
- **If slash-command:** name = `/claudemd`; invoked when = the agent is creating or editing a project's top-level `CLAUDE.md`.
- **Reason:** Template guidance for a rare operation. Identical reasoning to `init-safety.md` — per-session cost is not justified for a once-per-project task. Pre-classified baseline agrees.

### `research-before-implementing.md`
- **Bytes:** 1,743
- **Enforces:** "Before writing code that imports a library or touches version-sensitive API surface, run Context7 research first — not training data."
- **Disposition:** `keep`
- **Reason:** This rule fires before code is written, making it a judgment trigger that cannot be hooked. It complements `context7.md`: `context7.md` tells the agent how to use the tool; this rule tells it when to use it. The "skip research when" list actively shapes what the agent does before writing — both the positive and negative cases require reasoning that must happen before a `Write` event fires. Removing it would regress to "agent codes from training data for version-sensitive work," which is the explicit failure mode the rule was authored to prevent.

### `test-scope.md`
- **Bytes:** 1,021
- **Enforces:** Two concerns: (1) "Run only touched tests during implementation, not the full suite" — includes specific vitest invocation pattern; (2) judgment about when full-suite runs are appropriate.
- **Disposition:** `hook` (the "don't run bare `npm test`" piece) + `keep` (the judgment about when full-suite runs are appropriate)
- **If hook:** event = `PreToolUse` on `Bash`; check = command matches `npm test`, `npm run test`, `npx vitest run`, or `npx jest` without trailing path arguments. Emit warning (not deny): "running full test suite during implementation — prefer `npx vitest run <path>` for scoped runs."
- **Reason (hook):** The "don't run bare npm test" constraint is binary and detectable from the Bash command string. Pre-classified baseline agrees with `hook`. **Reason (keep):** The rule also covers "when full-suite runs are appropriate" (pre-commit, wave final phase, explicit user request) and the subagent guidance ("skip full suite; parent runs it"). These judgment pieces cannot be encoded in a hook and must remain in context. The rule should be trimmed of its hookable piece after Phase B ships, but the judgment section stays.

---

## Project rules (.claude/rules/)

### `config-files.md`
- **Bytes:** 467
- **Enforces:** Build config constraints specific to this project — three-target impact, Monaco CJS/ESM interop, `optimizeDeps.force: true` preservation, HMR watcher exclusions.
- **Disposition:** `keep`
- **Reason:** Highly project-specific facts that an agent cannot derive from code inspection without touching the wrong thing. "Changes to build config affect all three targets" is an architectural fact that must be in context before the agent edits any `*.config.*` file. The Monaco plugin quirk and `optimizeDeps.force` note have no global equivalent — removing them would cause silent regressions the next time a config file is edited. At 467 bytes, the cost is low.

### `eslint-awareness.md`
- **Bytes:** 1,358
- **Enforces:** ESLint constraints that apply to every `src/**/*.{ts,tsx}` file — function-length limits, complexity, depth, param count, no-console, import sort, security rules in main/preload.
- **Disposition:** `keep`
- **Reason:** This is proactive guidance that prevents the PostToolUse ESLint hook from firing. If the numbers aren't in context before the agent writes code, the agent writes code that triggers lint errors, requiring additional fix cycles. The rule's own note says it's proactive — it reduces the edit→lint→fix loop. A hook alone (PostToolUse lint check) is reactive and costs an extra round trip per violation. The numbers are terse and stable; 1,358 bytes pays for preventing multiple failed edit cycles per session.

### `ipc-contract.md`
- **Bytes:** 441
- **Enforces:** `electron.d.ts` is the single source of truth for IPC shapes; changes cascade to preload, main, and all renderer consumers; channel naming convention; must run `tsc --noEmit` after edits.
- **Disposition:** `keep`
- **Reason:** This rule prevents a common failure mode in three-process architectures: updating the type contract without updating all callers. The cascade reminder ("changes here flow to preload + main + all renderer consumers") and the `tsc --noEmit` requirement are procedural facts that the agent must know before touching `electron.d.ts`. A hook cannot enforce "update all callers" — that's judgment. At 441 bytes, cost is negligible.

### `main-process.md`
- **Bytes:** 396
- **Enforces:** "Node.js only — no renderer imports; use `ipcMain.handle` for request/response; externalize native deps; security rules apply; never use eval/new Function/dynamic require."
- **Disposition:** `keep`
- **Reason:** Several of these are hookable in principle (e.g., "no import from `@renderer/*`" could be a PostToolUse lint rule), but they are already enforced by the ESLint security rules and the existing PostToolUse hook. The value of `main-process.md` is the architectural reminder — "use `ipcMain.handle` for request/response, `webContents.send` for push" shapes how the agent structures new IPC rather than just blocking bad code after writing. At 396 bytes, cost is trivial.

### `multi-process-debugging.md`
- **Bytes:** 995
- **Enforces:** Project-specific debugging discipline for the three-channel event system — log first, log both sides, never assume session IDs are the same, account for the terminal session.
- **Disposition:** `keep`
- **Reason:** This extends the global `debug-before-fix.md` with project-specific facts that are genuinely not discoverable from code reading alone: that `$CLAUDE_SESSION_ID`, `stream-json session_id`, and `agent hook session_id` are three different values; that the IDE runs inside itself so the terminal session always emits hook events. These facts change what the agent does when debugging event-flow issues — they cannot be recovered by code inspection. **Note:** there is intentional overlap with the global `debug-before-fix.md` (the "log first" principle). The project rule is additive, not duplicative — it assumes the global rule's general discipline and adds project-specific IDs and topology. Both should stay.

### `preload.md`
- **Bytes:** 315
- **Enforces:** "Minimal surface area; no business logic in preload; type definitions must match `electron.d.ts`; never expose raw `ipcRenderer`."
- **Disposition:** `keep`
- **Reason:** These are architectural constraints that shape what the agent writes in `src/preload/`. The "never expose raw `ipcRenderer`" rule is a security constraint that a hook cannot enforce (the violation would be in the code the agent writes, not a file-system operation). The `ipc-contract.md` rule covers the type-match requirement from the other direction. At 315 bytes, cost is minimal and the constraints are load-bearing for the security model.

### `renderer.md`
- **Bytes:** 2,484
- **Enforces:** Two concerns: (1) "Browser environment only — no Node.js APIs, no require, no fs, no path; use `window.electronAPI`; don't mix IPC systems"; (2) the full color/token reference table for this project's design token system.
- **Disposition:** `keep`
- **Reason:** The browser-environment constraint and IPC-system separation are facts that must be in context before the agent writes renderer code — violating them produces runtime errors, not lint errors. The token table (16+ rows) is genuinely needed every time a renderer component is written or edited; without it, agents reach for hardcoded values or fabricated tokens (the exact failure mode that caused the Wave 47 / Wave 58 regression). **Note on overlap with global `frontend-design.md`:** the global rule provides the general principle ("use design tokens, not hardcoded values"); the project rule provides the actual token names for this codebase. Both are needed. **Note on pre-commit hook:** "The pre-commit hook will block commits with new hardcoded colors" — this means the enforcement piece is already a hook; the token table here is reference material, not enforcement, which is why `delete` is wrong for this rule. At 2,484 bytes it's the most expensive project rule, but the token table eliminates the most common category of renderer defects.

### `terminal.md`
- **Bytes:** 596
- **Enforces:** xterm-specific gotchas — use `@xterm/xterm` not `xterm`; double-rAF before `fit()`; `isReadyRef` guard; block OSC 10/11/12; load WebGL BEFORE `term.open()`.
- **Disposition:** `keep`
- **Reason:** These are bug-traps specific to the xterm/WebGL integration that an agent cannot derive from API docs or code inspection. The package name confusion (`@xterm/xterm` vs `xterm`) would cause a silent wrong dependency. The WebGL load-order constraint ("must load BEFORE `term.open()`") causes a DOM + WebGL cursor overlap that is visually subtle and hard to diagnose. These facts must be in context when any agent touches Terminal code. At 596 bytes, cost is low.

### `test-files.md`
- **Bytes:** 404
- **Enforces:** "Use vitest (not jest, not mocha); `describe`/`it`/`expect`; relaxed lint rules in test files; test behavior not implementation; prefer integration tests; colocate."
- **Disposition:** `keep`
- **Reason:** The framework identity (vitest vs. jest vs. mocha) must be in context before the agent writes any test — agents default to jest syntax without this rule. The relaxed lint rules (max-lines and max-lines-per-function are OFF for test files) are project-specific exemptions that the agent won't discover from ESLint output until after a failed lint run. The "test behavior, not implementation" and colocate conventions shape test authorship quality. **Note on overlap with global `test-scope.md`:** `test-scope.md` covers when to run tests; `test-files.md` covers how to write them. Complementary, not duplicative.

---

## Pre-classified baseline (already in plan)

The plan pre-classified six rules. This audit confirms all six:

| Rule | Pre-classified as | Audit verdict | Notes |
|---|---|---|---|
| `no-secrets.md` | `hook` | **Confirmed** | Binary constraint on `.env*` writes; allowlist for `.env.sample` / `.env.example` / `.env.template` is encodable. |
| `lockfiles.md` | `hook` | **Confirmed** | Fixed file names, always deny. |
| `no-minified.md` | `hook` | **Confirmed** | Fixed file patterns, always deny. |
| `test-scope.md` | `hook` (partial) | **Confirmed with nuance** | The bare-`npm test` warn is hookable. The judgment content (when full-suite runs are appropriate, subagent policy) must remain in context after Phase B ships. The rule file should be trimmed to judgment-only content post-Phase B rather than deleted. |
| `init-safety.md` | `slash-command` | **Confirmed** | Rare scenario; 2,227 bytes unwarranted per-session. |
| `project-claude-md-template.md` | `slash-command` | **Confirmed** | Rare scenario; 2,383 bytes unwarranted per-session. |

No disagreements with the baseline.

---

## Recommendations

### 1. `test-scope.md` — trim after Phase B, don't delete

After Phase B ships the `warnFullTestSuite` hook, the rule's hookable piece ("run `npx vitest run <path>`" / "don't run bare npm test during implementation") is covered. The remaining judgment content is worth keeping. Recommendation: Phase E trims `test-scope.md` to remove the hookable section, leaving only the "when full-suite runs are appropriate" and subagent guidance. This reduces the rule from 1,021 bytes to approximately 400 bytes.

### 2. `frontend-design.md` — review for trimming after Phase E

The global `frontend-design.md` and project `renderer.md` have overlapping color/token guidance. The global rule covers the general principle; the project rule covers the specific token names. After this wave stabilizes, consider trimming the global rule's color section (the "never hardcode hex" enforcement note, the allowed-exceptions list) since both are covered more concretely in `renderer.md` and the pre-commit hook. Savings: ~400 bytes from the global rule.

### 3. `graph-tool-routing.md` — do not pre-empt Phase D

The routing table is clearly `keep`. The enforcement piece (hook on symbol-shaped Grep/Read calls) is correctly marked as Phase D pending. The wave plan's threshold logic (≥70% adherence → log-only; 40–70% → optional warn; <40% → block) is the right gate. This audit does not change the Phase D decision.

### 4. `agent-catalog.md` is the most expensive rule at 7,216 bytes — no alternative

At 7,216 bytes, `agent-catalog.md` is 22% of the total global rule load. There is no mechanism in the current harness to move catalog routing to a hook — agent dispatch events don't flow through `PreToolUse`. The harness hook at `agent_catalog_enforce.mjs` already enforces the deny side (built-in agents are blocked); the routing table must remain in context for the allow side (pick the right catalog agent). If token budget becomes critical in a future wave, the only option is trimming the rule's content — the disambiguation section and collision notes could be condensed without losing routing accuracy.

### 5. `renderer.md` — the token table is project-specific load worth carrying

At 2,484 bytes, `renderer.md` is the most expensive project rule. The token table accounts for the majority of that. This cost is justified — the Wave 47/58 regression trace directly to agents not having the token table in context. The only alternative would be a linting rule that catches fabricated token names at PostToolUse time, which would require maintaining an allowlist of valid tokens in the ESLint config. That's plausibly worth doing in a future wave (it would let the table be trimmed), but it's out of scope for Wave 50.

### 6. No `delete` candidates in this audit

No rule among the 23 is a pure duplicate suitable for deletion. All 9 project rules are additive: they either add project-specific facts absent from global rules (`terminal.md`, `config-files.md`, `ipc-contract.md`, `preload.md`, `main-process.md`), extend a global principle with project-specific context (`multi-process-debugging.md` extends `debug-before-fix.md`; `renderer.md` extends `frontend-design.md`; `test-files.md` extends `test-scope.md`), or provide proactive lint-number lookup that prevents reactive hook cycles (`eslint-awareness.md`).

---

## Corrected summary

| Disposition | Count | Rules |
|---|---|---|
| `keep` | 16 | `agent-catalog`, `agent-model-selection`, `context7`, `debug-before-fix`, `frontend-design`, `graph-tool-routing` (routing table), `manual-smoke-gate`, `research-before-implementing`, `test-scope` (judgment section); all 9 project rules |
| `hook` | 4 + 1 pending | `no-secrets`, `lockfiles`, `no-minified`, `test-scope` (warn piece); `graph-tool-routing` enforcement piece (Phase D) |
| `slash-command` | 2 | `init-safety`, `project-claude-md-template` |
| `delete` | 0 | None — no rule is a pure duplicate |

**Bytes moved out of per-session context after Phase B + C:**

| Hook/Slash | Bytes |
|---|---|
| `no-secrets.md` → hook | 296 |
| `lockfiles.md` → hook | 300 |
| `no-minified.md` → hook | 253 |
| `test-scope.md` warn piece → hook (remainder stays) | ~350 est. |
| `init-safety.md` → slash-command | 2,227 |
| `project-claude-md-template.md` → slash-command | 2,383 |
| **Total** | **~5,809 bytes** |

This represents ~18% of current total rule load (33,081 bytes). The token equivalent is approximately 1,450 tokens saved per session.
