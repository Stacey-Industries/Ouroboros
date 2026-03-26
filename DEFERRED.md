# Ouroboros — Deferred Items (v2+)

Items intentionally excluded from v1 to reduce scope. Revisit after v1 ships.

## Deferred from Original Spec

### File Editing
- **What**: In-app code editing (currently read-only viewer)
- **Why deferred**: Adds significant complexity (dirty state, save handling, conflict resolution). The agent does the editing — users just need visibility.
- **Revisit when**: Users request inline edits for quick fixes

### Git Integration
- **What**: Branch switching, commit history, diff viewer, status indicators
- **Why deferred**: Users have their own Git tooling. Adding a partial Git UI risks being worse than existing tools.
- **Revisit when**: v2 — could add git status badges to file list

### Multi-Machine / Remote Sessions
- **What**: Connecting to Claude Code running on a remote server
- **Why deferred**: Requires SSH tunneling, auth, reconnection logic. Major scope increase.
- **Revisit when**: Users need to monitor cloud-hosted agent sessions

### Auth / API Key Management
- **What**: Managing Anthropic API keys, Stripe keys, etc. from the app
- **Why deferred**: Security-sensitive. Users manage keys via CLI or env files today.
- **Revisit when**: Never (likely) — this belongs in the CLI or dashboard, not a launcher

---

## Deferred from Review (Pre-Build)

### Full Recursive File Tree
- **What**: Collapsible directory tree with lazy loading, .gitignore filtering
- **Why deferred**: Replaced with filtered file list (Ctrl+P style) for v1. Full tree is complex with large repos (10K+ files need virtualization).
- **Shipped instead**: Flat filtered file list with fuzzy search
- **Revisit when**: v2 — if users miss hierarchical browsing

### Right-Click Context Menus
- **What**: "Open in terminal", "Copy path" on file list items
- **Why deferred**: Low-value convenience feature. Users can copy paths from breadcrumbs.
- **Revisit when**: v2 polish pass

### Session History / Analytics
- **What**: Persisting session logs (project, duration, exit code) to SQLite
- **Why deferred**: Nice-to-have. Recent projects list covers the core need.
- **Revisit when**: v2 — useful for "time spent per project" insights

### Hook Payload Sanitization (DOMPurify)
- **What**: Sanitizing tool call data before rendering in agent monitor
- **Status**: Partially addressed — using React's built-in XSS protection (no dangerouslySetInnerHTML). Full DOMPurify integration deferred.
- **Revisit when**: If rendering raw HTML content from tool calls

---

## Prioritized Backlog (Post-v1)

1. Full file tree with virtualization
2. Session history + SQLite storage
3. Git status indicators on file list
4. Right-click context menus
5. Split terminal (horizontal/vertical)
6. Plugin system for custom panels
7. Remote session support

---

## Deferred from v1.2 — Rules, Skills & Hooks Roadmap

Features discussed during v1.2 development (rules/skills/hooks system). Scoped out for future releases. Ordered by impact.

### Rules Enhancements

**Windsurf-style trigger modes**
Currently rules (CLAUDE.md/AGENTS.md) are always injected from repo root. Windsurf supports 4 trigger modes: `always_on`, `glob`, `model_decision`, `manual`. Cursor uses a `fetch_rules()` tool the LLM calls on demand.

- Support `.ouroboros/rules/*.md` with YAML frontmatter trigger modes
- `glob` — only inject when matched files are in context (e.g., `globs: ["src/api/**"]`)
- `manual` — only inject when user @mentions the rule by name
- `model_decision` — LLM sees rule name/description, decides whether to fetch full content
- **Why deferred**: Always-inject covers 90% of cases. Trigger modes matter at 10+ rule files.
- **Recommended for v1.3**: Start with `always_on` + `manual` only. Skip `glob` and `model_decision`.

**Cursor-style fetch_rules() tool**
Register a tool the model calls on demand to fetch rules by name. Most token-efficient — only relevant rules consume context.
- **Why deferred**: Requires tool registration in the provider layer. Claude Code CLI and Codex CLI manage their own tool sets.

**Subdirectory rules**
Support CLAUDE.md in subdirectories (e.g., `src/api/CLAUDE.md`) that auto-scope to that directory. Windsurf does this with AGENTS.md.
- **Why deferred**: Token budget concern. Each additional file eats context. Root-only keeps it predictable.

**`.ouroboros/rules/` directory support**
Concat multiple rule files from `.ouroboros/rules/*.md` alongside root CLAUDE.md/AGENTS.md. Always-on, no trigger modes. Lets users split rules into focused files (`rules/testing.md`, `rules/api.md`).
- **Why deferred**: Low effort but decided to ship root-only first and validate the pattern.

### Skills / Workflows Enhancements

**Dynamic context injection (`` !`command` `` syntax)**
Claude Code skills support shell command execution in SKILL.md — runs at expansion time, inlines output. Example: `` !`gh pr diff` `` injects current PR diff.
- Parse `` !`...` `` blocks, execute via `child_process.exec` (5s timeout), replace with stdout
- **Why deferred**: Security implications — shell execution during skill expansion needs sandboxing.

**Skill subagent isolation (`context: fork`)**
Run skill in an isolated subagent with its own context window. Prevents skill execution from polluting main conversation.
- **Why deferred**: Orchestration layer doesn't support mid-conversation forking.

**Skill argument UI (mini-form)**
For skills with required parameters, show labeled input fields instead of requiring inline `/skill-name arg1 arg2`. Windsurf workflows have this.
- **Why deferred**: UI complexity. Positional arg parsing works for simple cases.

**Workflow chaining**
Skills can invoke other skills mid-execution. `/deploy-staging` could call `/run-tests` as a step.
- **Why deferred**: Requires execution-time skill resolution, not just expansion-time.

