# Wave 60 — ADR: Standalone Ouroboros MCP Server

**Status:** LOCKED 2026-04-29 after Phase 0 verification smokes.
**Plan:** `roadmap/wave-60-standalone-ouroboros.md`

---

## Decision 1: Indexing model — read-only standalone

**Context:** When the IDE is off, external Claude Code sessions need access to graph tools. Standalone could either (a) only serve a snapshot the IDE wrote, or (b) self-index when alone.

**Pick:** Read-only standalone — IDE owns all writes, standalone is read-only.

**Rationale:** Self-indexing duplicates ~half the IDE's graph subsystem (tree-sitter parser, watcher, autoSync, indexing pipeline). Read-only ships a thin shell around the SQLite DB the IDE already maintains. The "stale snapshot" failure mode (IDE off for days while user edits files via terminal) is far rarer than the cost of duplicate indexing infrastructure. Self-indexing is a follow-up wave if soak data shows it matters.

**Consequences:** Standalone serves whatever the IDE last indexed. If the user edits files extensively while IDE is off, graph results are stale. Acceptable for the typical workflow (user opens IDE before doing focused codebase work).

---

## Decision 2: Single-instance policy — none needed

**Context:** Both IDE and standalone could be active simultaneously (user has IDE running AND a terminal `claude` session). Who coordinates writes to the SQLite DB?

**Pick:** No lockfile, no coordination. Read-only standalone + better-sqlite3 WAL = concurrent readers permitted alongside one writer.

**Rationale:** WAL mode (verified live in Phase 0 smoke 2 — `journal_mode = wal` on the active IDE DB) is exactly the SQLite property designed for this case. Many readers + one writer with no locking conflicts. No coordination needed because there's only one writer (the IDE) regardless of how many standalone readers spawn.

**Consequences:** Multiple concurrent terminal `claude` sessions all spawn their own standalone proxy instances and read the same DB cleanly. No process-level coordination. If we ever go to self-indexing (Decision 1 reversal), this decision needs revisiting.

---

## Decision 3: DB path resolution — per-OS userData default + `--db` override

**Context:** Standalone runs outside Electron, so `app.getPath('userData')` is unavailable. Three options:

- **(a) Match Electron's path explicitly per OS** — Windows: `%APPDATA%/ouroboros/codebase-graph.db`, macOS: `~/Library/Application Support/ouroboros/codebase-graph.db`, Linux: `~/.config/ouroboros/codebase-graph.db`.
- **(b) Accept `--db <path>` arg from the mcpServers entry**.
- **(c) Read from a marker file the IDE writes**.

**Pick:** (a) as default + (b) as override. Verified in Phase 0 smoke 3 — the per-OS path resolution matches Electron's actual `userData` exactly.

**Rationale:** (a) means the standalone "just works" without needing the IDE to coordinate via marker files. (b) gives operators an escape hatch for non-default installs. (c) introduces a coupling between IDE startup and standalone startup that complicates the off-IDE case (no marker if IDE never started).

**Consequences:** Hardcoding per-OS paths means future changes to Electron's userData path resolution would skew the standalone away from the IDE's view. Mitigation: regression test that the resolved paths match across IDE + standalone.

---

## Decision 4: Naming — single `ouroboros` entry pointing at the standalone

**Context:** Three options for how to handle the IDE-internal MCP server vs. the standalone:

- **(a)** Two distinct names (`ouroboros-live`, `ouroboros-disk`) — agent sees both when IDE is up; needs namespace docstring discrimination.
- **(b)** Single `ouroboros` entry pointing at the standalone; delete the IDE-internal MCP server entirely.
- **(c)** Dynamically swap the entry's pointer based on IDE state.

**Pick:** (b) — single `ouroboros` entry, standalone always serves, delete the IDE-internal MCP server.

**Rationale:** (a) requires the agent to disambiguate, which we know is unreliable (corpus showed 0% adoption pre-fix). (c) requires per-session injection refresh that Claude Code doesn't natively support. (b) is the simplest mental model: IDE writes the DB, standalone serves it, agent sees one tool surface regardless of IDE state. The IDE-internal MCP server has no internal IDE consumers (graph features access `getGraphController()` directly, not through MCP), so deletion is mechanical.

