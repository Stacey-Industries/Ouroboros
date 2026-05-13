---
status: DRAFT
created: 2026-05-13
target_wave: TBD (M-naming recommended — infra-only, no version bump)
estimated_effort: 2-3 hours
---

# Wave Doc Migration — Agent IDE (Ouroboros)

## Goal

Apply the standardized documentation framework (`~/.claude/notes/documentation-framework.md`) to Agent IDE. Trim `roadmap/session-handoff.md` to ~300-500 words by extracting wave history into a one-line-per-wave index. Align this project's documentation structure with Gamify and Contractor App for cross-project consistency.

## Why

`roadmap/session-handoff.md` is multi-section, with Wave 47 / 53b / 53a / 51 / 50 / 40 follow-up sections + Wave 58+ smoke gate + 2026-05-13 test-discipline section, accumulating verbatim. Per the framework spec: orientation documents should be 300-500 words evergreen. This wave applies the standard.

This is also the project most-recently active (waves through 86+), so wave history is the densest. Indexing it cleanly pays dividends for every future session.

## Required reading before starting

1. `~/.claude/notes/documentation-framework.md` — the spec this wave applies. Read end-to-end.
2. `~/.claude/notes/wave-process.md` — wave structural rules (if `/wave-plan` is used).
3. `roadmap/session-handoff.md` — read end-to-end (fits in one Read with reasonable limits).
4. Skim `roadmap/archive/` (the existing archive folder) — many archived wave folders are here.

## Scope

