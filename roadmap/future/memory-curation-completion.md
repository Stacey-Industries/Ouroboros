# Memory curation completion — drill-down + write/delete

**Status:** WAVE-IT — single wave, two phases (Wave 63 follow-up)
**Source:** `roadmap/audit-verification-pass.md` Section D item #17 (Wave 63 deferred items)
**Filed:** 2026-05-01

## Summary

Wave 63 added a chat composer popover that lists memory entries (the auto-memory system per global `~/.claude/CLAUDE.md`). It's read-only. Two deferred items prevent it from being a curation surface:

1. **Inline drill-down preview** — `memory:read` IPC was wired by Wave 63 but nothing consumes it. Users see entry titles in the popover but can't view full content without opening MEMORY.md by hand.
2. **Write/delete IPC + UI** — no path to edit or delete memory entries through the UI. Stale memories require manual filesystem work to remove.

This wave closes both gaps. Memory becomes a first-class curation surface, not just a read-only window.

## Why this matters

Memory is the most "agentic" part of the system — persistent state that affects every future conversation. Per the `feedback_product_philosophy.md` memory ("amplifier not replacement"), giving users direct control over what the agent remembers is core. A read-only window is a half-feature.

This also pairs with the existing memory rule: *"If they ask you to forget something, find and remove the relevant entry."* That's agent-only today. UI curation gives users a parallel path that doesn't require a chat session for routine memory cleanup.

Without this, the memory system slowly accumulates stale entries that the agent keeps acting on. Friction prevents pruning, drift compounds.

## Phase A — Inline drill-down preview

**Backend:** none required. `memory:read({ projectRoot, id })` IPC already exists at `src/main/ipc-handlers/memory.ts:39-50`.

**Renderer scope:**
- Identify the memory-chip render site in the context preview popover (likely `ContextPreview.tsx` or a memory-tab subcomponent — verify during implementation)
- On expand/click, call `window.electronAPI.memory.read({ projectRoot, id })`
- Show full content in a collapsible inline panel (preferred — keeps the popover surface) OR a modal (fallback if inline is too cramped)
- Cache read results in component state to avoid refetching on re-expand within the same popover session
- Loading state during fetch, error state if read fails

~50-80 lines. No new IPC, no main-process work. Near-zero risk.

## Phase B — Write/delete IPC + UI

### Backend (new IPC)

| Channel | Args | Returns |
|---|---|---|
| `memory:write` | `{ projectRoot, id, content, frontmatter }` | `{ success: true, entry }` or failure |
| `memory:delete` | `{ projectRoot, id }` | `{ success: true }` or failure |

**`memory:write` behavior:**
- Validate frontmatter shape against the global CLAUDE.md memory spec (`name`, `description`, `type`)
- Atomic write to disk (write-then-rename, or use `fs.writeFileSync` with explicit fsync if simpler)
- If the entry has a separate `.md` file (per the auto-memory pattern), update that file's content + frontmatter; the index entry in MEMORY.md updates if `description` changes
- Return the updated entry record

**`memory:delete` behavior:**
- Remove the underlying memory `.md` file
- Remove the index entry from MEMORY.md
- Both operations atomic together — partial failure should not leave an orphan
- If the entry doesn't exist, return success (idempotent delete)

### Renderer UI

- **Edit affordance** per entry — probably modal (inline markdown editing is awkward in a small popover surface). Modal contains: name field (read-only or editable per design), description field, type dropdown (`user` | `feedback` | `project` | `reference`), content textarea (markdown). Save button calls `memory:write`; cancel discards.
- **Delete affordance** per entry — small icon button. Confirmation dialog (`Delete memory entry "X"? This cannot be undone.`) before firing `memory:delete`.
- Optimistic UI updates similar to `useConfig` pattern — apply locally, revert on IPC failure.

### Concurrency design (decide during implementation)

The file watcher fires `memory:changed` whenever MEMORY.md or `memory/*.md` changes. The UI writing will trigger that watcher, which triggers a refetch via `useMemoryEntries`. Two patterns to choose from:

- **(a) Suppress own-edit refresh.** Broadcast the changed entry ID with the watcher event; the renderer skips refresh if it just authored the change. Cleaner UX (no flicker). Slightly more main-side complexity.
- **(b) Accept the flicker.** Watcher fires, list refetches, briefly shows the in-flight state, then settles. Simpler. Likely fine for a single-user system.

**Recommendation: ship (b) first** unless flicker is visible enough to be annoying. (a) is a follow-up if real users complain.

