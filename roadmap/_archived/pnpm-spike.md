# pnpm Spike — Wave 16 Phase C

**Status:** Deferred (documented result — keep npm, revisit post-Wave 16)
**Owner:** Author
**Date:** 2026-04-15

## Question

Can the project's native-addon stack (`better-sqlite3`, `node-pty`, `electron-rebuild`) operate under pnpm's nested `node_modules` model with the efficiency gains needed for per-session worktrees (Wave 16)?

## Why it matters

Wave 16 lets each Session have its own git worktree. Under npm, each worktree needs its own `node_modules/` install — `better-sqlite3` and `node-pty` are native modules compiled against Electron's Node ABI, and each worktree is a full directory checkout. Twenty worktrees × ~500 MB `node_modules` each = ~10 GB of duplicated installs, plus a `electron-rebuild` cycle per worktree.

pnpm's content-addressable store (`~/.local/share/pnpm/store/v3`) deduplicates packages across installs. Under pnpm, N worktrees share one package copy via hardlinks. If it works with the native modules, the disk + rebuild cost of parallel sessions drops dramatically.

## Decision: Defer the migration

### Risks identified

1. **CI matrix rebuild.** `.github/workflows/ci.yml` is configured for `npm ci` + `npm install better-sqlite3` into `/tmp/sqlite-fresh`. Migration requires rewriting the workflow and re-validating on Ubuntu.
2. **Electron-specific native-module quirks.** `electron-rebuild` has historically been tested against npm's flat `node_modules`. pnpm's nested/hardlinked layout has known edge cases with native modules on Windows (our primary dev platform). Reports in 2025 are mixed — some projects report success, others hit rebuild failures on Windows with node-gyp.
3. **Breaking-change blast radius.** A pnpm migration touches `package.json` `engines`, scripts, lockfile, `.npmrc`, CI workflow, and possibly `vite.config.ts` resolution for the `better-sqlite3` sqlite-fresh alias. Non-trivial revert if issues surface mid-Wave-16.
4. **No user pressure yet.** Wave 16 ships with `sessions.worktreePerSession` default-off. User is the sole developer. They can manually manage `node_modules` symlinks per worktree (see workaround below) without migration risk.

### Workaround for worktree `node_modules`

For users who opt in to `sessions.worktreePerSession = true` and want a fresh worktree to find `node_modules`:

```bash
# From the worktree root (.ouroboros/worktrees/<session-id>/):
cd .ouroboros/worktrees/<session-id>
mklink /J node_modules ..\..\..\node_modules   # Windows junction
# or
ln -s ../../../node_modules node_modules         # Unix symlink
```

The junction/symlink shares the main project's `node_modules`, so `better-sqlite3` and `node-pty` native builds are inherited. This keeps dev latency low without risking the framework migration.

A future `worktreeManager.linkNodeModules(worktreePath)` helper can automate this. Deferred until a user asks for it.

## When to revisit

- If `sessions.worktreePerSession` flips to default-on (Wave 16 + 1 release soak) AND disk-usage telemetry shows users hitting the 5 GB warn threshold frequently → run the spike.
- If the user opts into 5+ concurrent worktrees as a regular workflow → run the spike.
- If pnpm-Electron compat tooling improves measurably (track `electron-rebuild` + pnpm issue trackers).

## Spike reference (for future revisit)

When running the spike:

1. Branch off master, run `pnpm install` in a fresh checkout.
2. Verify `node_modules/better-sqlite3/build/Release/better_sqlite3.node` exists and loads in Electron (run the app's storage migration path).
3. Verify `node_modules/node-pty/build/Release/pty.node` loads in the main process (spawn a terminal).
4. Run `electron-rebuild -f -w better-sqlite3 node-pty` and confirm both rebuild cleanly under pnpm's nested layout.
5. Run the full test suite with `pnpm test`.
6. If all green → migrate CI workflow, `package.json`, and lockfile. If any step fails → document the failure mode and keep this deferral note.

## Outcome for Wave 16

- Phase C commits this deferral note.
- Phase D proceeds under npm.
- Wave 16 ships with the manual symlink workaround documented in the User Guide (added in Wave 20 when the session sidebar surfaces worktree UI).
