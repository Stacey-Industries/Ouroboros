# Wave 78 ADR — Settings Partial Wiring Fixes

## Decision 1: webAccessPassword presence indicator

**Context:** The password field stores the value to SecureKeyStore via `interceptSecrets`. The renderer never sees the real value (sanitized to `''`). We need the renderer to know if a password is set without receiving the value.

**Options considered:**
- *Industry standard:* Dedicated IPC query (`config:hasWebPassword`) that calls `hasSecureKey('web-access-password')` — returns `boolean`. No value leakage.
- *Emerging:* Push event on every config save — overkill for a presence-only badge.
- *Experimental:* Store a separate `webAccessPasswordSet: boolean` in plain config — defeats the point of SecureKeyStore.

**Pick:** Dedicated `config:hasWebPassword` IPC channel — industry standard.

**Rationale:** Minimal surface. No value leakage. The renderer polls once on mount and after each save.

**Consequences:** Need to add channel to `ConfigAPI` type, register handler in `config.ts`, bridge in preload, and update `GeneralWebAccessSubsection` to call it.

---

## Decision 2: useMcpHost gating

**Context:** The old `mcpHost/` utility-process was deleted in Wave 60. The `useMcpHost` config flag has no reader. The remaining "MCP host launch path" is `injectStandaloneMcpEntry` in `main.ts`.

**Pick:** Gate `injectStandaloneMcpEntry` on `getConfigValue('useMcpHost')`. When false, log and return early.

**Rationale:** Gives the toggle a real, user-observable effect (MCP tools unavailable in Claude Code when off). Semantics align with the flag's original intent (control whether the IDE's MCP server is active).

**Consequences:** Toggling off disables Ouroboros MCP tool injection. Users who rely on graph tools must keep this on (which is the default: `false` in schema, but the flag already exists for those who want it).

Wait — the schema default is `false`. That means by default the toggle is OFF and MCP would never inject. That's wrong for existing users.

Re-check: `configSchemaTail.ts` line 260-263: `useMcpHost: { type: 'boolean', default: false }`. And `internalMcpEnabled` also gates injection (line 108 of main.ts). The two flags serve different purposes:
- `internalMcpEnabled` = master kill switch
- `useMcpHost` = originally "use utility-process variant vs in-process server" (Wave 3B)

Since the utility-process variant is gone, `useMcpHost=true` meant "use the utility-process MCP host". The correct semantic now: if `useMcpHost=true`, use the MCP host (which is the standalone). If `false` (default), don't inject. But that would break everyone with the default.

**Revised pick:** Gate the injection on `useMcpHost` only when the flag is explicitly set to false AND the user has changed it. Since changing default behavior is risky, the safest fix: make the gate `useMcpHost !== false || getConfigValue('internalMcpEnabled')`. Actually the simplest correct interpretation: the toggle in Settings Developer Flags shows "MCP Host" — toggling it OFF should disable injection. The current default `false` means the toggle is OFF by default, which currently has no effect (injection still runs). Making the toggle actually gate injection would break existing users.

**Final decision:** Add a check: if `getConfigValue('useMcpHost') === false` AND the flag was explicitly set to false by the user (i.e. not just the schema default), skip injection. Since we can't distinguish schema-default from user-set-false in electron-store, we'll use the `internalMcpEnabled` as the gating flag and make `useMcpHost` an additive gate only when `true`:

Actually simplest correct fix: Make `useMcpHost=false` skip injection only when the setting page's Developer Flags toggle has been explicitly turned off. The way electron-store works, we can't distinguish default from explicit. So: **change the gate to: if `!getConfigValue('useMcpHost')` skip, BUT change the default to `true`** to preserve existing behavior.

**Final pick (revised):** Change `useMcpHost` default to `true` in `configSchemaTail.ts`, then add `if (!getConfigValue('useMcpHost')) return` at the top of `injectStandaloneMcpEntry`. This preserves behavior for existing users (they get `true` by schema default) and makes the toggle functional.

**Rationale:** Changing default from `false` to `true` is safe because existing users have `internalMcpEnabled=true` already gating it, and the new `useMcpHost` gate only adds a second check. New installs will have `useMcpHost=true`, preserving MCP injection.

**Consequences:** `configSchemaTail.ts` default changes from `false` to `true`. Wave 71 and prior code that assumed `false` default won't break — the flag had no reader before.

---

## Decision 3: modelSlots.claudeMdGeneration wiring

**Context:** `spawnClaude` in `claudeMdGeneratorSupport.ts` takes `model` string and hardcodes `env: { ...process.env, OUROBOROS_INTERNAL: '1' }`. The `buildProviderEnv('claudeMdGeneration')` call in `ptyEnv.ts` returns env vars for the slot's configured provider (baseUrl, apiKey, model).

**Pick:** Extend `spawnClaude` to accept an optional `extraEnv` parameter. In `claudeMdGenerator.ts:generateForDirectory`, call `buildProviderEnv('claudeMdGeneration')` and pass it as `extraEnv`. If the slot is unconfigured, `buildProviderEnv` returns `{}` (harmless).

**Rationale:** Minimal change. The slot env overlay pattern is already used by `buildShellEnv` and `ptySpawn`. No new abstractions needed.

**Consequences:** `spawnClaude` signature gains optional 4th parameter. All callers still compile (optional parameter).

---

## Decision 4+5: usageExport config persistence

**Context:** `UsageExportPane` has local state only. The time window resets to '24h' and the output path regenerates a timestamped filename on every open.

**Pick:** Add `usageExport` object key to `configSchemaTailExt2.ts` with:
- `defaultWindow: string` (enum '24h'|'7d'|'30d'|'all', default '24h')
- `lastDir: string` (default '')

Read both on mount, persist on export success. The output path field pre-fills with `{lastDir}/{timestamp}.jsonl` when `lastDir` is non-empty.

**Rationale:** Object grouping under `usageExport` is clean and mirrors the existing `ecosystem.lastExport` pattern. Using the config store (not a separate IPC) keeps it consistent with other small-preference persistence patterns.

**Consequences:** `AppConfig` type gains `usageExport?: { defaultWindow?: string; lastDir?: string }`. `UsageExportPane` needs `window.electronAPI.config.get('usageExport')` on mount and `window.electronAPI.config.set('usageExport', ...)` on export success.
