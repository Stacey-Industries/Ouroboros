# Wave 75 — Architecture Decision Record

## Decision 1: Concurrency option (b) — accept watcher-driven flicker

**Context:** When the user edits or deletes a memory entry via the new UI, the file watcher fires `memory:changed`, which triggers `useMemoryEntries` to refetch. Two patterns were evaluated: (a) suppress own-edit refresh by broadcasting the changed entry ID with the watcher event and having the renderer skip refresh if it just authored the change; (b) accept the brief flicker and let the list refetch normally.

**Options considered:**
- *Industry standard:* Optimistic UI + accept server-reconciliation flicker (option b). Used in most single-user desktop apps where reconciliation latency is low and the flicker is sub-second.
- *Emerging best practice:* Own-edit suppression (option a) — broadcast a "writer ID" or "change token" with watcher events so the originating renderer can skip the refetch. Cleaner UX but requires main-process plumbing.
- *Experimental:* CRDT-shaped layer for true conflict-free concurrent edits — overkill for single-user.

**Pick:** Option (b) — accept flicker. Industry standard for solo-use apps.

**Rationale:** This is a single-user system; the flicker is sub-second and acceptable. Option (a) adds main-process complexity (tracking which renderer originated the write, threading a token through the watcher broadcast) for a UX improvement that real users haven't complained about yet. Per lead directive, ship (b) first; promote to (a) only if a complaint surfaces.

**Consequences:** Any own-edit write will cause a brief list flicker as the watcher fires and refetches. Acceptable for v1. Option (a) remains a documented follow-up path.

---

## Decision 2: Entry name (id) is read-only in the edit modal

**Context:** Memory entry IDs are derived from the underlying filename stem (e.g., `user_role.md` → `id: "user_role"`). The MEMORY.md index references entries by filename. Renaming requires: (1) rename the file, (2) update the MEMORY.md bullet's link text AND href. The cascading update is its own complexity.

**Options considered:**
- *Simple:* Allow editing description, type, and content only. Name field is read-only.
- *Complete:* Allow renaming, cascading file rename + index update atomically.

**Pick:** Read-only name. Simple.

**Rationale:** Renames need cascading index updates and risk orphaning the entry if either step fails. The curation need (prune stale entries, update content) doesn't require rename. If a user wants a different name, delete and let the agent re-create.

**Consequences:** Users cannot rename entries through the UI. Acceptable for v1.

---

## Decision 3: Atomic write-then-rename for memory:write

**Context:** `memory:write` rewrites an existing entry's `.md` file. If the write is interrupted mid-stream (power loss, process kill), a partial file on disk would corrupt the entry.

**Options considered:**
- *Industry standard:* Write to `<file>.tmp` in same directory, then `fs.rename`. Same-filesystem rename is atomic on POSIX and near-atomic on Windows (NTFS). If rename fails, original is untouched; `.tmp` is cleaned up on next write.
- *Simple (risky):* `fs.writeFileSync` directly to target. Non-atomic — partial write possible.
- *Heavy:* explicit `fsync` before rename for full durability on power loss.

**Pick:** Write-then-rename (temp file → `fs.rename`). Industry standard.

**Rationale:** Temp-then-rename is the standard safe-file-write pattern. It's simple, no additional dependencies, protects the original on failure. fsync adds overhead and isn't needed for this use case (memory entries are cached locally; losing the last second of writes is acceptable).

**Consequences:** A `.tmp` file may be left on disk if the process dies between write and rename. Cleanup on next write attempt is sufficient.

---

## Decision 4: memory:delete is idempotent

**Context:** If the user deletes an entry that the agent has already removed (or that was never fully created), returning an error is surprising and unhelpful.

**Pick:** Return `{ success: true }` on missing file. Idempotent delete.

**Rationale:** Standard pattern for DELETE semantics. The post-condition is "entry doesn't exist" — if it already didn't exist, the goal is achieved.

**Consequences:** No error surfaced to the user if they double-delete or delete an already-absent entry. This is the desired behavior.

---

## Decision 5: Optimistic UI for write/delete

**Context:** IPC round-trips add latency. Waiting for `memory:write` or `memory:delete` to confirm before updating the UI causes a visible lag and a "flash of old state."

**Pick:** Optimistic update — apply changes locally immediately; revert on IPC failure.

**Rationale:** Matches the `useConfig` pattern already in use in this codebase. Single-user system; IPC failures are rare. The optimistic path is the happy path.

**Consequences:** If IPC fails (disk error, permissions issue), the UI briefly shows the "new" state before reverting. The revert must be implemented to avoid permanently showing stale state on failure.
