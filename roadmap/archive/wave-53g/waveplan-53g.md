# Wave 53g — MCP Discovery: Write to `.mcp.json` Not `.claude/settings.json`
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.8 · Result: `roadmap/auto-briefs/wave-53g-result.md` · Phase B Part 2 (adoption smoke) PENDING user post-restart
**Version target:** v2.7.8 (patch — bug fix; auto-inject targets the right config file; no new feature surface)
**Dependencies:** Waves 53d/53e/53f all assumed `.claude/settings.json mcpServers` was the discovery path. They aren't wrong about *what they did* — they're wrong about *where to do it.* Each fix lands; each fix is in the wrong file. This wave repoints the auto-inject and removes the dead-letter writes.

---

## Why this wave exists

The Wave 54 adoption smoke (post-v2.7.7) showed `/mcp` lists `ouroboros` as **missing entirely** — Claude Code never tried to connect. Investigation revealed:

- **Claude Code does not read MCP server config from `.claude/settings.json`.** That's an Anthropic Desktop / Ouroboros convention, not a Claude Code CLI convention.
- **Claude Code reads MCP server config from:**
  - Project-level: `.mcp.json` at the project root, registered via `enabledMcpjsonServers` in `~/.claude.json` per-project entry.
  - User-level: `~/.claude.json` top-level `mcpServers`.
- **Empirical confirmation:**
  - User's `~/.claude.json` `mcpServers`: `sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7` — all visible in `claude mcp list` as Connected.
  - User's project entry: `enabledMcpjsonServers: []`, `disabledMcpjsonServers: []`, `hasTrustDialogAccepted: true`.
  - No `.mcp.json` at project root.
  - `claude mcp list` shows `ouroboros` nowhere.
- **The `.claude/settings.json mcpServers` block we've been auto-injecting since whatever wave introduced it is dead-letter.** Three waves of fixes (53d / 53e / 53f) targeted the wrong file. The server is healthy; Claude Code never looks at it.

This wave fixes the discovery path by:
1. Writing `.mcp.json` at the project root (the file Claude Code actually reads).
2. Updating `~/.claude.json` per-project entry's `enabledMcpjsonServers` to include `ouroboros`.
3. Cleaning up the misplaced entry in `.claude/settings.json` so the wrong location stops accumulating noise.
4. Adding `.mcp.json` to `.gitignore` (per-launch random port).

The good news: Waves 53d/53e/53f are *not wasted* — the fixes they shipped (lifecycle, runtime context, SSE handshake) are all real bugs that needed fixing. This wave makes those fixes actually reachable.

---

## Scope

### In-scope

- Phase A: Rewrite `internalMcpAutoInject.ts` to target `.mcp.json` + `~/.claude.json`. Update existing tests. Add new contract test. Add `.mcp.json` to `.gitignore`.
- Phase B: Smoke from a fresh Claude Code session post-restart — `/mcp` should list `ouroboros`, tools should be callable.
- Phase C: Wrap-up — result brief, ADR finalize, plan flip, version bump, push. Wave 54 verdict finalizes from the smoke observation.

### Out-of-scope

- Removing the *external* `codebase-memory-mcp` from `~/.claude.json` `mcpServers`. The user's external server has been working all along and provides the same kind of tool surface; the IDE shouldn't disable it without explicit user intent. Both can coexist (different MCP server names, different tool prefixes).
- Restructuring the auto-inject's caller surface in `main.ts`. The `injectIntoProjectSettings(workspaceRoot, port, options)` signature stays.
- Per-spawn `--mcp-config` path changes. That path uses `scopedMcpConfig.ts` and writes a temp file the IDE constructs explicitly — separate code path, already works under its own conventions.

---

## Phase A — Implementation

### Files modified

| File | Change |
|---|---|
| `src/main/internalMcp/internalMcpAutoInject.ts` | Rewrite. New write target: `<projectRoot>/.mcp.json` with shape `{mcpServers: {ouroboros: {url \| command/args}}}`. New side effect: update `~/.claude.json` per-project entry's `enabledMcpjsonServers` array (add `ouroboros` if absent; idempotent). Plus a one-time cleanup pass that removes `mcpServers.ouroboros` from `<projectRoot>/.claude/settings.json` if present. Atomic write throughout. |
| `src/main/internalMcp/internalMcpShutdownContract.test.ts` | Update assertions to read from `.mcp.json` not `.claude/settings.json`. Keep the contract: shutdown does not remove the entry. |
| `.gitignore` | Add `.mcp.json` (per-launch random port; do not commit). |

### New file