Concurrent agent + user writes: agents edit memory via tool calls; users edit via this UI. Both write to the same files. **Last-write-wins** is acceptable for a single-user system. If multi-user becomes relevant (post-OSS), revisit with proper locking or a CRDT-shaped layer.

### Tests

Phase A:
- Renderer test: click memory chip → asserts `memory:read` called with correct args, content displayed

Phase B:
- Main-side: `memory:write` success path, validation failure, atomic-rollback on disk error
- Main-side: `memory:delete` success path, idempotent on missing entry, atomic file + index removal
- Renderer test: edit modal saves → asserts IPC called, UI updates optimistically, watcher refresh doesn't double-render
- Renderer test: delete confirmation → asserts IPC called only after confirm, not on initial click

## Out of scope — explicit list (do NOT pull in scope-creep)

These are documented as out of scope for this wave. Future enhancements, separately filed if/when they become real asks:

- **"Add new memory" UI** — agents create memories via tool calls; users curate. Authoring from scratch through the UI is a different shape (typing markdown into a form, picking the right type, ensuring the entry doesn't conflict with agent conventions). Probably overkill for now. **Keep agents as the primary memory-creation path; this wave is for skim/edit/delete only.**
- **Memory search/filter** — Wave 63 also deferred this. If the inline drill-down lands and the entry list grows large in real usage, search becomes a natural follow-up. Ship without it; revisit if a user surfaces the ask.
- **Bulk operations** ("delete all memories matching X", "export all memories", "import memories from a file") — single-entry first. Bulk is a power-user feature with its own UX considerations.
- **Memory search/relevance scoring inside the popover** — current memory display is a flat list. A "most relevant to current goal" sort could be useful, but that's a different feature and probably belongs in the context-ranker subsystem, not the memory UI.
- **Memory diff / version history** — undo for memory edits is a real need, but solving it well likely requires storing prior versions and a UI to browse them. Out of scope until the basic curation lands.
- **Memory export / import / sharing** — relevant if the project goes multi-user or OSS. Premature for solo use.
- **Concurrency option (a) — own-edit refresh suppression** — see Phase B concurrency section. Ship (b) first; (a) is a follow-up if flicker is annoying.
- **Multi-user concurrent edit handling** — last-write-wins is fine for solo. Revisit when multi-user becomes a real scenario.
- **Edit-the-name field** — depends on whether memory IDs are stable identifiers (probably yes, based on filename → ID derivation). If renames need to cascade through the index, that's its own complexity. Default for this wave: name is read-only in the edit modal; only description / type / content are editable.

## Risks

| Risk | Mitigation |
|---|---|
| `memory:write` corrupts MEMORY.md if validation passes but disk write partially fails | Atomic write-then-rename pattern. On rename failure, original file untouched. |
| Watcher refresh races with own-write, causing UI flicker | Acceptable per concurrency option (b). Promote to (a) if real complaint. |
| Agent edits memory while user has edit modal open → save clobbers agent's changes | Acceptable for solo use; document as known. Could add a "memory changed since you opened this — reload?" check if it becomes a real issue. |
| Delete confirmation dialog is too easily clicked-through | Default copy is firm: *"Delete memory entry 'X'? This cannot be undone."* Don't add a "remember choice" checkbox. |
| Phase B's modal complicates the popover surface | Phase A is independently shippable. If Phase B's UX gets messy, ship A and reconsider B's design before continuing. |

## Connection to existing roadmap

- **Parent wave:** `roadmap/wave-63-popover-tab-coverage.md` (Wave 63 — popover tab coverage). That wave's scope was the read-only popover; this wave completes the curation story.
- **Auto-brief deferral:** `roadmap/auto-briefs/wave-63-result.md:60-61, 102` explicitly deferred both Phase A and Phase B's content to this follow-up.

## References

- `src/main/ipc-handlers/memory.ts` — current memory IPC handlers (`memory:list`, `memory:read`)
- `src/main/memory/memoryReader.ts` — `listMemoryEntries`, `readMemoryEntry` implementations
- `src/main/memory/memoryWatcher.ts` — file watcher
- `src/preload/preloadSupplementalMemoryApis.ts` — preload bridge (will need extension for write/delete)
- `src/renderer/hooks/useMemoryEntries.ts` — current consumer hook
- `src/renderer/types/electron-memory.d.ts` — type definitions
- `~/.claude/CLAUDE.md` — global memory format spec (frontmatter shape, types)
- Audit: `roadmap/audit-verification-pass.md` Section D item #17
- Wave 63 deferred-items list: `roadmap/auto-briefs/wave-63-result.md`
