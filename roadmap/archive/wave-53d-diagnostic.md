# Wave 53d — Phase B: Auto-Inject Root-Cause Diagnostic

**Date:** 2026-04-28
**Investigator:** sonnet-diagnostician (Phase B)
**Status:** Root cause confirmed from code reading + live runtime checks. No runtime instrumentation required.

---

## Executive Summary

The `mcpServers.ouroboros` entry is absent from `.claude/settings.json` because
`removeFromProjectSettings` is called unconditionally in `stopInternalMcp()`, which
runs every time the IDE closes (via the `window-all-closed` handler). Auto-inject
writes the entry on startup; `removeFromProjectSettings` erases it on every clean
shutdown. Because the IDE was not running at audit time, the state observed was
the post-shutdown state: settings cleaned, server port dead. This is **Hypothesis 1
confirmed**.

---

## Call-Site Inventory

### `injectIntoProjectSettings` call sites

| File | Line | Context |
|------|------|---------|
| `src/main/main.ts` | 117 | `useMcpHost === true` branch — `await injectIntoProjectSettings(workspaceRoot, res.port, inject)` |
| `src/main/main.ts` | 123 | Standard SSE path — `await injectIntoProjectSettings(workspaceRoot, handle.port, inject)` |

Both calls are inside `startInternalMcp()` at `main.ts:101-124`, which is invoked
from `startBackgroundServices()` at `main.ts:149`, which is invoked from
`initWindowsAndServices()` at `main.ts:249`.

**Gate check:** `startInternalMcp()` returns early at line 102 if
`getConfigValue('internalMcpEnabled')` is falsy. The persisted electron-store value
for this key is `true` (verified in
`C:\Users\coles\AppData\Roaming\ouroboros\config.json` line 1306). The gate is not
the problem.

**`defaultProjectRoot` check:** `startInternalMcp()` also returns early at lines
104-107 if `defaultProjectRoot` is absent. The persisted value is
`"C:\\Web App\\Agent IDE"` (config.json line 6). This gate is also clear.

### `removeFromProjectSettings` call sites

| File | Line | Context |
|------|------|---------|
| `src/main/main.ts` | 130 | Inside `stopInternalMcp()`, called unconditionally when `workspaceRoot` is non-null |

`stopInternalMcp()` is called from **one place**: the `window-all-closed` handler
at `main.ts:299`.

```
app.on('window-all-closed', async () => {
  ...
  await stopInternalMcp();   // line 299
  ...
  if (process.platform !== 'darwin') app.quit();
});
```

There is **no other call site** for `removeFromProjectSettings` in the codebase.
`windowManager.ts` does not call it. `mainShutdown.ts` (`performWillQuitShutdown`)
does not call it. The `will-quit` handler does not call it.

---

## Lifecycle Walkthrough

```
IDE launches
  -> app.whenReady() -> initializeApplication()
  -> initWindowsAndServices()
  -> startBackgroundServices(mainWindow)
  -> startInternalMcp()                        [main.ts:149]
      -> getConfigValue('internalMcpEnabled')  -> true  OK
      -> getConfigValue('defaultProjectRoot')  -> "C:\Web App\Agent IDE"  OK
      -> startInternalMcpServer({port: 0})     -> binds on random port, e.g. 54321
      -> injectIntoProjectSettings(root, 54321, {transport:'sse'})
          -> writes .claude/settings.json:
              { mcpServers: { ouroboros: { url: "http://127.0.0.1:54321/sse" } } }

User works in IDE ...
  [.claude/settings.json has mcpServers.ouroboros PRESENT]
  [Any Claude Code session started now WOULD see the tools]

User closes the IDE window(s)
  -> 'window-all-closed' fires
  -> stopInternalMcp()                         [main.ts:299]
      -> removeFromProjectSettings(root)       [main.ts:130]
          -> deletes mcpServers.ouroboros
          -> if mcpServers now empty: deletes mcpServers key entirely
          -> atomicWriteJson() -> .claude/settings.json now has NO mcpServers block
      -> clearInternalMcpPort()
      -> handle.stop()  -> HTTP server closed, port 54321 freed

[.claude/settings.json has NO mcpServers block -- this is the state observed at audit]
[Port 54321 is no longer listening -- connection refused]
```

This explains both audit observations simultaneously:
1. Port dead — server stopped when window closed.
2. `mcpServers` absent — removed by `removeFromProjectSettings` on every clean shutdown.

---

## Hypothesis Verdicts

### Hypothesis 1: `removeFromProjectSettings` runs on shutdown — CONFIRMED

**Evidence:** `stopInternalMcp()` at `main.ts:126-140` calls
`removeFromProjectSettings(workspaceRoot)` unconditionally (only guard: workspaceRoot
is non-null, which it always is when the server was started). `stopInternalMcp()`
is called from the `window-all-closed` handler at `main.ts:299` on every IDE exit.

This is the root cause. The auto-inject is working correctly; the cleanup is
over-aggressive. The intent was presumably to avoid stale port entries after the
IDE exits — but the removal is unconditional, so it erases the entry even though
the user will relaunch the IDE momentarily.

### Hypothesis 2: `internalMcpEnabled === false` in persisted config — REFUTED

**Evidence:** `C:\Users\coles\AppData\Roaming\ouroboros\config.json` line 1306
shows `"internalMcpEnabled": true`. The schema default is also `true`
(`configSchemaTail.ts:229`). This flag is not the problem.

