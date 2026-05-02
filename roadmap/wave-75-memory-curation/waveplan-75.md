# Wave 75 — Memory curation: inline drill-down + write/delete

## Status

DRAFT · target v{TBD} · drafted 2026-05-02.

## Context — why this wave exists

Wave 63 added a chat composer context preview popover that surfaces a `memory` tab listing Claude auto-memory entries for the active project. Those entries are read-only: users can see entry titles but cannot read full content without opening `~/.claude/projects/.../memory/MEMORY.md` by hand, and cannot edit or delete stale entries without filesystem work outside the app.

Two IPC channels were wired by Wave 63 but neither is consumed by any renderer component: `memory:read` at `src/main/ipc-handlers/memory.ts:39-50` fetches a single entry's content, and the file watcher at `src/main/memory/memoryWatcher.ts` already re-broadcasts `memory:changed` on any change. The type contract exists in `src/renderer/types/electron-memory.d.ts` and the preload bridge in `src/preload/preloadSupplementalMemoryApis.ts`. No write or delete path exists anywhere in the stack.

Memory is the most "agentic" part of the system — stale entries affect every future conversation. A UI that shows titles but offers no path to read, edit, or prune is a half-feature: it invites trust in the system while offering no way to maintain it.

## Goal

After this wave the memory tab in the context preview popover supports inline drill-down (clicking an entry expands its full markdown content in the same popover view), and each entry shows edit and delete affordances: an edit modal lets the user change description, type, and content of an existing entry; a delete button with a confirmation dialog removes the entry file and its index line from MEMORY.md. Two new IPC handlers (`memory:write`, `memory:delete`) are added to the main process with atomic disk semantics. The entry name field is read-only; own-edit watcher flicker is accepted (option b).

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-75-memory-curation/wave-75-decisions.md`.

1. Ship concurrency option (b): accept watcher-driven flicker on own-write; do NOT implement own-edit refresh suppression (option a) — too much main-process complexity for a single-user system where flicker is acceptable.
2. Entry name (the id / filename stem) is read-only in the edit modal; only description, type, and content are editable. Renames require cascading the index entry, which is out of scope for this wave.
3. `memory:write` uses atomic write-then-rename (temp file → `fs.rename`) so a partial disk failure leaves the original file untouched.
4. `memory:delete` is idempotent: if the entry file is already absent, return `{ success: true }` without error.
5. Optimistic UI: editor saves and deletes update local state immediately and revert on IPC failure.
6. Phase A (drill-down) is independently shippable and commits separately before Phase B begins.

## Scope

**In scope:**

- Phase A — Inline drill-down: clicking an entry row in the memory tab expands a collapsible panel showing the full `.md` file content. Uses existing `memory:read` IPC. Content cached per-session in component state. Loading and error states.
- Phase B backend — `memory:write` IPC handler: validates frontmatter shape (`name`, `description`, `type`), atomically rewrites the entry file, updates the matching MEMORY.md index line if description changes. Returns updated entry.
- Phase B backend — `memory:delete` IPC handler: removes the entry `.md` file and its MEMORY.md index line atomically. Idempotent on missing file.
- Phase B renderer — Edit modal per entry: modal with read-only name field, editable description field, type dropdown (`user | feedback | project | reference`), content textarea. Save calls `memory:write`; cancel discards. Optimistic update.
- Phase B renderer — Delete per entry: small icon button, confirmation dialog ("Delete memory entry 'X'? This cannot be undone."), IPC call on confirm only.
- Type contract additions: `MemoryWriteArgs`, `MemoryWriteResult`, `MemoryDeleteArgs`, `MemoryDeleteResult` in `electron-memory.d.ts`; `write` and `delete` methods on `MemoryAPI`.
- Preload bridge extension: `memory.write` and `memory.delete` IPC relays in `preloadSupplementalMemoryApis.ts`.
- Tests: Phase A renderer test (click → `memory:read` called, content displayed); Phase B main-side tests (write success, validation failure, atomic rollback on disk error; delete success, idempotent, atomic file+index); Phase B renderer tests (edit modal save → IPC called, optimistic update; delete confirm → IPC only after confirm).

**Out of scope:**

- "Add new memory" UI — agents are the primary creation path; authoring from scratch through the UI is a different shape.
- Memory search/filter — Wave 63 also deferred this; ship without it.
- Bulk operations — single-entry first.
- Memory relevance scoring / sorting inside the popover.
- Memory diff/version history — revisit when basic curation lands.
- Memory export/import/sharing.
- Concurrency option (a) — own-edit refresh suppression — deferred per decision 1.
- Edit-the-name field (rename) — deferred per decision 2; cascading the index entry is its own complexity.
- Multi-user concurrent edit handling — last-write-wins is fine for solo use.

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| A | Inline drill-down preview | sonnet-implementer | Renderer only. On entry expand/click, call `window.electronAPI.memory.read({ projectRoot, id })`. Show full content in a collapsible inline panel inside the popover memory tab. Cache read results in component state. Loading + error states. No IPC changes. Commit independently before Phase B. |
| B | write/delete IPC + edit modal + delete confirmation | sonnet-implementer | Two sub-parts that commit together: (B1) main-process handlers `memory:write` and `memory:delete` in `src/main/ipc-handlers/memory.ts`; helper functions in `src/main/memory/memoryWriter.ts` (new file); type/preload additions; (B2) renderer edit modal component and delete confirm dialog wired into the memory tab rows. Atomic write-then-rename pattern. Optimistic UI. |
| C | Tests | haiku-test-author | Targeted vitest tests per spec: Phase A renderer mock test; Phase B main-side write/delete unit tests; Phase B renderer modal tests. No full suite run — parent wave runs that at wrap. |
| D | Wave wrap | orchestrator | Full lint, typecheck, full test suite, `/review` mechanical gap-check, result brief. Smoke deferred to user per lead directive. |

### Phase ordering

A → B → C → D (strictly sequential).

Phase A is independently shippable and must commit before Phase B begins. If Phase B's UX proves awkward, the plan allows shipping Phase A alone and reconsidering.

```
A ──► B ──► C ──► D
```

## Risks

| Risk | Mitigation |
|---|---|
| `memory:write` partial disk failure corrupts MEMORY.md | Atomic write-then-rename: write to `<file>.tmp`, `fs.rename` to final path. On rename failure, original file untouched. |
| Watcher refresh races with own-write, causing UI flicker | Accepted per decision 1 (option b). Promote to option (a) only if user files a complaint. |
| Agent edits memory while user has edit modal open → save clobbers agent's changes | Documented as known limitation for solo use. Could add "changed since you opened this" check as a follow-up. |
| `memory:delete` removes the file but fails to patch MEMORY.md (or vice versa) | Both operations in a single helper; on MEMORY.md patch failure, log warning but still return success (orphan index entry is cosmetically wrong but not data-loss). Revisit if the patch proves unreliable. |
| Edit modal complicates the popover surface | Phase A ships first independently; if Phase B UX is unacceptable, ship A alone and reconsider B's design. |
| `id` validation bypass in write/delete paths | Same path-traversal guard as `readMemoryEntry`: reject if id contains `/`, `\`, or `..`; verify resolved path stays within memDir. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | Renderer mock test: click entry → asserts `memory:read` called with correct args, content displayed, cached on re-expand | n/a | Renderer-only; no IPC changes to integration-test |
| B | Main: `memory:write` success, validation failure, atomic rollback; `memory:delete` success, idempotent, index patch | Main: write + watcher triggers `memory:changed` | Renderer mock tests: edit modal save → IPC called + optimistic update; delete confirm → IPC only on confirm |
| C | n/a — this IS the test phase | n/a | Tests authored here; coverage gates are the tests themselves |
| D | n/a | n/a | Full suite run at wrap |

## Acceptance criteria

- [ ] Clicking (or expanding) a memory entry row in the popover's Memory tab calls `window.electronAPI.memory.read` with the correct `{ projectRoot, id }` args and renders the returned content in-place.
- [ ] Re-expanding the same entry within the same popover session does NOT call `memory:read` again (content is cached).
- [ ] A loading indicator appears while `memory:read` is in-flight; an error state appears if it fails.
- [ ] `memory:write` IPC handler exists at `src/main/ipc-handlers/memory.ts`, accepts `{ projectRoot, id, content, frontmatter: { description, type } }`, writes atomically (temp → rename), updates MEMORY.md index line if description changes, returns `{ success: true, entry }`.
- [ ] `memory:write` validates `type` is one of `user | feedback | project | reference`; returns `{ success: false, error: '...' }` on invalid input without touching disk.
- [ ] `memory:delete` IPC handler exists, removes the entry `.md` file and its MEMORY.md bullet, returns `{ success: true }` even if the file was already absent.
- [ ] Edit modal opens on edit-icon click, shows read-only name, editable description, type dropdown, content textarea; Save calls `memory:write`; Cancel closes without IPC call.
- [ ] Optimistic update: entry shows new content immediately on Save; reverts to prior state if IPC returns failure.
- [ ] Delete icon button opens confirmation dialog with text containing "This cannot be undone"; IPC `memory:delete` is NOT called until user confirms.
- [ ] `electron-memory.d.ts` declares `MemoryWriteArgs`, `MemoryWriteResult`, `MemoryDeleteArgs`, `MemoryDeleteResult`, and updated `MemoryAPI` with `write` and `delete` methods.
- [ ] Preload bridge (`preloadSupplementalMemoryApis.ts`) wires `memory.write` and `memory.delete`.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] ESLint passes with no new errors on touched files.

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| A | Memory tab in the context preview popover (opened via the strip above the chat composer) | Click entry row in memory tab → component calls `window.electronAPI.memory.read` → preload relays to `ipcMain.handle('memory:read')` → `readMemoryEntry` reads file → result returns to renderer → component renders content inline | User opens the popover, switches to the Memory tab, clicks an entry — the entry expands to show the full markdown content of that memory file inline in the popover, without opening any external file |
| B | Edit modal and delete confirmation dialog in the memory tab rows (same popover surface) | Click edit icon → modal mounts; Save → `memory.write` IPC → `memoryWriter.writeMemoryEntry` → temp file write → `fs.rename` → watcher fires `memory:changed` → `useMemoryEntries` refetches → UI settles; Delete icon → confirmation dialog; confirm → `memory.delete` IPC → `memoryWriter.deleteMemoryEntry` → file deleted + MEMORY.md patched → watcher fires → list refreshes | User clicks edit on an entry, changes the description and type in the modal, clicks Save — the modal closes, the entry row immediately shows the new description (optimistic), then the list briefly flickers as the watcher refetch settles; clicking delete on an entry and confirming causes that entry to disappear from the list |
| C | Internal — no observation point | n/a | Tests are authored in this phase; no user-facing behavior changes |
| D | Internal — no observation point | n/a | Wrap-up: lint/typecheck/suite/review pass gates |

### Data-shape probes

```ts
// After Phase B, main-process unit test verifies:
// 1. write success: temp file is gone, final .md exists with new content
// 2. rollback: if fs.rename throws, original file is unchanged
// 3. delete: .md file absent after delete, MEMORY.md no longer contains the bullet