**Files to create:**
- `roadmap/_index-history.md` — one-line entries for every shipped wave (Wave 15 through Wave 86+ + Pipeline Hardening M-waves + recent Wave 58+ work)
- `roadmap/decisions/index.md` — one-line entries for any existing durable ADRs in `roadmap/decisions/` (if folder doesn't exist or is empty, create with note that wave-scoped decisions live in each wave folder)
- `roadmap/_archived/index.md` — one-line entries for every folder in existing `roadmap/archive/` (renamed convention applies — see notes below)

**Files to rename (decisions confirmed 2026-05-13 — this pattern is canon across all projects):**
- `roadmap/session-handoff.md` → `roadmap/HANDOFF.md` via `git mv` (preserves history). Update all references in `CLAUDE.md`, `.claude/rules/`, slash commands, and any cross-project workspace docs.
- `roadmap/_README.md` → `roadmap/README.md` via `git mv`. Update references.
- `roadmap/archive/` → `roadmap/_archived/` via `git mv` (also covered in the archive section below).

**Files to modify (post-rename):**
- New `HANDOFF.md` content: lean rewrite using the framework template — current next-action / in-flight / blockers / critical context only.
- `CLAUDE.md` (root) — update "How to pick up wave work" pointer to `roadmap/HANDOFF.md` (the new name); mention `_index-history.md` for history discovery. Don't blow whatever line cap is in effect (this project may not have `lint:claude-md` wired; treat 200 lines as soft target).

**Existing directory rename (confirmed canon):**
- `roadmap/archive/` → `roadmap/_archived/` via `git mv` (preserves history). Per Cole's 2026-05-13 canon decision, all three projects use `_archived/` (leading underscore). Update references in CLAUDE.md, `.claude/rules/`, slash commands, or other docs pointing to `roadmap/archive/`.

After the rename, build `roadmap/_archived/index.md` — one line per archived wave folder (many wave folders are already in `archive/` and just need indexing).

**Wave 58+ smoke gate section:**
- Currently in `session-handoff.md` as a section. This is reference content, not state. Consider extracting to `docs/manual-smoke-gate.md` or `roadmap/_index-process.md`. Or fold the template into `~/.claude/rules/manual-smoke-gate.md`. Decision: leave in session-handoff for this wave; address smoke-gate placement as a separate follow-up.

## Phase breakdown (suggested)

This is the most substantive of the three project migrations due to wave depth. `/wave-plan` is reasonable to use.

### Phase 0 — Survey

- Read `session-handoff.md` end-to-end with offset/limit
- Read top of each Wave-N-followups section (Wave 47 / 53b / 53a / 51 / 50 / 40)
- Walk `roadmap/archive/` directory: list all wave folders present
- Identify which waves have prose summaries inlined in session-handoff vs which only have folder presence
- Check for wave folders post-Wave-40 not in archive (Wave 41-86+ should be somewhere — verify path)

### Phase 1 — Build wave history index

Create `roadmap/_index-history.md`:

```
| Wave | Topic | Shipped | Squash | Result brief |
```

For each wave with a result brief: include the link.
For each wave with only a folder (no result brief): include path to folder and note "no result brief" in the topic column.
Preserve chronological order (newest first).

Expected scope: Wave 15 (Context Injection Baseline) through Wave 86+ (recent chat-orchestration work) + Pipeline Hardening M-1, M-4 + Wave M-1/M-4 + recent test-discipline framework work.

Gaps to expect: very early waves (pre-Wave-15) may not have folders; just note in index as "pre-Wave-15 (historical baseline)" without folder links.

### Phase 2 — Lean rewrite session-handoff (and consider rename)

Decision point upfront: rename `session-handoff.md` to `HANDOFF.md` for cross-project consistency? Recommended yes; consequences:
- Update CLAUDE.md pointer reference
- Update any rules in `.claude/rules/` or global rules that reference the path
- Update any slash command or skill that hard-codes the path

Apply lean template content. Keep only:
- Last updated date, active wave/work
- Next action (currently: what's the next pickup? Per the Wave 58+ section context, possibly Wave 59+ work or test-discipline framework adoption)
- In-flight (currently in-progress wave work, if any)
- Blockers (anything user-owed)
- Critical context (project-specific gotchas not in CLAUDE.md — e.g., the dispatch-reflex async-block, the codebase-graph at ~18.3K nodes, "two event systems" gotcha, etc.)
- How to find history (pointers)

Target: 300-500 words.

### Phase 3 — Rename archive directory + build _archived index

If renaming `archive/` to `_archived/`:
1. `git mv roadmap/archive roadmap/_archived` (preserves history)
2. Create `roadmap/_archived/index.md` with one row per archived wave folder
3. Search-and-update any references to `roadmap/archive/` in: CLAUDE.md, `.claude/rules/*`, root-level docs

### Phase 4 — Build decisions/index

- If `roadmap/decisions/` exists: create `decisions/index.md` listing all ADRs
- If `roadmap/decisions/` doesn't exist: create the folder + `index.md` with header noting "Wave-scoped ADRs live in each `wave-{N}-{slug}/wave-{N}-decisions.md`; no durable cross-wave ADRs filed yet"

### Phase 5 — Pointer adjustments

- `CLAUDE.md` — update pickup-wave-work pointer to reference new HANDOFF.md (if renamed); mention `_index-history.md` for history
- `roadmap/README.md` (rename `_README.md` if doing the convention alignment) — update taxonomy section
- Search `.claude/rules/` for any references to `roadmap/archive/` or `session-handoff.md`; update

### Phase 6 — Verify

Cold-read test on new HANDOFF.md. 30-second orientation check.

Also verify:
- `_index-history.md` has every wave (compare to old session-handoff sections + archive folder contents)
- All renamed paths are consistent (no orphan references to `session-handoff.md` or `archive/`)
- `_archived/index.md` is complete

## Acceptance criteria

- [ ] `roadmap/HANDOFF.md` (renamed from session-handoff.md) ≤ 800 words (target 300-500)
- [ ] `roadmap/_index-history.md` exists with one row per shipped wave
- [ ] `roadmap/_archived/index.md` exists (or convention-aligned alternative documented in roadmap/README.md)
- [ ] `roadmap/decisions/index.md` exists
- [ ] If renames happened: all references updated (grep for old paths returns nothing in CLAUDE.md and `.claude/rules/`)
- [ ] Fresh-session cold-read passes the 30-second orientation test
- [ ] CLAUDE.md remains within line cap (if a cap is set; this project may not have `lint:claude-md` wired)
- [ ] All wave folder paths preserved (no folders deleted)

## Dependencies

- **Hard:** `~/.claude/notes/documentation-framework.md` must exist. Created 2026-05-13.
- **Soft:** none. Independent of any current wave work. Can run in parallel session from any branch.

## Rollback

Mostly trivial — markdown changes can be `git reset --hard`. The `git mv` of archive to _archived is more disruptive but reversible via `git mv` back.

## Notes specific to Agent IDE

- Codebase graph is indexed (~18.3K nodes / ~13.2K edges) — agent should use `search_graph` / `trace_call_path` for any cross-reference work during this wave, NOT grep. Per `~/.claude/rules/graph-tool-routing.md`.
- This project has subdirectory CLAUDE.md files (e.g., `src/renderer/CLAUDE.md`, `src/renderer/components/Layout/CLAUDE.md`). Don't touch them in this wave — they're Layer 2 reference and stable.
- The Wave 58+ smoke gate section in current session-handoff is reference content (checklist template). Decision in this wave: leave it where it is, OR extract to a separate `docs/manual-smoke-gate-checklist.md`. Recommendation: extract; that's reference, not state.
- Old "session-handoff.md" filename has been stable for a long time. Renaming is a small disruption but worth it for cross-project consistency. Document the rename clearly so anyone with bookmarks/local refs sees the new name.
- This project uses `master` branch (not `main`). Verify the rename is on `master`.

## Recommended wave naming

Suggest `Pipeline Hardening M-N-doc-migration` (use whatever the next M-number is — probably M-5 or M-6 given M-1 and M-4 shipped). Final decision is the orchestrator's at planning time.

## Out of scope

- Restructuring subdirectory CLAUDE.md files
- Changes to `docs/` directory contents
- Any code changes (no `src/` modifications)
- Adding `CHANGELOG.md` (separate decision; this project doesn't have one)
- Resolving the Electron adapter refactor follow-up (`2026-05-13-electron-adapter-refactor-stryker.md`) — that's its own dedicated wave