### Hypothesis 3: Port collision / bind failure — REFUTED

**Evidence:** `startInternalMcpServer` uses `port: 0` (random OS assignment),
which virtually eliminates collision. The server resolves the actual port only
after `server.listen` succeeds — if binding had failed, the rejected promise would
bubble through `runStartupStep` and be logged as `'[main] failed to start internal
MCP server:'`. No such failure mode is indicated. Additionally, the `useMcpHost`
flag is `false` in persisted config (config.json line 1317), so the mcpHost code
path is not in play.

### Hypothesis 4: Multi-window race overwriting each other — REFUTED

**Evidence:** `injectIntoProjectSettings` and `removeFromProjectSettings` are only
called from `startInternalMcp()` and `stopInternalMcp()` in `main.ts`, not from
per-window lifecycle handlers. `windowManager.ts` has no calls to either function.
There is exactly one MCP server per IDE process (module-level `internalMcpStop`
reference at `main.ts:70`). Multi-window race is architecturally impossible.

### Hypothesis 5: `removeFromProjectSettings` called when last project root closes — REFUTED

**Evidence:** `windowManager.ts`'s `setupWindowCloseHandler` at line 183 calls
`releaseContextLayer` and `releaseGraphController` on window close, but does NOT
call `removeFromProjectSettings`. The only call site remains `main.ts:130`.

---

## Secondary Finding: Injection Scope vs. Startup Injection Are Separate Systems

There are two distinct injection mechanisms:

1. **Startup injection** (`injectIntoProjectSettings` in `main.ts`) — writes the
   SSE URL into `.claude/settings.json` so any Claude Code session in that
   directory discovers the server. This is what is broken by the cleanup.

2. **Per-spawn injection** (`internalMcpScope` / `scopedMcpConfig.ts`) — adds
   `--mcp-config` flags when the IDE orchestrator spawns a Claude Code process.
   Gated by `internalMcpScope` (value: `"task-gated"` in persisted config). This
   path is separate and is NOT broken — it affects IDE-orchestrated spawns only.

External terminal sessions (the user opening a terminal and running `claude`)
rely exclusively on path 1. Path 1 is broken by the cleanup. Path 2 has no
effect on external terminals regardless.

---

## Live Runtime State (at time of investigation)

- **IDE process:** Not running (no Electron process visible in `tasklist`).
- **Any MCP port on 127.0.0.1:** No localhost ports listening (netstat confirms).
- **`.claude/settings.json`:** No `mcpServers` block — consistent with post-shutdown state.
- **`~/.claude/settings.json`:** No `mcpServers` block. No shadow config.
- **Persisted config:** `internalMcpEnabled: true`, `defaultProjectRoot: "C:\Web App\Agent IDE"`,
  `internalMcp.transport: "sse"`, `useMcpHost: false`. All flags favorable.

---

## Root Cause Statement

`removeFromProjectSettings` is called unconditionally in `stopInternalMcp()`
at `src/main/main.ts:130`, which runs on every `window-all-closed` event
(`main.ts:299`). This erases `mcpServers.ouroboros` from `.claude/settings.json`
on every clean IDE shutdown. Auto-inject correctly writes the entry at startup,
but external Claude Code sessions launched after the IDE has been closed find
no entry. Sessions launched while the IDE is running also find no entry if
they read `settings.json` before the async startup injection completes.

---

## Phase C Recommendation

**Scope:** Small targeted fix — one to two lines in `src/main/main.ts`.

**Fix direction:** Remove the `removeFromProjectSettings` call from
`stopInternalMcp()`. The cleanup was intended to avoid stale port URLs
surviving between reboots, but that problem is already solved: the next
`startInternalMcp()` call upserts the entry (overwrites the old port with
the new random port). Removing the cleanup means `.claude/settings.json`
retains the last known URL when the IDE is not running. That URL will be
stale (port no longer bound), so Claude Code will fail to connect — but
that is identical to the current behavior of having no entry at all. The
entry becomes live again when the IDE restarts.

**No runtime instrumentation needed.** Root cause confirmed from static analysis
and persisted config verification.

---

## Appendix: Key File:Line References

| Claim | File:Line |
|-------|-----------|
| `startInternalMcp()` — `internalMcpEnabled` gate | `src/main/main.ts:102` |
| `startInternalMcp()` — `defaultProjectRoot` gate | `src/main/main.ts:103-107` |
| `injectIntoProjectSettings` call (SSE path) | `src/main/main.ts:123` |
| `stopInternalMcp()` definition | `src/main/main.ts:126-140` |
| `removeFromProjectSettings` call | `src/main/main.ts:130` |
| `window-all-closed` fires `stopInternalMcp()` | `src/main/main.ts:289-303` |
| `internalMcpEnabled` schema default (`true`) | `src/main/configSchemaTail.ts:228-231` |
| `internalMcpEnabled` persisted value (`true`) | `C:\Users\coles\AppData\Roaming\ouroboros\config.json:1306` |
| `defaultProjectRoot` persisted value | `C:\Users\coles\AppData\Roaming\ouroboros\config.json:6` |
| `removeFromProjectSettings` implementation | `src/main/internalMcp/internalMcpAutoInject.ts:149-191` |
| `windowManager.ts` close handler (no remove call) | `src/main/windowManager.ts:183-203` |
| `mainShutdown.ts` (no remove call) | `src/main/mainShutdown.ts:59-69` |
