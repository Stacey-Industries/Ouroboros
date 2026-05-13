# Changelog

All notable changes to Ouroboros / Agent IDE are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]
### Added
- Placeholder entry.

## [2.13.0] - 2026-05-05
### Added
- **Playwright-electron repro harness for autonomous UI bug reproduction (wave 83).** A fresh Claude Code session can now reproduce a UI bug in Agent IDE by copying `e2e/_repro-template.spec.ts` to `e2e/_repro-<slug>.spec.ts`, editing the `AGENT EDIT` block with repro steps, and running `npm run repro -- <slug>`. The driver auto-builds `out/main/index.js` if missing, spawns Playwright with the env-var output-dir contract, reconciles the Playwright trace into the artifacts dir, and writes a machine-readable `summary.json` matching the `ReproSummary` shape. Output lives at `artifacts/repro-<slug>-<ts>/{screenshot-*.png, console.jsonl, trace.zip, summary.json}`. The harness is dev-time only — `app.asar` does not include `e2e/` or `scripts/`.
- **`repro-electron` Playwright project** — disjoint discovery from the existing `electron` project (`testIgnore: ['**/_repro-*.spec.ts']` on `electron`, `testMatch: ['**/_repro-*.spec.ts']` on the new project). `npm run test:e2e` is unaffected by `_repro-*` specs.
- **`e2e/CLAUDE.md`** — agent-author onboarding doc for the harness (≤50 lines): when to use, copy-edit-run loop, `ReproSummary` contract notes (including the bootstrap-log capture timing constraint and the Windows `page.close()` boilerplate), and three gesture-example pointers.

### Path A and Path B dropped (wave 83 discovery)
The original follow-up considered (a) pointing `claude-in-chrome` at the renderer's dev URL and (b) enabling `--remote-debugging-port` on Electron's chromium for CDP attach. Investigation found Path A loses the preload bridge (`window.electronAPI` is undefined in vanilla Chrome — the renderer either crashes or renders a degraded shell) and Path B has no consumer MCP in this environment (`claude-in-chrome` is a Chrome extension, not a remote-CDP client). Path B's enabler change is parked at `roadmap/follow-ups/`.

### Fixed
- **wave-82.1 typecheck drift** (4 files, partial — interleaved with wave 83). `agentChatStore.types.ts` gained `projectRoot` on `AgentChatThreadState` and optional `deleteThread` on `AgentChatActions`; `agentChatSelectors.ts:useAgentChatThread()` now returns `projectRoot`; `ComposerContextPreview.tsx` reads `attachment.base64Data` (not the non-existent `dataUrl`); `StatusBar.tsx` accepts the optional `gitBranch` prop. The remaining ~56 wave-82.1 modified files stay uncommitted, owned by the wave-82.1 surface.

### Changed
- **ESLint coverage**: narrowed `e2e/` blanket ignore to `e2e/**/*.spec.ts` (Playwright specs only); added a `scripts/**/*.mjs` config block declaring Node globals (`process`, `console`, `URL`, etc.). Net effect: −142 lint errors across the project (Node-globals fix). 21 pre-existing rule violations in `src/`, `scripts/`, and `e2e/` fixtures remain — filed at `roadmap/follow-ups/2026-05-05-pre-existing-lint-debt-21-errors.md`.
- **vitest include glob**: added `e2e/**/*.test.ts` and updated `scripts/**/*.test.{ts,mjs}` so the new helper unit tests run.

### Known Issues
- 21 pre-existing lint errors at HEAD (filed as a follow-up) — not introduced by wave 83.
- Wave-82.1's broader chat-only workbench polish remains uncommitted (smoke-pending) — separate scope.

## [2.6.0] - 2026-04-23
### Added
- **Long-lived warm Claude Code process per chat thread** — headless chat now reuses a single `claude -p --input-format stream-json` process across turns instead of spawning fresh each time. Exploits Anthropic's 1-hour prompt-cache TTL for dramatic cost savings on multi-turn threads (verified empirically: turn 2 reads 49k tokens from cache vs. 30k fresh creation on turn 1). Per-thread registry with 55-minute idle-kill, crash recovery via `child.on('exit')`, and `killAllWarm()` wired to app shutdown. New `claudeWarmStreamJsonRunner.ts` + `claudeWarmProcessManager.ts` modules plus 30 new tests.
- **Mid-turn user message injection** — users can now steer an in-progress turn without cancelling it. New `agentChat:injectMidTurn` IPC channel, preload bridge method `electronAPI.agentChat.injectMidTurn(taskId, content)`, and a lightning-bolt icon button in the chat composer visible only during active turns.
- **Claude CLI headless flag passthrough** — `allowedTools`, `disallowedTools`, `appendSystemPrompt`, `addDirs`, `maxBudgetUsd` settings now propagate from `ClaudeCliSettings` into every headless chat turn (previously only honored on the interactive PTY path).
- **OAuth "CLI-only" badge** on the Anthropic auth card in Settings — signals that subscription OAuth tokens can only power CLI-based features, not SDK-backed ones (inline completion, commit-message gen, inline edit).