### Hooks & Policies

**Codex exec policy management**
Codex uses `~/.codex/config.toml` + CLI flags (`--sandbox`, `--ask-for-approval`) — completely different from Claude Code hooks.
- Read/write `~/.codex/config.toml` permissions section
- Map approval policies (`untrusted`, `on-request`, `never`) to UI toggles
- Map sandbox modes (`read-only`, `workspace-write`, `danger-full-access`) to UI
- **Why deferred**: Requires TOML parser + understanding Codex permission model. Claude-only hooks cover primary use case.

**Hook type expansion (http, prompt, agent)**
Our UI only manages `command` hooks. Claude Code supports `http` (webhook), `prompt` (single-turn LLM evaluation), and `agent` (multi-turn verification).
- **Why deferred**: Command hooks cover the vast majority of use cases.

**Per-skill hooks**
Skills can define hooks in YAML frontmatter that only fire while the skill is active. Scopes PreToolUse validation to a specific workflow.
- **Why deferred**: Requires skill lifecycle tracking in the hooks pipeline.

### UI Enhancements

**Rules activity indicator**
Show badge/icon in composer or header indicating which rules and skills are active for the current message.

**Inline rule preview**
Hover tooltip in Rules & Skills panel showing first few lines without opening the full editor.

**Skill execution history**
Track which skills were invoked, when, and what they expanded to. Show in thread details drawer alongside token usage.

---

## Deferred from v1.0 (Consolidated)

Items originally tracked in `ai/deferred.md`. Virtualization (H6) was implemented via `@tanstack/react-virtual` in `useVirtualScroll.ts` and is no longer deferred.

### Code Signing — macOS & Windows (H8)
- **What**: Sign and notarize Electron builds for distribution
- **Status**: Not started. `package.json` has `sign: null`, `forceCodeSigning: false`, no certs configured.
- **Why deferred**: Requires certificate procurement (Apple Developer Program, Windows EV cert)
- **Revisit when**: Preparing for public distribution or auto-update

### Structured Logging Migration (H2)
- **What**: Migrate remaining `console.log/error/warn` calls to `electron-log` structured logger
- **Status**: ~87% complete. Logger infrastructure in `src/main/logger.ts` is solid (electron-log with file transport, async writes). ~36 direct console calls remain across the codebase.
- **Revisit when**: Next cleanup pass

### CSS Variable Unification (Remaining)
- **What**: Replace remaining hardcoded rgba values with CSS custom properties
- **Status**: ~95% complete. Three-tier design token system (primitives → semantic → component) is fully built in `tokens.css` + `tailwind.config.ts`. ~36 hardcoded `rgba()` values remain in AgentChat diff/plan/tool-card components (success green, error red backgrounds). Should migrate to `--status-success-bg` and `--status-error-bg` tokens.
- **Revisit when**: Next AgentChat component cleanup

---

## Deferred from Orchestration Layer

### XML Formatting in `buildSystemPrompt`
- **File**: `src/main/orchestration/providers/anthropicApiAdapter.ts`
- **What**: Switch system prompt context sections from markdown-style `--- Header ---` delimiters to XML tags (`<codebase_structure>`, `<module_context>`, `<context_files>`). Anthropic's prompting research recommends XML for structured data — Claude's attention mechanism responds more reliably to `<tag>` boundaries.
- **Status**: Not started. `appendInstructionBlock()` still uses `--- Header ---` format.
- **Note**: `claudeCodeAdapter.ts` formats context differently and should NOT be changed — each adapter is intentionally independent.
- **Revisit when**: Next context quality improvement pass

---

## Deferred — Chat Queue Steering

### Claude Code: Cancel + Resume Steering
- **What**: Cursor-style mid-execution message injection. When user queues a message while the agent is working, inject it at the next tool-call boundary via cancel + `--resume <sessionId>` instead of waiting for full completion.
- **Why**: Claude Code CLI doesn't expose a structured protocol for mid-turn injection (unlike Codex's `turn/steer`). Cancel+resume is the only workaround.
- **Expected latency**: 2-5 seconds per steer (process kill + re-spawn + context reload)
- **Approach**: New `steerThread` IPC channel. Main process sets `pendingSteer` on `ActiveStreamContext`, detects tool boundary in `handleToolBlock`, cancels process, suppresses idle flash in `handleCancelledProgress`, resumes via existing `sendMessageWithBridge` + `resolveResumeInfo` flow.
- **Key files**: `chatOrchestrationBridgeSteering.ts` (new), `chatOrchestrationBridgeProgress.ts`, `chatOrchestrationBridge.ts`, `useAgentChatWorkspaceHooks.ts`
- **Full spec**: `.claude/plans/adaptive-mixing-umbrella.md`

### Codex: App Server Mode (`turn/steer`)
- **What**: Switch from `codex exec` (one-shot) to `codex --app-server` (persistent JSON-RPC session). Use `turn/steer` for zero-latency mid-execution injection, `turn/interrupt` for cancellation.
- **Why**: `--app-server` is the officially supported IDE integration mode. OpenAI's own VS Code extension uses it. Much higher quality than cancel+resume — native protocol, no process restart, no context reload.
- **Approach**: Rewrite `codexAdapter.ts` + `codexExecRunner.ts` to maintain a persistent JSON-RPC process over stdio. Map `turn/start`, `turn/steer`, `turn/interrupt` to the existing chat queue system.
- **Prerequisite**: Ship Claude Code steering first (Path A), then Codex app-server (Path B)
- **Not rule-breaking**: `codex --app-server` is a CLI mode, not a direct API call. Same auth, same rate limits, same sandbox as `codex exec`.
