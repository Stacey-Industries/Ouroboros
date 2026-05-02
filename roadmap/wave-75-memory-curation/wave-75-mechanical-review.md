# Wave 75 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-75-memory-curation/waveplan-75.md`
- Diff range: `7cd42e2..HEAD` (commits `060c275` Phase A, `798d615` Phase B)
- Graph: **FALLBACK** — `servers.ouroboros.index_status` unavailable in worktree session; all traces use grep + import-following. All Check-1 and Check-3 findings marked `(fallback trace)`.
- Run timestamp: 2026-05-02T23:35:00Z

---

## Check 1: Forward-trace

- Change sites traced: 14 (new exported functions + new IPC registrations)
- Paths reaching production consumer: 13
- Paths flagged as dead: 1

**`export type { MemoryType }` at `src/main/ipc-handlers/memory.ts:112`** (fallback trace)
- Trace: `memory.ts` re-exports `MemoryType` from `memoryWriter.ts` → no non-test importer of this path anywhere in `src/`
- Reason: type-only dead re-export; the renderer obtains `MemoryType` from `electron-memory.d.ts` (separate declaration), not from the IPC handler file. The IPC handler file is never imported by any non-test non-self file for its type exports.
- Phase: B

All other traced paths reach production consumers:
- `writeMemoryEntry` → `ipc-handlers/memory.ts:registerMemoryWrite` → `registerMemoryHandlers` → `ipc.ts` (main entry)
- `deleteMemoryEntry` → `ipc-handlers/memory.ts:registerMemoryDelete` → `registerMemoryHandlers` → `ipc.ts`
- `MemoryItemRow` → `ContextPreview.tsx:PopoverItemList` → `ContextPreviewPopover` → `ContextPreview` → `ComposerContextPreview` → renderer tree
- `EditMemoryModal` / `DeleteMemoryConfirm` → `ContextPreview.tsx:ActiveMemoryModal` → `ContextPreviewPopover` → renderer tree
- `ItemRow`, `isToggleableItem` → `ContextPreview.tsx` + pre-existing consumers in `ContextBuilder`, `FileTree`, `Layout`
- `memory.write` / `memory.delete` preload bridge → `window.electronAPI.memory.write/delete` in `ContextPreviewMemoryModals.tsx`

---

## Check 2: Plan universal-quantifier cross-reference

- Universals found in plan: 2 (engineering-relevant)
- Universals where diff covers all instances: 1
- Universals flagged as narrowed: 1

**Quote:** "each entry shows edit and delete affordances" (plan line 17) and acceptance criterion: "Delete icon button opens confirmation dialog **with text containing 'This cannot be undone'**" (plan line 104)

- **Noun:** confirmation dialog text
- **Instance diff did not match:**
  - `src/renderer/components/AgentChat/ContextPreviewMemoryModals.tsx` — `DeleteMemoryConfirm` body text reads: "This removes the file and its MEMORY.md index line." The phrase **"This cannot be undone"** (required by acceptance criterion) is absent.

**Note on optimistic UI (acceptance criterion line 103):** The plan states "entry shows new content immediately on Save; reverts to prior state if IPC returns failure." The implementation closes the modal on success and relies on watcher-driven re-fetch (option b, per ADR Decision 1). The revert-on-failure path IS implemented (modal stays open, error alert shown). The "immediately shows new content" path is satisfied by the sub-second watcher flicker, not by a local state patch. ADR D1 explicitly chose option (b); the acceptance criterion wording predates the final decision. This is flagged for written justification, not as a structural FAIL.

---

## Check 3: Export audit

- New exports added: 14 (functions, interfaces, type aliases)
- Exports with production consumers: 11
- Exports flagged as dead: 3

**`export interface WriteResult` at `src/main/memory/memoryWriter.ts`** (fallback trace)
- Consumer count: 0 non-test external importers
- Deferral marker: none
- Note: used as the return-type annotation within `memoryWriter.ts` itself (TypeScript structural typing); the renderer uses the separate `MemoryWriteResult` from `electron-memory.d.ts`. Zero runtime impact.
- Phase: B

**`export interface WriteError` at `src/main/memory/memoryWriter.ts`** (fallback trace)
- Consumer count: 0 non-test external importers
- Deferral marker: none
- Note: same as `WriteResult` — internal return-type discriminant used only within the file. Zero runtime impact.
- Phase: B

**`export type { MemoryType }` at `src/main/ipc-handlers/memory.ts:112`** (fallback trace)
- Consumer count: 0 non-test external importers (same finding as Check 1)
- Deferral marker: none
- Phase: B

---

## Verdict

**PASS** (after remediation)

Three flags were raised; all three resolved in the same session before merge:

1. **(Check 2 — missing required text — FIXED)** `DeleteMemoryConfirm` body now reads "This cannot be undone. The file and its MEMORY.md index line will be removed." — acceptance criterion line 104 satisfied.

2. **(Check 3 — dead type exports — FIXED)** `export` removed from `WriteResult` and `WriteError` in `memoryWriter.ts`; both are now file-private internal discriminant types.

3. **(Check 3 — dead type re-export — FIXED)** `export type { MemoryType }` and its now-unused `MemoryType` import removed from `ipc-handlers/memory.ts`.

Post-remediation: ESLint, tsc --noEmit, and 37 targeted tests all pass. No new flags found.
