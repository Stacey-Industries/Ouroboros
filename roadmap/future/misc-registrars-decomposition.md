# Decompose `miscRegistrars.ts` by domain (audit A8)

**Status:** TODO — tech-debt wave
**Source:** `roadmap/audit-verification-pass.md` Section A8; inline TODO at `src/main/ipc-handlers/miscRegistrars.ts:1-3`
**Filed:** 2026-05-02 — A8 closeout

## What's wrong

`src/main/ipc-handlers/miscRegistrars.ts` is 336 lines and registers IPC channels for ~10 unrelated domains: updater, cost, usage, crash logs, perf, shell history, symbols, approval, window, extensions. The file violates the 300-line ESLint cap (currently grandfathered) and forces unrelated changes to share commit history.

The inline TODO at the top of the file is the spec: extract each domain to its own named handler file.

## Suggested split

Group by namespace to match the rest of `src/main/ipc-handlers/`:

| Extracted file | Channels |
|---|---|
| `updaterHandlers.ts` | `updater:*` |
| `costHandlers.ts` | `cost:*` |
| `usageHandlers.ts` | `usage:*` |
| `crashHandlers.ts` | `crash:*`, `app:openCrashLogDir` |
| `shellHistoryHandlers.ts` | `shellHistory:*` |
| `symbolHandlers.ts` | `symbols:*` |
| `approvalHandlers.ts` | `approval:*` |
| `windowHandlers.ts` | `window:*` |
| `extensionHandlers.ts` | `extensions:*` (the live one — not the dropped `shell:openExtensionsFolder`) |

`miscRegistrars.ts` itself can either:
- (A) Be deleted, with `misc.ts` directly importing the new registrars
- (B) Stay as a thin barrel that re-exports the new registrars (lower-churn for callers)

Recommend (A) — the indirection is the whole problem; keeping a barrel preserves the smell.

## Acceptance

- Each new file under 300 lines, no ESLint disable comments needed
- `misc.ts` imports the named registrars directly (or each domain's registrar is mounted from `ipc.ts` if the domain warrants top-level visibility)
- All existing IPC channels remain registered — verify with `channelCatalog.read.ts` / `channelCatalog.desktopOnly.ts` (the audit's coverage tests)
- No behavioral change

## Sequencing

This is a mechanical refactor. Each domain extraction is its own commit; do them one at a time and verify the relevant feature still works (e.g. after extracting `updaterHandlers.ts`, click the "Check for updates" path).

Estimated effort: ~2 hours if batched. Each domain extraction is ~15-20 minutes.

## What NOT to pull in

- **Channel renaming** — the IPC contract stays intact; this is a file-shape refactor
- **Handler logic changes** — pure move; if a handler has a bug, fix it in a separate commit
- **Adding new domains** — out of scope; this clears the path for future per-domain registrars but doesn't add any

## References

- TODO: `src/main/ipc-handlers/miscRegistrars.ts:1-3`
- Pattern reference: `src/main/ipc-handlers/CLAUDE.md` ("Registration Pattern")
- Audit: `roadmap/audit-verification-pass.md` Section A8
