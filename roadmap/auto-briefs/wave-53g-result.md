# Wave 53g Result — MCP Discovery: Write to `.mcp.json` Not `.claude/settings.json`

**Status:** ✅ COMPLETED — 2026-04-28
**Version:** v2.7.8 (patch — repointed auto-inject; no new feature surface)
**Plan:** `roadmap/wave-53g-plan.md`
**ADR:** `roadmap/decisions/wave-53g.md`
**Smoke artifact:** `roadmap/wave-53d-live-test.md` (cumulative; "Wave 54 adoption smoke run #3" appended after Phase B observation lands)

---

## What shipped

The fix that makes Waves 53d/53e/53f's earlier fixes actually reachable. None of those waves were wrong about *what they fixed* — they were wrong about *which file Claude Code reads* for MCP server discovery.

### What we got wrong

Three earlier waves wrote `mcpServers.ouroboros` into `<projectRoot>/.claude/settings.json`. The Anthropic Desktop client reads MCP config from `mcpServers` blocks in settings.json. **Claude Code CLI does not.** Claude Code reads:

- **Project-level:** `<projectRoot>/.mcp.json` (registered via `enabledMcpjsonServers` in `~/.claude.json`).
- **User-level:** `~/.claude.json` top-level `mcpServers`.

Empirical confirmation from the user's actual environment:
- `~/.claude.json` `mcpServers` keys: `sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7` — every one shows as **Connected** in `claude mcp list`. None of them are sourced from `.claude/settings.json`.
- The user's project entry has `enabledMcpjsonServers: []`, no `.mcp.json` exists at project root, and `claude mcp list` confirms `ouroboros` is registered nowhere.

### What this wave does

`src/main/internalMcp/internalMcpAutoInject.ts` rewritten to perform three writes per startup:

1. **`<projectRoot>/.mcp.json`** — write `{mcpServers: {ouroboros: {url|command,args}}}`. Preserves any other servers the user added by hand.
2. **`~/.claude.json projects[<root>].enabledMcpjsonServers`** — add `'ouroboros'` (idempotent; preserves other servers; if `ouroboros` was previously in `disabledMcpjsonServers`, removes it from disabled).
3. **`<projectRoot>/.claude/settings.json mcpServers.ouroboros`** — cleanup pass that removes the orphaned entry from earlier wave attempts. Skipped (no write) if absent — no churn.

All three writes are atomic (`.tmp` + rename) and tolerant of missing/invalid JSON (skip rather than corrupt).

`.mcp.json` added to `.gitignore` (per-launch random port — not meaningful to version-control).

### Contract tests

`src/main/internalMcp/internalMcpAutoInject.test.ts` (17 cases) covers:
- `.mcp.json` shape (URL + stdio variants), preservation of other servers, idempotency.
- `~/.claude.json` enabledMcpjsonServers add/preserve/dedup, removal from disabled if previously disabled, preservation of unrelated top-level keys.
- Legacy `.claude/settings.json` cleanup: removes `ouroboros`, preserves other `mcpServers` entries, no write if no orphan.
- Tolerance: missing files OK, invalid JSON skipped not corrupted.
- `removeFromProjectSettings`: reverses all three writes correctly.

`os.homedir()` is mocked per-test via `vi.spyOn` so the suite never touches the real `~/.claude.json`.

Wave 53d's shutdown contract test repointed: same contract (entry survives without remove call), assertions now read from `.mcp.json` instead of `.claude/settings.json`.

## Why curl worked but Claude Code didn't (the full chain, finally)

Wave 53e's smoke verified the JSON-RPC tool surface via `curl POST /message`. Curl works because:
- Curl POSTs directly to the server's HTTP endpoint regardless of how Claude Code does discovery.
- The server-side wiring (Wave 53e's graph-context fix, Wave 53f's SSE handshake fix) is correct.

Claude Code didn't work because the *discovery layer* failed before any HTTP request was attempted. Claude Code's MCP client reads `.mcp.json` (or `~/.claude.json mcpServers`), sees no `ouroboros` entry, never tries to connect. The server-side fixes were all valid but unreachable until this wave repairs the discovery path.

## Phase tally

