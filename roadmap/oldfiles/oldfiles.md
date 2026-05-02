# Old Files at Repo Root — Removal Candidates

**Generated:** 2026-05-01.
**Method:** Direct depth-1 listing of `C:\Web App\Agent IDE\` root. Files only (no directories). Cross-referenced against `.gitignore` and recent build output.
**Action:** None taken — this is a candidate list. Verify before removing; some look like accidental check-ins of gitignored files.

---

## Likely-dead — high confidence

| File | Size | Why |
|---|---:|---|
| `electron.vite.config.1773455369021.mjs` | 1.5 KB | Timestamped compiled copy of `electron.vite.config.ts` from a past build run (2026-03-25); not referenced anywhere. |
| `electron.vite.config.1773461758663.mjs` | 1.5 KB | Second timestamped copy of the same; same status. |
| `tmp_monitor.py` | 2.6 KB | One-shot Python subagent-transcript monitor with hardcoded agent ID; no `npm run` entry, no consumer. Plain scratch file. |
| `tsconfig.web.tsbuildinfo` | 387 KB | TypeScript incremental build info. `*.tsbuildinfo` is in `.gitignore` (line 17) but the file was checked in / left in the working tree. |
| `vitest-results.json` | 1.3 MB | Vitest CI/run output. Gitignored (line 96) but present in working tree. Not referenced at runtime. |
| `.lint-report.json` | 525 KB | Output from a one-off lint `--format json` run; check `.gitignore` — likely should be ignored. Not referenced at runtime. |
| `codebase-graph.db` | 7.4 MB | Wave 60 manual-cleanup follow-up explicitly flagged this: "orphan `codebase-graph.db*` files (7.7 MB + WAL/SHM) — safe to delete, not auto-removed." |
| `codebase-graph.db-shm` | 32 KB | Companion SQLite shared-memory file for the orphan DB above. |
| `codebase-graph.db-wal` | 4.1 MB | Companion SQLite write-ahead log for the orphan DB above. |

**Total reclaimable: ~13.7 MB** (codebase-graph trio dominates).

## Uncertain — confirm before removing

| File | Size | Note |
|---|---:|---|
| `THIRD_PARTY_LICENSES` | 331 KB | Standard for Electron distributions; likely build-generated for `electron-builder`. Verify whether `npm run dist` regenerates it before deletion — keep if it ships in the installer. |
| `AGENTS.md` | 2.7 KB | Sibling to `CLAUDE.md`. Some dev tools (Codex, OpenAI agents, etc.) read this convention. Likely intentional — check if any tooling references it before removing. |
| `capacitor.config.ts` | 1 KB | Capacitor config for the mobile (Android/iOS) build path. Per project memory, mobile is Wave 33+ work; check if currently in use. |

## Notes & gotchas

- **Wave 60 cleanup pointer**: `roadmap/wave-53k-followup-autosync.md` already documents the `codebase-graph.db*` triplet as a known orphan. This file confirms — they are still present at the time of this audit.
- **Gitignored-but-checked-in files** (`tsconfig.web.tsbuildinfo`, `vitest-results.json`, possibly `.lint-report.json`) suggest the working tree was once committed before the gitignore entries were added, or someone force-added them. `git rm --cached <file>` will untrack without deleting from disk.
- **Timestamped `.mjs` files** are characteristic of `electron-vite` writing to a temp output that wasn't cleaned. Safe to delete; rebuild produces fresh ones if needed.
- **DO NOT remove**: `.editorconfig`, `.env`, `.env.example`, `.gitignore`, `.mcp.json`, `.npmrc`, `.prettierignore`, `.prettierrc`, `package.json`, `package-lock.json`, `README.md`, `CLAUDE.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `tsconfig*.json` (the `.json` files, NOT `.tsbuildinfo`), `vite*.config.ts`, `electron.vite.config.ts`, `eslint.config.mjs`, `knip.config.ts`, `playwright.config.ts`, `postcss.config.js`, `vitest.config.ts`, `vitest.setup.ts` — all canonical project files.
