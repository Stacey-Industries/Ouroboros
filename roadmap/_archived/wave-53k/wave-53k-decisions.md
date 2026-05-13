# Wave 53k — Architecture Decision Record

**Status:** All decisions locked at plan close (2026-04-28); no Phase 0 design pause.

This wave fixes a regression introduced when Wave 53g moved ouroboros's
discoverability from `.claude/settings.json` (which Claude Code CLI ignores) to
`.mcp.json` + `~/.claude.json` (which it actually reads). `codemodeManager` was
left pointing at the old file, which meant `enableCodeMode` reported "no
servers found" and the routing matrix silently downgraded to direct-inject on
every IDE-orchestrated session. CodeMode hasn't actually engaged since 53g.

The decisions below were locked before Phase A started.

---

## Decision 1: Disable semantic — sibling file, not in-line key

**Context:** "Disabling" a server while CodeMode is active means moving its
config out of where Claude Code looks. Pre-53k that meant
`mcpServers` → `disabledMcpServers` in `.claude/settings.json` (which Claude
Code never read anyway). Post-53g we have to operate on files Claude Code
actually reads. Three candidates for restoration data:

- *Industry standard:* in-line custom key in `~/.claude.json`
  (e.g. `_codemodeManagedServers`). Risk: unknown top-level key collision if
  Claude Code adds the name itself in a future schema.
- *Emerging best practice:* a sibling file in `~/.claude/`, owned and only
  read by us. Schema isolation; no collision risk.
- *Cutting-edge:* SQLite or other structured store. Overkill for ~6 entries.

**Pick:** Sibling file `~/.claude/codemode-managed.json` — emerging best
practice tier.

**Rationale:** Schema isolation matters more here than a single shared file.
Claude Code is liberal with unknown top-level keys today, but each future
schema bump is a roulette. Owning a sibling file gives us full freedom over
shape and atomic-write semantics without coordinating with Anthropic.

**Consequences:** One extra file under `~/.claude/`. Documented as private.
Survives crashes by design.

---

## Decision 2: Project-scope disable — toggle the flag, leave `.mcp.json` alone

**Context:** Project-scope ouroboros lives in `<root>/.mcp.json` (canonical
entry). To take it offline while CodeMode multiplexes it, two options:

- Remove the entry from `.mcp.json`, restore on disable. Destructive; risks
  losing the canonical config if the restoration file gets out of sync.
- Toggle `~/.claude.json projects.<root>.disabledMcpjsonServers` to include
  the name. Non-destructive; the canonical entry stays put.

**Pick:** Toggle the flag pair (`enabledMcpjsonServers` /
`disabledMcpjsonServers`).

**Rationale:** Claude Code already supports the disabled-flag pattern
(`internalMcpAutoInject` uses it). We're a consumer of that contract, not a
re-implementer. Non-destructive for `.mcp.json` means a stale CodeMode disable
or a crash mid-write doesn't risk losing the upstream config — worst case the
flag is wrong and the user sees the original server, which fails open.

**Consequences:** `applyProjectEnable` and `restoreProject` in
`codemodeManagerScopes.ts` only touch `~/.claude.json projects.<root>`.
`.mcp.json` is read-only from CodeMode's perspective.

---

## Decision 3: Migration of stale `.claude/settings.json mcpServers` entries — leave them

**Context:** Pre-53g writes landed in `.claude/settings.json mcpServers`,
which Claude Code never read. Wave 53g's `cleanupLegacySettingsJson` already
removes the orphaned `ouroboros` entry there. The question for 53k: should we
proactively scan `.claude/settings.json` for other entries from earlier
attempts and clean them up?

**Pick:** Leave them. Claude Code CLI doesn't read `.claude/settings.json`
for MCP discovery — those entries are inert. We don't own that file.

**Rationale:** Anthropic Desktop *does* read `.claude/settings.json`. If a
user has both Anthropic Desktop and Claude Code installed, deleting entries
from `.claude/settings.json` would break the desktop app. Scope discipline:
this wave fixes CodeMode's file targeting, not user MCP-config history.

**Consequences:** Existing legacy entries stay where they are. Documented in
the codemode CLAUDE.md so future readers don't mistake them for live state.

---

## Decision 4: Idempotency policy — manage only what we wrote

**Context:** What if the user adds a new MCP server to `~/.claude.json`
between IDE startups while CodeMode is active?

- Aggressive: enable-on-startup re-enumerates everything in `mcpServers` and
  multiplexes new entries it finds. User edits are honored automatically.