| File | Change |
|---|---|
| `src/main/internalMcp/internalMcpDiscovery.contract.test.ts` | Contract test asserting: (a) `injectIntoProjectSettings` writes `.mcp.json` with the correct shape; (b) it updates `~/.claude.json` `enabledMcpjsonServers` to include `ouroboros`; (c) it removes `mcpServers.ouroboros` from `.claude/settings.json` if present (cleanup); (d) the operation is idempotent. |

### Subagent dispatch

Orchestrator-direct. Single-file rewrite + test updates; full context already in scope. The Windows-path-handling subtleties in `~/.claude.json` (project keys use single-backslash native separators, not URL-encoded) need care — handle by calling `path.normalize(workspaceRoot)` and using the result directly as the key.

### Acceptance

- [ ] `.mcp.json` is written at project root after IDE startup.
- [ ] `~/.claude.json` `projects[<root>].enabledMcpjsonServers` contains `'ouroboros'`.
- [ ] `.claude/settings.json` no longer has `mcpServers.ouroboros` after the cleanup pass runs.
- [ ] `.gitignore` lists `.mcp.json`.
- [ ] All existing `internalMcp/` tests still pass after assertion updates.
- [ ] New discovery contract test passes (4 cases).
- [ ] Lint clean. Typecheck clean.
- [ ] Commit: `fix(wave-53g): Phase A — write .mcp.json + update ~/.claude.json enabledMcpjsonServers`

---

## Phase B — Smoke

User restarts the IDE. Orchestrator can verify part 1 from this session via filesystem reads:

1. Confirm `.mcp.json` exists at project root with `mcpServers.ouroboros = {url: "..."}`.
2. Confirm `~/.claude.json` per-project entry has `'ouroboros'` in `enabledMcpjsonServers`.
3. Confirm `.claude/settings.json` no longer has `mcpServers.ouroboros`.

User runs Part 2 in a fresh Claude Code session:

4. `/mcp` lists `ouroboros` (with port number visible).
5. Ask the same trace_call_path question. Tools register, agent uses them, response is useful.

### Acceptance

- [ ] `/mcp` lists `ouroboros` connected.
- [ ] At least one `mcp__ouroboros__*` tool returns real content from a real query.
- [ ] Observation appended to `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke run #3 (post-discovery-fix)".
- [ ] Wave 54 verdict (Greenlit / Redesigned / Retired) finalized in Wave 53d's ADR Decision 9.

---

## Phase C — Wrap-up

- `npm run lint` (touched files) — zero errors.
- Both typechecks — clean.
- Result brief at `roadmap/auto-briefs/wave-53g-result.md`.
- ADR finalize at `roadmap/decisions/wave-53g.md`.
- Plan status flip on this file.
- `roadmap/wave-54-plan.md` blocker line — update or close depending on Phase B's verdict.
- Memory pointer update.
- `package.json` v2.7.7 → v2.7.8.
- Release commit + tag + push + GH release.

---

## Risks

| Risk | Mitigation |
|---|---|
| Editing `~/.claude.json` corrupts user state | Atomic write (`.tmp` + rename) throughout. Read full JSON, update one field, write. Same pattern as the existing settings.json edit. |
| Trust dialog fires when `.mcp.json` first appears | `hasTrustDialogAccepted: true` is already set in the project entry. Per the research, that gates whether existing project-local servers auto-load — should be sufficient for our case. If a dialog still fires, it's a one-time user click. |
| Existing `.claude/settings.json mcpServers` cleanup deletes user-managed entries | Only delete `mcpServers.ouroboros` specifically. Leave any other `mcpServers.*` entries the user added by hand untouched. |
| Per-spawn `--mcp-config` path conflicts with the new `.mcp.json` | The two are independent. The per-spawn temp file is what IDE-orchestrated launches use; `.mcp.json` is what external `claude` launches read. They serve different scenarios. |

---

## Out-of-wave follow-ups

- **External `codebase-memory-mcp` deduplication.** User has both an external standalone server AND the IDE-managed internal one. Once `ouroboros` works, the user may want to remove the external one to avoid redundant tool surfaces. User-driven choice; not automated.
- **Per-spawn `--mcp-config` review** — confirm whether IDE-orchestrated chat-panel sessions actually receive ouroboros via the per-spawn path. If yes, the per-spawn path was working all along; if no, it has its own bug to chase.
- **Wave 53c corpus re-analysis** — re-run with the analyzer recognizing `mcp__<server>__<tool>` tool names. The "0% adoption" claim from Wave 53c likely missed counts of `mcp__codebase-memory-mcp__*` calls because the analyzer looked for bare names.