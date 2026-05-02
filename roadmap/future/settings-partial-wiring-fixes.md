# Settings panel partial-wiring fixes (audit C)

**Status:** TODO — small focused wave
**Source:** `roadmap/audit-verification-pass.md` Section C (Parts A + B); `roadmap/settings/settings-audit.md`
**Filed:** 2026-05-01 — VERIFIED-PARTIAL items from the settings audit that need real feature work, not cleanup deletes

## What's in scope

These are settings whose UI exists and accepts input but whose backend behavior is incomplete or missing. Each delivers a small, user-visible improvement.

### Part A — General through Agent Profiles

| # | Item | Gap | Effort | User-visible win |
|---|---|---|---|---|
| 1 | `webAccessPassword` UI feedback | Write path complete; no indicator showing "password is set". User has no way to confirm without retyping. | Small — read SecureKeyStore presence + show a "✓ password set" badge | "Did my password actually save?" answered at a glance |
| 2 | `useMcpHost` main-process gating | Schema, UI, storage all wired; no `getConfigValue('useMcpHost')` check in the MCP host launch path. Toggle does nothing. | Small — insert one config read + early return | The toggle actually toggles |
| 3 | `modelSlots.claudeMdGeneration` wiring | 4 slots in the schema; this is the only one not consumed by `buildProviderEnv()`. CLAUDE.md generation always uses the default model regardless of slot setting. | Small — pass `'claudeMdGeneration'` slot key into the CLAUDE.md generation spawn helper | Per-purpose model selection works for the 4th slot |

### Part B — Files through Accounts

| # | Item | Gap | Effort | User-visible win |
|---|---|---|---|---|
| 4 | Export Usage / time window default | Component-local state; resets to '24h' each open. No persistence key. | Small — add `usageExport.defaultWindow` config key + read on mount | "I always export 7d" preference is honored |
| 5 | Export Usage / output path | Auto-generates timestamped filename each open; `lastExportInfo()` partially mitigates by showing the previous path. | Small — add `usageExport.lastDir` (or persist directory + suggest filename) | Repeated exports go to the same folder |

### KEEP — not a gap

- **`routerSettings.layer3Enabled`** — Stub correctly labeled "Reserved for the future async fallback layer." The current sync router doesn't use Layer 3; the toggle is a deliberate future-intent stub. UI is correct.
- **CodeMode / MCP server names input** — Component-local state that resets each open is by-design for one-shot provisioning. Only flip to persistent if a user reports needing pre-fill (filed as INVESTIGATE-FURTHER in the audit).

## Sequencing

These are independent and can ship in any order. Recommended bundling:

- **Bundle A (wiring fixes):** items 1, 2, 3 — all backend gaps that the UI already implies are working. Ship as one wave; each is <30 lines of code.
- **Bundle B (persistence fixes):** items 4, 5 — both are Export Usage UX improvements. One wave.

Estimated effort: ~half a day per bundle.

## Why this is its own wave (vs inline cleanup)

The 2026-05-01 audit triage handled deletes (dead code, dead config keys, stale CLAUDE.mds). These five items add behavior, not remove it — each is a small feature implementation that needs its own commit history. Inline cleanup commits should not introduce new behavior.

## References

- Audit: `roadmap/audit-verification-pass.md` Section C1, C2 (the source-of-truth recommendation tables)
- Source audit: `roadmap/settings/settings-audit.md` (per-tab analysis)
- For the false-positive bypass-draft pattern context: `roadmap/audit-verification-pass.md` Cross-cutting theme #5 (8 components were misread by the original audit; verification reclassified them as fully wired)