- Conservative: we only touch servers listed in our restoration file.
  User-added entries are visible to the agent alongside `__codemode_proxy`
  until the next full cycle.

**Pick:** Conservative.

**Rationale:** We don't own the user's `~/.claude.json`. Reaching in and
moving entries the user just added violates that boundary and risks data
loss if our restoration file is corrupt. Agreed cost: until the next
disable/enable cycle, a newly-added server bypasses the multiplex. Wave 53l
will provide the steady-state takeover model where this is reactive.

**Consequences:** `restorationFile.global` is the source of truth for "what
to restore." `enableCodeMode` partitions only the requested
`serverNames` list — nothing else is touched.

---

## Decision 5: Atomic write + last-write-wins on contention

**Context:** Concurrent `claude mcp add` from a shell + IDE CodeMode write
to `~/.claude.json` could race. Mitigation options:

- Per-file mutex serializing IDE writes against shell writes (out-of-process,
  hard).
- Atomic `.tmp` + rename (the IDE's own writes are atomic; cross-process
  coordination is not).

**Pick:** Atomic `.tmp` + rename. Last-write-wins on contention.

**Rationale:** Cross-process coordination requires a real lock file
(`~/.claude.json.lock`) and discipline from Anthropic's CLI to use it. Not on
the table. Atomic writes within our process means a torn write isn't possible
from us; if Anthropic's CLI writes after us, their write wins (and vice
versa). Loss in the race is "user has to re-run `claude mcp add`" — minor.

**Consequences:** Pattern mirrors `internalMcpAutoInject.atomicWriteJson`
post-53g. No new lock infrastructure.

---

---

## Decision 6: Temp config is the sole source of truth via `--strict-mcp-config`

**Context:** Phase B smoke (2026-04-28) showed CodeMode enable succeeded, the
routing matrix decided `route-through-codemode`, but the agent still saw
`mcp__ouroboros__trace_call_path` directly. Investigation revealed two
compounding bugs in `scopedMcpConfig.ts`:

1. `readGlobalMcpServers()` was reading `~/.claude/settings.json` — the same
   pre-Wave-53g target Claude Code CLI doesn't use. So `userServers` was always
   `{}`, the temp config silently dropped every user server, AND
   `__codemode_proxy` (which codemodeManager correctly placed into
   `~/.claude.json mcpServers` per Decision 1) never got passed through.
2. The route-through-codemode branch had no fallback for when strict mode is
   on. The original comment said `__codemode_proxy` was "picked up via
   passthrough" — but with `--strict-mcp-config` (which our spawn args always
   include — see `claudeStreamJsonRunner.appendMcpConfigFlags`), there is no
   passthrough.