### Changed
- **New feature defaults** — `useWarmProcess` defaults to `true`. Going forward, new feature flags in `ClaudeCliSettings` / `AgentChatSettings` / `configSchema*.ts` default to `true` unless destructive, security-risky, or experimental.
- **`<ide_context>` gated to the first turn** per thread — eliminates redundant repo/workspace metadata injection on every turn, reducing per-turn input tokens substantially.
- **`systemInstructions` skipped for `claude-code` provider** — Claude Code CLI already has its own system prompt and CLAUDE.md loading; Ouroboros's duplicate injection was ~3k tokens/turn of noise.
- **Slimmer project CLAUDE.md + nested CLAUDE.md audit** — narrative moved to `roadmap/docs/`, generator preambles stripped, size caps enforced. Reduces subagent and file-read context tax (multiplied by every Agent-tool spawn).
- **MEMORY.md dedupe + freshness audit** — removed entries duplicated in CLAUDE.md, pruned stale project state.
- **Duplicate context7 MCP registration removed** from `.claude/settings.json`.

### Fixed
- **Model-change now invalidates Claude CLI `--resume`** — switching Opus ↔ Sonnet mid-thread no longer silently reuses a resume session ID whose cached thinking-block signatures are keyed to the previous model. `resolveResumeInfo` now compares `thread.latestOrchestration.model` vs current, clears `resumeSessionId` on mismatch, and falls through to `buildConversationHistory` (same path cross-provider switch uses).
- **OAuth → SDK client creation locked down** — `createAnthropicClient()` refuses OAuth-type credentials and throws a clear `OAUTH_BANNED_MESSAGE` explaining Anthropic's April 4, 2026 third-party-token enforcement. Affects inline completion / commit gen / inline edit (which now require an API key); CLI-spawn path is unaffected. Removed ~80 lines of now-banned legacy OAuth-fallback code.

### Security
- `anthropicAuth.ts` no longer constructs SDK clients with subscription OAuth tokens — those are server-side blocked by Anthropic and constitute a Consumer TOS violation under the Feb 20, 2026 policy update.

### Known Issues
- 2 pre-existing test failures in `src/renderer/components/Layout/ChatOnlyShell/WorkbenchTimelinePanel.test.tsx` (`useDiffReview must be used within DiffReviewProvider` — test-setup issue predating this release; to be fixed in a follow-up).

## [2.5.0] - 2026-04-22
### Added
- Immersive chat workbench shell with artifact pane, utility drawer, terminal dock, approvals panel, and supporting tests.
- Codex app-server transport scaffold with client, process runner, event mapping, approval bridge, and transport fallback handling.

### Fixed
- Chat composer stop-button anchoring and blocked-edit queuing during active turns.
- Streaming/chat turn rendering so prior assistant replies, user prompts, and context token state remain visible after completion.
- Chat UI cleanup across rerun/model menus, duplicate context indicators, title bar usage surfaces, and notification center behavior.

## [2.4.1] - 2026-04-17
### Added
- Ecosystem moat: system prompt transparency, prompt diff, usage exporter, marketplace, Awesome Ouroboros.

## [2.4.0] - 2026-04-17
### Added
- Multi-provider optionality (Claude, Codex, Gemini).

## [2.3.1] - 2026-04-17
### Added
- Theme import + customization.

## [2.3.0] - 2026-04-17
### Added
- Cross-device session dispatch.

## [2.2.0] - 2026-04-17
### Added
- Capacitor native shell (Android).

## [2.1.1] - 2026-04-17
### Added
- Mobile client-server hardening (pairing, capability gate, streaming resume).

## [2.1.0] - 2026-04-17
### Added
- Mobile-responsive refinement.
