# Wave 21 — Thread Organization
## Implementation Plan

**Version target:** v1.5.2 (patch)
**Feature flag:** `threads.organization` (default `true` — additive, low-risk)
**Dependencies:** Wave 16 (Session primitive), Wave 20 (Session sidebar)

---

## Phase breakdown

Eight per-commit phases. Each ends with a passing typecheck, lint, targeted tests, and a single commit.

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Thread schema v4 — `tags JSON` column, migration, auto-tag derivation on create/update | `threadStore.ts`, `threadTagger.ts` (new), `threadStoreMigrations.ts` |
| B | FTS5 search + ThreadSearch UI + command palette entry | `threadStoreSearch.ts` (new), `Search/ThreadSearch.tsx` (new), command registry |
| C | Pin/star + soft-delete 30-day grace + archive semantic split | `threadStore.ts`, `sessionStore.ts`, `SessionRow.tsx` actions |
| D | Folders + drag-and-drop between groups in SessionSidebar | `folderStore.ts` (new), `SessionSidebar/FolderTree.tsx` (new) |
| E | Export → markdown / JSON / HTML; Import → JSON/transcript | `threadExport.ts` (new), `threadImport.ts` (new), `ExportThreadDialog.tsx` |
| F | Usage dashboard panel + per-thread cost rollup API | `threadCostRollup.ts` (new), `UsageDashboard/*` (new), `claudeUsagePoller.ts` |
| G | Terminal-to-thread binding + Terminals sub-pane | `pty.ts` (tagging), `TerminalsInThread.tsx` (new) |
| H | Deep-link permalinks `thread://<id>#msg=<id>` + "Go to thread…" palette | `permalinks.ts` (new), command registry |

## Feature flag

`threads.organization` (default `true`) gates the visible UI additions (filter, search, dashboard, folders). Schema migrations always run.

## Acceptance criteria (wave total)

- Auto-tags derive on creation; user override persists.
- Search returns results in < 200 ms on a 1000-thread corpus.
- Pin/archive/delete all behave as specified; soft-delete undo within 30 days works.
- Folder drag-and-drop persists and survives reload.
- Export → import round-trip produces equivalent thread (assertion in test).
- Cost dashboard shows per-thread and total rollups with time-range selection.
- Terminal output surfaces in thread view.
- Permalinks resolve deterministically; copy-permalink on any message works.

## Risks

| Risk | Mitigation |
|------|------------|
| FTS5 availability — varies per SQLite build | Check via `PRAGMA compile_options` at migration time; skip FTS5 table gracefully if unavailable, fall back to LIKE search |
| Schema migration breakage on v3 databases | Follow the existing migration pattern from v1→v2→v3; write a migration test using a v3 fixture |
| Folder drag-and-drop complexity | Use existing `@dnd-kit/core` (already pulled in for Wave 28?) — verify and install if needed |
| Permalink collisions across projects | Prefix with projectRoot basename hash; document the scheme in `permalinks.ts` |
