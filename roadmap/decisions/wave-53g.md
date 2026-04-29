# Wave 53g — Architecture Decision Record

**Status:** Decisions 1–4 resolved at Phase A close; Decision 5 (Wave 54 verdict) finalizes when Phase B's adoption smoke produces an observation.

This wave fixes the discovery layer for MCP server registration. Decisions are tactical; the only meaningful tradeoff was where to write the config (project-local vs user-global) and how to handle the legacy entries in the now-wrong file.

---

## Decision 1: Write project-local `.mcp.json`, not user-level `~/.claude.json` mcpServers

**Context:** Claude Code reads MCP server config from two places: project-local `.mcp.json` (registered via `enabledMcpjsonServers` in `~/.claude.json`) and user-level `~/.claude.json` top-level `mcpServers`. The IDE could write to either.

**Pick:** Project-local `.mcp.json`.

**Rationale:** The IDE's MCP server is per-project (per-IDE-instance, really — each launch picks a random port). Writing to user-level `mcpServers` would mean every project the user opens gets `ouroboros` pointed at one specific port — wrong for a per-project server. Project-local `.mcp.json` is the right scope: each IDE instance manages its own project's `.mcp.json`, and stale entries between launches are harmless because `injectIntoProjectSettings` upserts with the current port on every startup.

**Consequences:** The IDE owns `.mcp.json` at project root and is expected to overwrite the `ouroboros` entry on every startup. Other servers in the same `.mcp.json` (user-managed entries) are preserved. The file is in `.gitignore` because the random port shouldn't be committed.

---

## Decision 2: Update `~/.claude.json` per-project enabledMcpjsonServers automatically

**Context:** `.mcp.json` only registers a server *for discovery*. Claude Code requires the server to also be in `enabledMcpjsonServers` for the project (in `~/.claude.json projects[<root>].enabledMcpjsonServers`) to auto-load it without an interactive trust prompt. The IDE could leave this to the user (one-time `claude mcp add` style), or automate it.

**Pick:** Automate. The IDE updates `~/.claude.json` to add `'ouroboros'` to `enabledMcpjsonServers` for the project on startup.

**Rationale:** The IDE owns the auto-inject lifecycle for this server; making the user run a separate command to enable a server the IDE just registered defeats the auto-inject purpose. The trust dialog itself only fires once per project (gated by `hasTrustDialogAccepted`), and most users will have already accepted it from prior sessions. If they haven't, the dialog is a one-time UX cost, not a per-launch ask.

The write is idempotent: if `'ouroboros'` is already in the array, no change. If it was previously in `disabledMcpjsonServers` (user explicitly disabled), the auto-inject removes it from disabled — IDE re-enabling a server the user disabled is a recoverable conflict (user can disable again or set `internalMcpEnabled: false`). Could be hardened with a "respect user disable" flag in a future wave if this becomes a real friction point.

**Consequences:** Each IDE launch updates `~/.claude.json` (atomic write). Other top-level keys in `~/.claude.json` (`numStartups`, `hasCompletedOnboarding`, etc.) are preserved. The contract test asserts unrelated keys survive.

---

## Decision 3: Clean up `.claude/settings.json mcpServers.ouroboros` instead of leaving the orphan

**Context:** Three earlier waves (53d/53e/53f) wrote `mcpServers.ouroboros` into `.claude/settings.json`. Claude Code never reads it, so the entry was always dead-letter — but it sits in a file that *is* read for hooks/permissions. Two options: leave it (harmless), or clean it up on next startup.

**Pick:** Clean it up.

**Rationale:** Dead-letter entries in a file that's read for unrelated reasons confuse future readers ("why is there an MCP server entry in this file? Does anything use it?"). The cleanup is cheap (read file, delete one key, atomic write — only when the orphan is present, no churn otherwise). Plus the cleanup makes the wave self-evident: post-53g, the only place `mcpServers.ouroboros` appears is `.mcp.json` and `~/.claude.json`. Anyone investigating future MCP issues finds the right files.

The cleanup is conservative: it only deletes `mcpServers.ouroboros`, not other `mcpServers.*` entries the user may have added by hand.

**Consequences:** First IDE launch post-53g writes `.mcp.json` and updates `~/.claude.json`, AND modifies `.claude/settings.json` to remove the orphan. `.claude/settings.json` will appear as modified in git status until the user commits the cleanup. Subsequent launches don't touch `.claude/settings.json` (the orphan is gone; the no-churn check skips the write).

---

## Decision 4: Test `os.homedir()` mocking via `vi.spyOn`, not module-level monkey-patch

**Context:** The contract test needs to redirect `~/.claude.json` writes to a tmp dir. Two ways: (A) `vi.spyOn(os, 'homedir').mockReturnValue(fakeHome)`, or (B) hand-patch `os.homedir` and restore in `afterEach`.

**Pick:** A — `vi.spyOn`.

**Rationale:** vitest's spyOn is the canonical way to mock module exports. It tracks the original automatically, supports `vi.restoreAllMocks()` for cleanup, and integrates with vitest's lifecycle. Hand-patching is more verbose and error-prone (forget to restore = leaks across tests). The test file also restores `os.homedir = originalHomedir` defensively in `afterEach` belt-and-suspenders.

**Consequences:** The test file requires vitest's `vi` import. Other internalMcp tests (`internalMcpStdioTransport.test.ts`) use the same pattern, so this matches existing conventions.

---

## Decision 5 (PENDING SMOKE): Wave 54 verdict

**Context:** The wave's plan said Phase B would deliver the Wave 54 verdict (Greenlit / Redesigned / Retired) based on an adoption observation in a fresh Claude Code session post-fix. This is the fourth attempt at this verdict — after Waves 53d/53e/53f, each of which fixed real bugs but was masked by the wrong-file discovery issue this wave repairs.

**Status:** PENDING. Phase B's smoke runs from a fresh Claude Code session post-restart. When the user records the observation in `roadmap/wave-53d-live-test.md` (the cumulative live-test artifact), Decision 9 of Wave 53d's ADR finalizes Wave 54 as one of:

- **Greenlit:** Tools register AND the agent reaches for them on graph-shaped queries with useful results. Wave 54 (TS semantic operations) ships per its plan.
- **Redesigned:** Tools register but the agent rarely picks them despite the routing rule. Wave 54's exposure path needs work (better descriptions, surface visibility) before any new tools ship.
- **Retired:** Tools register and the agent ignores them entirely. Wave 54's value proposition collapses; close the wave.

The decision belongs in Wave 53d's ADR (where it was originally deferred), not duplicated here.