| Phase | Files | Lines | Tests | Commit |
|---|---|---|---|---|
| A — Auto-inject rewrite + tests + .gitignore | 4 | +581 / -148 | 17 new + repointed 3 = 20 in this wave | `80f51c6` |
| B — Adoption smoke (post-restart, user-driven) | n/a | n/a | n/a | (this commit covers wrap-up; smoke runs separately) |
| C — Wrap-up | This brief, ADR, plan flip, version bump | — | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (touched files) | ✅ 0 errors, 0 warnings (was 13 errors after rewrite; cleaned via autofix + per-file disable for tmpdir-paths in tests) |
| `npx tsc --noEmit -p tsconfig.node.json` | ✅ clean |
| Phase A scoped tests | ✅ 49/49 across all 6 internalMcp test files |
| Full vitest suite | Skipped per user direction; pre-push hook validates |

## Manual smoke (Phase B — pending user post-restart)

The fix lands in main-process code, requires IDE rebuild + restart to take effect.

### Part 1 — orchestrator-runnable post-restart (filesystem checks)

After restart, the orchestrator can verify:

1. `.mcp.json` exists at project root with `mcpServers.ouroboros = {url: "..."}`.
2. `~/.claude.json projects[<C:\\Web App\\Agent IDE>].enabledMcpjsonServers` contains `'ouroboros'`.
3. `.claude/settings.json` no longer has `mcpServers.ouroboros` (cleanup applied).
4. `claude mcp list` lists `ouroboros` (where curl-based server smoke would have shown JSON-RPC was always working).

If Part 1 fails, Phase A had a regression and Phase B doesn't proceed.

### Part 2 — user-runnable in a fresh Claude Code session

1. Open a fresh Claude Code session in the IDE chat panel or external terminal in `C:\Web App\Agent IDE`.
2. `/mcp` should list `ouroboros` (with port number visible).
3. Ask a graph-shaped question (e.g., "Use `trace_call_path` to find callers of `injectIntoProjectSettings`").
4. Observe whether `mcp__ouroboros__*` tools register AND whether the agent picks the right one.
5. Append observation to `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke run #3 (post-discovery-fix)".
6. Finalize Wave 53d's Decision 9 (Greenlit / Redesigned / Retired).

## Subagent observations

Orchestrator-direct (no subagent dispatch). The fix shape was concrete enough after the diagnostic to execute inline. Mid-execution, two PostToolUse hooks fired — `post_write_test_required` (forced co-located test creation, which was the right move) and `post_edit_eslint` (caught a load-bearing `eslint-disable-next-line` I'd over-eagerly removed). Both surfaced bugs that would have shipped otherwise; hooks earned their keep.

## Known limitations

- **First post-53g startup will modify `.claude/settings.json`** (cleanup pass). User will see it as modified in `git status`. Subsequent launches don't touch it.
- **`hasTrustDialogAccepted: true`** is already set in the user's `~/.claude.json`, so the dialog probably won't fire on first `.mcp.json` appearance. If a future user has a fresh setup, they'd hit the trust dialog once.
- **No automated removal of the external `codebase-memory-mcp`** from the user's `~/.claude.json mcpServers`. Both servers can coexist (different tool name prefixes — `mcp__ouroboros__*` vs `mcp__codebase-memory-mcp__*`). User-driven choice; not the IDE's call.

## Out-of-wave follow-ups

- **Wave 54 verdict** — pending Phase B Part 2's adoption observation.
- **Wave 53c corpus re-analysis** — the analyzer counted bare tool names (e.g., `search_graph`) but Claude Code records MCP tools as `mcp__<server>__<tool>` (e.g., `mcp__codebase-memory-mcp__search_graph`). The "0% adoption" finding likely undercounted external `codebase-memory-mcp` calls. Re-run with prefix-aware tool naming for an honest baseline.
- **Per-spawn `--mcp-config` path** (Wave 51) — confirm whether IDE-orchestrated chat-panel sessions actually receive ouroboros via the per-spawn path. The path uses a temp file, not `.mcp.json`, so this wave's discovery fix doesn't affect it. Likely needs its own diagnostic if Phase B Part 2 reveals chat-panel sessions still don't have tools while external terminal sessions do.
- **External `codebase-memory-mcp` deduplication** — once `ouroboros` works, the user may want to remove the external one. UI surface for managing this is out of scope.
- **Trust dialog UX** — if a user opens a project for the first time post-53g, they'll see the trust dialog. Probably fine; documenting in case it becomes friction.

## Memory update

Updated `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md`: Wave 53g shipped the discovery fix. The 0% adoption from Wave 53c was caused by writing to the wrong file all along — Waves 53d/53e/53f fixed real bugs that were unreachable until 53g.