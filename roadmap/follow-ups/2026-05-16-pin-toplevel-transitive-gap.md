---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
source: wave-92 Phase 9 (post-push CI failure on macOS)
---

# `pin-toplevel.mjs` does not pin transitive deps — relies on `overrides`

## What surfaced

Wave 92's first push to PR #9 failed CI on macOS with 1077 renderer test failures (`ReferenceError: React is not defined`). Root cause: `vite` was bumped 7.3.1 → 7.3.3 by the Phase 5 lockfile regeneration. Vite is a **transitive** dependency (used by `electron-vite`, `vite-plugin-monaco-editor`, `@vitejs/plugin-react`, etc.); not declared in Agent IDE's `package.json` top-level. `pin-toplevel.mjs` only pins entries in `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies` — transitives are not pinned.

Fix applied: added `"vite": "7.3.1"` to `overrides` in `package.json`, re-ran `lockfile:sync`. Lockfile now pins vite to 7.3.1 across all consumers. macOS CI green expected.

## The structural gap

ADR Decision 3 ("preserve currently-resolved versions, not freshness") is enforced ONLY for top-level deps. Transitive minors and patches CAN drift during a from-scratch regen. The Contractor-App `stripe`/`recharts` anti-pattern this design was meant to prevent applies primarily to top-level — but transitive drift can be just as damaging (vite was a load-bearing JSX transform regression).

## Options for the next wave

1. **Status quo + use overrides reactively.** When a transitive bump bites, pin via `overrides`. Cheap, but the regression-detection is post-hoc — CI fail before we know.

2. **Snapshot-pin transitives via overrides at regen time.** Extend `pin-toplevel.mjs` to ALSO read the current lockfile's transitive resolutions and write a sweeping `overrides` block that pins every package to its current resolved version. Heavy: `overrides` is meant for surgical pinning, not bulk; bloated package.json; loses meaningful semver intent.

3. **Diff-and-warn after regen.** Add a `scripts/lockfile-drift-check.mjs` that compares the new lockfile against the old and prints/fails on any version change >= patch. Surface drift loudly; let the human decide which to override. Doesn't prevent drift but makes it visible BEFORE push.

4. **Migrate to pnpm.** `pnpm install` honors `package.json` versions more strictly and exposes finer-grained controls. Meta-spec already names this as the fallback if WSL2 proves too heavy; same fallback would apply if the lockfile-drift problem becomes recurring.

## Recommendation

Option 3 (drift-and-warn). Cheap to implement (~40-line script comparing lockfile JSON), doesn't change generation semantics, surfaces the class of bug that bit Wave 92 BEFORE push. Pairs naturally with the existing pre-push guard — the guard catches "wrong-tool regen," the drift-checker catches "right-tool but unintended drift."

Not in scope for Wave 92's wrap (this is the symptom that surfaced AT wrap).

## Vendor-gotcha to add

The lesson for `wsl2-lockgen.md` (next wave touching it): `pin-toplevel` is necessary but not sufficient. Transitives can drift between regens; budget for an override pin on any package that surfaces a regression mid-CI.