**Consequences:** ~600 LOC + ~80 tests deleted in Phase E. The Wave 53l Phase A scaffolding (port registry, health probe, `dropStaleOuroboros`, crash-recovery skip, bridge port resolution) becomes redundant and is removed too. Net simplification of the codebase. Migration path: IDE startup overwrites legacy `~/.claude.json mcpServers.ouroboros` with the new shape on first run with the new code.

---

## Decision 5: Distribution — bundled with IDE installer

**Context:** Two options for shipping the standalone binary:

- **(a)** Bundled inside the IDE installer; binary at `<IDE-install-dir>/resources/standalone/ouroborosMcp.js`.
- **(b)** Separate npm package — `@ouroboros/mcp-server`; user installs independently.

**Pick:** (a) — bundled. Source structured under `src/standalone/ouroborosMcp/` with no Electron imports, so future extraction to (b) is mechanical (~30 min of work) if ever desired.

**Rationale:** Single user, single workflow today. (a) means zero install steps and tighter version coupling between the IDE that wrote the DB and the binary that reads it (avoids schema-drift bugs). (b) introduces a separate version dimension and an extra install step. The architectural cleanness of "extractable" is preserved by directory boundary discipline; the packaging decision is reversible.

**Consequences:** The standalone binary lives inside the IDE's `out/standalone/` directory. Updates to the standalone require an IDE update. If we ever ship to other users, extracting to npm is trivial because the source has no Electron dependencies.

---

## Decision 6: Migration — automatic on first launch with new code

**Context:** Existing users have legacy `~/.claude.json mcpServers.ouroboros` entries pointing at the bridge (`internalMcpStdioTransport.js [port]`). How does the upgrade happen?

**Pick:** IDE startup detects the standalone binary's path, overwrites the entry to point at the standalone. codemodeStartup re-multiplexes transparently. No user action required.

**Rationale:** The plan's "automatic migration" is the only acceptable UX — anything requiring user intervention would leave a meaningful subset of users on the broken bridge entry. The migration is idempotent (writes the same shape every time), so accidental double-migration is harmless.

**Consequences:** First IDE launch after the Wave 60 update silently rewrites the entry. Stale `codemode-managed.json` from prior sessions gets self-healed via the existing crash-recovery path. No release notes step required for users beyond the changelog.

---

## Phase 0 verification — ADDITIONAL FINDING

Smoke 2 surfaced a real architectural concern not pre-considered in the plan:

**Native bindings (better-sqlite3) are compiled against Electron's Node ABI in the IDE's `node_modules`.** Standalone Node (24.13.0, ABI 137) cannot load the IDE's compiled `.node` binary (ABI 145). The smoke worked only after installing a fresh Node-ABI copy of `better-sqlite3` in a separate directory.

**Implication for Wave 60 build:** The standalone needs its own Node-ABI compiled copy of `better-sqlite3`. Two paths:

- **Dual-compile at build time:** electron-vite produces both the Electron-compiled binding (for the IDE) and a Node-compiled binding (for the standalone). electron-builder's bundling story for native modules supports this pattern but it adds build complexity.
- **Bundle prebuilds:** ship the standalone with a prebuilt Node-ABI `.node` binary alongside the script. Cheaper at build time, slightly larger installer.

**Decision deferred to Phase A** — neither option is locked here. Whichever works cleanly with the existing electron-builder config wins. If both prove painful, fallback is `sql.js` (pure-JS SQLite) for the standalone, accepting some performance loss.

---

## Phase 0 smokes — verification log

All three Phase 0 verification smokes ran on 2026-04-29:

- **Smoke 1 (standalone stdio MCP via SDK):** PASS. Spawned a child Node process running `@modelcontextprotocol/sdk`'s `StdioServerTransport`; sent initialize + tools/list + tools/call requests; all three roundtripped cleanly.
- **Smoke 2 (better-sqlite3 readonly + WAL):** PASS (after fresh Node-ABI install per the finding above). Opened the live IDE DB readonly while IDE was actively writing. Read 19,007 nodes / 15,993 edges. WAL journal mode confirmed.
- **Smoke 3 (per-OS userData path resolution):** PASS. `%APPDATA%/ouroboros/codebase-graph.db` resolved correctly outside Electron and matched the path the IDE writes.

Phase 0 GREEN. Phase A (build the standalone in isolation) unblocked.