// After Phase B renderer test verifies:
// 4. edit modal calls memory.write with correct args on save
// 5. delete confirmation: memory.delete not called before user confirms
```

## Files the next agent should read first

1. `roadmap/wave-75-memory-curation/waveplan-75.md` — this plan
2. `roadmap/wave-75-memory-curation/wave-75-decisions.md` — ADR (decisions locked above)
3. `roadmap/future/memory-curation-completion.md` — original feature spec (scope, risks, out-of-scope list)
4. `src/main/ipc-handlers/memory.ts` — existing `memory:list` and `memory:read` handlers to extend
5. `src/main/memory/memoryReader.ts` — `listMemoryEntries`, `readMemoryEntry`, `getProjectMemoryDir`, `sanitizeCwd` — the write helpers will follow the same patterns
6. `src/main/memory/memoryWatcher.ts` — watcher (no changes needed, but understand the broadcast contract)
7. `src/renderer/hooks/useMemoryEntries.ts` — the renderer hook the memory tab consumes
8. `src/renderer/types/electron-memory.d.ts` — current type contract (needs write/delete additions)
9. `src/preload/preloadSupplementalMemoryApis.ts` — preload bridge (needs write/delete relays)
10. `src/renderer/components/AgentChat/ContextPreview.tsx` — the popover where the memory tab renders (Phase A entry point)

## Note to the implementer

This wave closes the two deferred items from Wave 63: drill-down and write/delete. Phase A is deliberately low-risk — it uses only existing IPC and renderer state. Implement and commit Phase A before touching Phase B.

The two major temptations to resist: (1) adding "create new memory" UI — agents create memories, users curate. The wave is edit/delete only. (2) implementing own-edit refresh suppression (option a) — the lead has explicitly chosen option (b); accept the watcher flicker and move on.

For Phase B's atomic write, use a temp file in the same directory (so `fs.rename` is a same-filesystem move): write to `<id>.md.tmp` first, then `fs.rename` to `<id>.md`. If rename throws, the `.tmp` file can be cleaned up on next write attempt but the original is untouched.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. Verify `roadmap/wave-75-memory-curation/wave-75-decisions.md` exists and contains the locked decisions enumerated above.
2. **Phase A** — dispatch `sonnet-implementer`. Brief: renderer-only drill-down in the memory tab. Files to touch: `src/renderer/components/AgentChat/ContextPreview.tsx` (or wherever the memory tab row renders — verify first). Gate: expanded entry shows full file content, loading state visible, caching confirmed by no second IPC call on re-expand.
3. After Phase A completes: run `npx eslint` on touched files, `npx tsc --noEmit`, targeted renderer tests. Review Phase A diff before proceeding.
4. **Phase B** — dispatch `sonnet-implementer`. Brief: new `src/main/memory/memoryWriter.ts` with `writeMemoryEntry` and `deleteMemoryEntry`; extend `src/main/ipc-handlers/memory.ts` with `memory:write` and `memory:delete` handlers; extend type contract and preload; add edit modal and delete confirmation to the memory tab renderer. Gate: edit modal opens, saves via IPC, optimistic update visible, reverts on failure; delete confirm dialog appears before IPC call.
5. After Phase B: run lint on touched files, `npx tsc --noEmit`, targeted tests (main-side and renderer). Review Phase B diff before proceeding.
6. **Phase C** — dispatch `haiku-test-author`. Brief: write targeted vitest tests per the Test coverage section. Gate: tests pass (`npx vitest run <touched-test-files>`).
7. **Phase D** — orchestrator runs wrap-up: full `npm test`, `npx eslint src/`, `npx tsc --noEmit`, `/review` mechanical gap-check. Produce result brief at `roadmap/wave-75-memory-curation/wave-75-auto-brief.md`. Smoke deferred to user per lead directive. Do NOT push until `/review` returns PASS or all flags addressed.
