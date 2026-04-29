# Wave 53k — Fix CodeMode File Targeting (mirror of Wave 53g)
## Implementation Plan (DRAFT)

**Status:** DRAFT — queued for execution. Do not start before reviewing the open questions in this doc.
**Version target:** v2.7.12 (patch — bug fix; mirror of 53g's file-targeting fix applied to CodeMode)
**Dependencies:** Waves 53g (`.mcp.json` discovery), 53i (SDK adoption), 53j (stdio bridge SDK rewrite + CodeMode opt-in for IDE-orchestrated sessions). All shipped.

---

## Why this wave exists

Wave 53j flipped CodeMode on for IDE-internal sessions. User smoke-tested and reported the agent still calls `ouroboros` directly, not `__codemode_proxy`. Investigation found this in the IDE log:

```
[codemode] enable failed; falling back to direct inject:
   None of the requested MCP servers were found in settings.
```

`codemodeManager` reads from `.claude/settings.json mcpServers` for both global (`~/.claude/settings.json`) and project (`<projectRoot>/.claude/settings.json`) scope. Wave 53g moved `ouroboros` out of that file (Claude Code CLI doesn't read `.claude/settings.json` for MCP discovery — it reads `~/.claude.json mcpServers` and `.mcp.json`). So when CodeMode looks for ouroboros to add to its proxy list, it finds nothing, returns `success: false`, the routing matrix downgrades to `direct-inject`, and the agent gets ouroboros via the fallback.

**Net:** CodeMode hasn't actually worked since Wave 53g. It's been silently downgrading on every IDE-orchestrated session.

This wave applies Wave 53g's file-targeting fix to `codemodeManager`. Bounded scope, established pattern.

---

## Goal

Make `codemodeManager.enableCodeMode()` succeed when called with `['ouroboros']` (the current routing-matrix call site). After this wave, IDE-orchestrated sessions actually route through `__codemode_proxy.execute_code` instead of falling back to direct-inject.

External sessions (terminal `claude`) still bypass CodeMode entirely — that's Wave 53l's job.

---

## Scope

### In-scope (Phase A)

- `src/main/codemode/codemodeManager.ts`:
  - Replace `getGlobalSettingsPath()` and `getProjectSettingsPath()` with helpers that return the files Claude Code CLI actually reads:
    - **Global:** `~/.claude.json` (read/write `mcpServers` block at top level — same pattern as Wave 53g's auto-inject editing of `~/.claude.json`).
    - **Project:** `<projectRoot>/.mcp.json` (read/write `mcpServers` block — same pattern as Wave 53g's `.mcp.json` writing).
  - The "disable original servers" logic currently moves servers from `mcpServers` → `disabledMcpServers`. Translate that pattern:
    - **Global (in `~/.claude.json`):** keep using a `disabledMcpServers` key at top level. (Verify Claude Code CLI tolerates this — if it strips unknown keys, use a private namespace like `_codemodeManagedServers` instead.)
    - **Project (in `.mcp.json`):** if Claude Code's `enabledMcpjsonServers` / `disabledMcpjsonServers` keys are the right surface, use them. Otherwise, lean on direct removal from `.mcp.json` and rely on the user's `~/.claude.json` for restoration data (still TBD — open question below).
  - Atomic write throughout (`.tmp` + rename), tolerant of missing/invalid JSON — copy the patterns from `internalMcpAutoInject.ts` post-Wave-53g.
  - Preserve the existing `enableCodeMode([serverNames])` / `disableCodeMode()` API surface — only the underlying file targets change.

### In-scope (Phase B — smoke)

- After IDE restart, IDE-orchestrated session smoke:
  - IDE log shows `[codemode] enable succeeded` (or absence of the `enable failed; falling back` warning).
  - User's `~/.claude.json` shows `mcpServers.__codemode_proxy` registered, `mcpServers.ouroboros` moved to `disabledMcpServers` (or whichever key we settle on).
  - Fresh chat-panel session: agent's tool-use line says **`Called __codemode_proxy`** (with `execute_code` underneath), NOT `Called ouroboros`.
  - The graph query (`Use trace_call_path …`) still works end-to-end.

### Out-of-scope

- External sessions accessing CodeMode (Wave 53l).
- Multiplexing servers other than ouroboros (CodeMode currently scopes to the explicit `serverNames` list passed by the routing matrix; this wave doesn't change that).
- Any change to `proxyServer.ts` or `mcpClient.ts` — they're consumers of the config the manager writes; they should work unchanged once the file-target fix lands.

---

## Open questions to resolve in Phase A

1. **Where does CodeMode's "disable original servers" land in the new file shape?**
   - In `~/.claude/settings.json` (Anthropic Desktop convention), the canonical key was `disabledMcpServers`. Claude Code CLI doesn't read that file at all, so the key is irrelevant.
   - In `~/.claude.json` (Claude Code's user config), there's no documented `disabledMcpServers` key at top level. Need to check whether Claude Code CLI tolerates unknown top-level keys (likely yes; it does for our `projects.<root>.disabledMcpjsonServers`) — but using a custom key like `_codemodeManagedServers` would be safer and self-documenting.
   - In `<projectRoot>/.mcp.json`, the per-project flag pair is `enabledMcpjsonServers` / `disabledMcpjsonServers` (in `~/.claude.json projects.<root>`, not in `.mcp.json` itself).
   - **Tentative answer:** for global scope, use `~/.claude.json _codemodeManagedServers` as a private restoration record + delete from `mcpServers`. For project scope, modify the project entry's `enabledMcpjsonServers` (drop the proxied server) and keep the entry in `.mcp.json` as a record but the agent won't see it unless re-enabled.
   - Settle this by reading `codemodeManager`'s tests + the existing on-disable flow before committing to an approach.

2. **Does Claude Code refuse to launch if `~/.claude.json mcpServers` has a server with no corresponding `command`/`url`?**
   - If yes, our "disable" pattern needs care — can't just leave dangling entries.
   - If no, we have flexibility.
   - Verify via a quick test (claude mcp add a fake stdio server, mcp list, claude mcp remove).

3. **What happens if the user manually edits `~/.claude.json` between IDE startups?**
   - The IDE's enable-on-startup flow could clobber user changes.
   - Tentative answer: idempotent enableCodeMode that respects user-added entries (only manages the servers it created itself).
   - Phase A's atomic-merge logic needs this.

---

## Phases

| Phase | Goal | Subagent | Acceptance |
|---|---|---|---|
| A | Fix file-target in `codemodeManager`. Update existing `codemode/` tests. | `sonnet-implementer` (cross-file: codemodeManager.ts + tests + maybe `claudeCodeMode.ts` if it consumes the API surface). | All `codemode/` tests pass. Lint + typecheck clean. Smoke verifies the warning message is gone. |
| B | Post-restart smoke. | Orchestrator + user. | IDE log shows successful enable. `~/.claude.json` shows expected state. Fresh chat-panel session shows `Called __codemode_proxy`, not `Called ouroboros`. |
| C | Wrap-up: result brief, ADR, plan flip, version bump, push. | Orchestrator. | All gates clean, tagged v2.7.12. |

---

## Risks

| Risk | Mitigation |
|---|---|
| The "disable original servers" semantic doesn't have a clean Claude-Code-CLI equivalent | Keep them ENABLED alongside `__codemode_proxy` (the "coexist" option from earlier discussion). Loses context savings but no destructive change. Decide in Phase A based on Open Question 1. |
| `proxyServer.ts` requires upstream MCP server configs in a specific shape that doesn't match what's in `~/.claude.json` directly | Read upstream configs from the file we're managing, transform if needed. Same data, different file. Should be a config-loader change, not a wire-format one. |
| Tests in `codemodeManager.ts.test.ts` (and integration test) hard-code `.claude/settings.json` paths | Update assertion paths; pattern matches what 53g and 53j tests did. |
| User has CodeMode disabled (`codemode.enabled: false`) — wave does nothing for them | Correct behavior; this wave only matters when CodeMode is enabled. Document in ADR. |

---

## Acceptance criteria (wave-level)

- [ ] `codemodeManager` reads/writes `~/.claude.json` (global) and `<root>/.mcp.json` (project), not `.claude/settings.json`.
- [ ] Open Question 1 resolved (disable semantic) and documented in the ADR.
- [ ] All `codemode/` tests pass after assertion updates.
- [ ] IDE-orchestrated session smoke confirms `__codemode_proxy` engagement (not `ouroboros` direct-inject).
- [ ] No regressions in Wave 54 adoption smoke (graph tools still work, just now via CodeMode).

---

## Out-of-wave follow-ups

- **Wave 53l** — extend CodeMode multiplexing to ALL user MCP servers + make it discoverable for external sessions. Larger architectural wave.
- **Soak period before flipping schema defaults to true.** This wave only fixes file targeting; the schema defaults (`codemode.enabled: false` etc.) stay false. After 53k smoke + 1-2 weeks of usage, can flip globally if no regressions.
- **`disabledMcpServers` standardization.** If Open Question 1 lands on a custom key (`_codemodeManagedServers`), document it for any future reader.