**Research:** Verified via [GitHub Issue #14490](https://github.com/anthropics/claude-code/issues/14490)
that `--strict-mcp-config` correctly bypasses both `.mcp.json` discovery and
user-scoped `~/.claude.json mcpServers` discovery. The only documented leak
is the `disabledMcpServers` list (NOT `disabledMcpjsonServers`), which we
don't use.

**Pick:** Read user servers from `~/.claude.json` (the right file). Trust
`--strict-mcp-config` to make the temp config the sole source. When CodeMode
is active, `__codemode_proxy` flows through naturally because it lives in
`~/.claude.json mcpServers` post-enable.

**Rationale:** Architecturally clean. One file, one source, one CLI flag.
Survives:
- The Windows `disabledMcpjsonServers` non-functional bug (we don't depend on
  it under strict mode).
- The triple-key `~/.claude.json projects.*` normalization mismatch (forward
  slash, backslash, worktree subpath — all bypassed).
- Any future Claude Code MCP discovery quirks.

The locked-decision-2 toggle of `disabledMcpjsonServers` for project-scope
servers is now belt-and-suspenders rather than load-bearing — it still
protects users who run `claude` outside the IDE (no `--mcp-config` passed),
but the IDE's spawned chat sessions don't depend on it.

**Consequences:**
- Pre-existing user-server bug (sentry, github, stripe, etc. were silently
  invisible to IDE-orchestrated chat agents — the temp config dropped them)
  is fixed as a side effect. CodeMode-disabled sessions also work better now.
- Tests in `scopedMcpConfig.test.ts`, `codemode.internalMcp.integration.test.ts`,
  and `crashRecovery.test.ts` updated their fs/promises mock predicates to
  intercept `~/.claude.json` reads (was: `*.claude/settings.json`).
- A new regression test (`passes through __codemode_proxy from ~/.claude.json
  under route-through-codemode`) pins the new behavior.

---

## Decision 7: Project-key normalization is a separate problem

**Context:** The smoke also surfaced that `~/.claude.json projects` contains
THREE keys for the same Agent IDE project — forward-slash, backslash, and a
worktree subpath. This means different code paths in the IDE / Claude Code
ecosystem are normalizing project paths differently.

**Pick:** Out of scope for Wave 53k. Decision 6 makes 53k correct without
needing the project keys to converge.

**Rationale:** Under strict-mode + correct temp config, project-scope
disable flags are belt-and-suspenders. The triple-key issue is a real bug
worth fixing, but it's orthogonal and would expand the wave significantly.

**Consequences:** Filed as a follow-up. When fixed, it should also
defensively migrate existing duplicate keys (collapsing forward-slash and
backslash variants of the same path) so we don't accumulate stale state.

---

---

## Decision 8: Destructive write to `.mcp.json` for project-scope disable (reverses Decision 2)

**Context:** Phase B″ smoke against Claude Code CLI v2.1.122 on Windows
proved that BOTH layers of project-scope isolation we'd been depending on
are non-functional in practice:

1. `--strict-mcp-config` (which the docs claim bypasses `.mcp.json`
   discovery — see [paddo.dev's pattern](https://paddo.dev/blog/claude-code-mcp-context-isolation/)
   and [Issue #14490](https://github.com/anthropics/claude-code/issues/14490))
   does not isolate `.mcp.json`-defined servers in v2.1.122. The agent
   still loaded ouroboros's tools (`mcp__ouroboros__trace_call_path`,
   `mcp__ouroboros__query_graph`, etc.) despite our temp config containing
   only `__codemode_proxy` and `--strict-mcp-config` being passed.
2. `disabledMcpjsonServers` (the flag toggle from Decision 2) is reported
   to be non-functional on Windows in some cases (see ClaudeLog, Issue
   #16402). Empirically true here: even with the toggle written to the
   user's project entry, ouroboros loaded.

Both layers leak. Our IDE's CodeMode contract was load-bearing on at
least one of them being respected.

**Pick:** Reverse Decision 2. CodeMode now **destructively removes** the
proxied entries from `<projectRoot>/.mcp.json mcpServers` during enable
and resurrects them verbatim on disable. The verbatim config is captured
into the restoration file (`~/.claude/codemode-managed.json`, schema
bumped from v1 to v2 to carry full configs instead of names).

**Rationale:** Per the user directive — "Do whichever is considered best
practice for this type of thing. No work-arounds, lets do the hard work
if it is better." Best practice for this scenario is to make our own
contract reliable rather than depend on a CLI flag the binary doesn't
honor or a config flag with platform-specific bugs. The destructive
write is deterministic: if the entry isn't in `.mcp.json`, Claude Code
literally cannot discover it, regardless of how many discovery paths
exist.

**Consequences:**
- `.mcp.json` is no longer a no-edit file from CodeMode's perspective.
  This was previously a locked design constraint (Decision 2); it's now
  reversed.
- During an active CodeMode session, `git status` will show `.mcp.json`
  as modified. This is the cost. Alternative (running `claude` outside
  the IDE while CodeMode is on) is rare; user can rely on disable-on-
  spawn-completion to restore.
- Crash safety: writes are atomic (`.tmp` + rename). If the IDE crashes
  mid-enable, the restoration file is on disk. `enableCodeMode` now
  self-heals on next call: if a stale restoration file exists, it
  applies the restore before starting a new enable. This is the new
  `maybeRestoreFromCrash` helper.
- Restoration-file schema bumped to `version: 2`. Old `version: 1`
  records (containing `project: Record<string, string[]>` — names only)
  are not migrated; they're rejected by `readRestorationFile` and
  silently treated as absent. Acceptable because v1 records would only
  exist on a single user's machine for the brief window between Phase A
  and Phase B″ (same wave, same day).
- The `codemodeManagerScopes.toggleProjectServerDisabled` /
  `reEnableProjectServer` helpers are gone — they were the toggle-flag
  path, no longer used.
- Project-key normalization (Decision 7's deferred follow-up) becomes
  even less load-bearing: `applyProjectEnable` writes to
  `<projectRoot>/.mcp.json` directly, no longer touching
  `~/.claude.json projects.<root>.*`.

**What this commits us to:**
- A more invasive contract with `.mcp.json` than originally planned.
- The user directive accepts this trade-off. We mitigate via atomic
  writes, crash recovery, and a tight enable→disable lifecycle bounded
  by the chat session.

**What this punts:**
- Standalone-ouroboros-MCP-server (filed earlier as Wave 53l follow-up):
  still desirable. When it ships, `.mcp.json` ouroboros could be
  permanently absent and CodeMode could multiplex via the standalone
  server's port without touching the project file. That's a larger
  architectural shift; not this wave.

---

---

## Decision 9: SDK adoption for proxy + mcpClient (was deferred to Wave 53m, pulled forward)

**Context:** Phase B⁗ surfaced that `mcpClient.ts` and `proxyServer.ts` used
LSP-style Content-Length framing, but MCP stdio transport is NDJSON. The
hand-rolled implementation (~280 lines in mcpClient.ts plus
writeMessage/parseMessages/sendResult/handleMessage in proxyServer.ts)
was the source of both that bug and the subsequent
`Promise.allSettled` startup-blocking issue. NDJSON conversion (Phase B⁗)
unblocked the immediate failure; per-upstream startup deadline (Phase
B⁗.5) handled the slow-upstream case. Both were point fixes to a
hand-roll the project no longer needs to maintain.

The user directive after smoke confirmed: *"we are going to push for the
proper implementation of codemode now instead of this work around. … do
the hard work if it is better."*

**Pick:** Replace the hand-roll with `@modelcontextprotocol/sdk` (a
dependency since Wave 53i). `mcpClient.ts` now uses `Client` +
`StdioClientTransport`. `proxyServer.ts` now uses `Server` +
`StdioServerTransport` with `setRequestHandler(ListToolsRequestSchema, …)`
and `setRequestHandler(CallToolRequestSchema, …)`.

Mirrors the Wave 53j precedent for `internalMcpStdioTransport.ts`. Same
ADR rationale applies:
- Wire format, request/response correlation, initialize handshake — all
  owned by the SDK.
- Future MCP spec changes ride in via `npm update`, not new wave fixes.
- Bundle weight cost is acceptable for main-process code.

**Rationale:** Best practice. The codemode hand-roll predated the SDK
dependency; once Wave 53i adopted the SDK for the IDE's own MCP server
and Wave 53j adopted it for the stdio bridge, the codemode proxy was the
last hand-roll standing. Three different wave phases tonight (B⁗, B⁗.5)
were spent fixing classes of bug the SDK would have prevented by
construction. Continuing to point-fix the hand-roll is more expensive
than adopting the SDK once.

**Consequences:**
- `mcpClient.ts` shrunk from ~280 lines to ~120 lines.
- `parseMessages`/`encodeMessage` are gone from mcpClient.ts. Tests
  pivoted from NDJSON parser correctness to SDK-mocked
  initialize/listTools/callTool delegation (3 happy-path + 2 config-
  validation tests).
- `proxyServer.ts`'s hand-rolled `writeMessage`/`sendResult`/
  `handleMessage`/`registerMessageHandler` are gone. Replaced with two
  SDK request handlers and `transport.onclose`-driven shutdown.
- `proxyServer.test.ts` (new) covers the pure helpers we still own:
  `buildExecuteCodeTool`, `buildToolDispatchMap`,
  `formatExecutionResult`, `formatExecutionFailure`. Plus an entry-point
  guard test that imports the module without auto-running `main()`.
- The 15s startup deadline + HTTP-skip filter + crash recovery + diagnostic
  log file all stay — they're CodeMode-specific business logic, not
  transport.

**What this commits us to:** version drift via `npm update
@modelcontextprotocol/sdk` — bug fixes ride in, possible breaking
changes also ride in. Same Wave 53i trade-off, applied consistently.

---

## Notes for executor

- `codemodeManager.ts` keeps its public API signatures (`enableCodeMode`,
  `disableCodeMode`, `getMcpServers`, etc.). The `scope` parameter on
  `enableCodeMode` is now advisory — each requested server is handled in its
  actual scope based on where `getMcpServers` finds it.
- The legacy `disabledByUs: Set<string>` and `activeScope` / `activeProjectRoot`
  module state are gone. Restoration drives entirely off the on-disk
  restoration file.
- Tests live in three files:
  - `codemodeManagerFiles.test.ts` (path/IO helpers)
  - `codemodeManagerScopes.test.ts` (global/project enable/restore)
  - `codemodeManager.test.ts` (public API end-to-end against temp files)

End-to-end smoke: per the plan, an IDE restart with CodeMode on should now
log `[codemode] enabled for launch — proxied: …` and the agent's tool list
should show `Called __codemode_proxy` rather than `Called ouroboros`. That
verification is Phase B of the wave.
