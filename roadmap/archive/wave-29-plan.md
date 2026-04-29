# Wave 29 — Diff Review, Graph Panel, Hook/Rule Authoring
## Implementation Plan

**Version target:** v1.9.1 (patch)
**Feature flag:** `review.enhanced` (default `true`)
**Dependencies:** Wave 17 (preset engine + slots — `LayoutPreset`, `SlotName`, `componentRegistry`)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Diff review keyboard shortcuts + post-accept rollback — Vim `a`/`r`/`n`/`p` in panel; single-commit undo for last accepted batch stored in reducer | `DiffReviewPanel.tsx`, `diffReviewState.ts`, `useDiffReviewKeyboard.ts` (new), `diffReviewState.ops.ts` |
| B | Change summary export — generate PR-description-draft markdown from accepted hunks; copy-to-clipboard + save-to-file | `DiffReviewPanelSections.tsx`, `diffReviewExport.ts` (new), `DiffReviewPanelState.tsx` |
| C | Graph panel — new `GraphPanel/` directory; zoomable/pan canvas over the existing 1.4K-node graph; level-of-detail viewport culling | `GraphPanel/GraphPanel.tsx` (new), `GraphPanel/GraphCanvas.tsx` (new), `GraphPanel/useGraphLayout.ts` (new), `GraphPanel/GraphPanelTypes.ts` (new), `CentrePaneConnected.tsx` |
| D | Graph integrations — "Why this suggestion" neighbourhood pop-over; blast-radius caller-inclusion offer; `@symbol:` mention IPC channels | `GraphPanel/GraphNeighbourhood.tsx` (new), `graphHandlers.ts`, `electron-graph.d.ts` (new), `MentionAutocomplete.tsx` |
| E | Hook authoring wizard — multi-step form → writes `.claude/settings.json`; JSON-schema validation before save | `HookAuthoring/HookWizard.tsx` (new), `HookAuthoring/HookWizardSteps.tsx` (new), `HookAuthoring/useHookWizard.ts` (new), `HooksSection.tsx` |
| F | Rule authoring wizard — form → writes `.claude/rules/*.md` with frontmatter; live glob-match preview | `RuleAuthoring/RuleWizard.tsx` (new), `RuleAuthoring/useRuleWizard.ts` (new), `RuleAuthoring/GlobPreview.tsx` (new), `HooksSection.tsx` |
| G | Hook event replay — replay inspector: shows last N hook payloads from pipe; replay trigger against current code state | `HookAuthoring/HookReplayPanel.tsx` (new), `HookAuthoring/useHookReplay.ts` (new), `hooksManager.ts`, `graphHandlers.ts` |

**Note on phase B merge:** Phase B (change summary export) is ~60 lines on top of Phase A's panel machinery and depends on Phase A's accepted-hunk list. It stays as a separate phase because it introduces a new file (`diffReviewExport.ts`) and a new IPC write path (save-to-file), which warrants its own commit and review.

**Note on phase D split:** The "Why this suggestion" pop-over and the blast-radius offer are tightly coupled to the graph rendering primitives in Phase C, so D follows immediately after C lands. A further split would require artificial seams.

---

## Feature flag

`review.enhanced` (default `true`). When `false`:

- Keyboard shortcuts in `DiffReviewPanel` are not registered.
- The rollback action button is not rendered.
- Export button is hidden.
- `GraphPanel` lazy import in `CentrePaneConnected.tsx` is short-circuited; the `agent-ide:open-graph-panel` event handler is not wired.
- Hook wizard and Rule wizard launch buttons in `HooksSection.tsx` are hidden; the existing raw add/remove UI remains visible.

Flag is read from `AppConfig` via `config.get('review.enhanced')`. Add the key to `configSchemaTail.ts` under a new `review` namespace (check `configSchemaMiddle.ts` first to confirm namespace availability).

---

## Architecture notes

**Diff review state machine is already per-hunk.** `diffReviewState.ts` fully implements accept/reject per hunk with `HunkDecision` (`pending` / `accepted` / `rejected`) and `useSingleHunkActions`. Phase A adds only: (a) a keyboard handler hook, (b) a rollback action (`ROLLBACK_LAST_BATCH`) that snapshots accepted-hunk refs before each bulk operation and offers one-click revert via `revertPendingEntries`.

**`DiffReviewPanelSections.tsx` is exactly at the 300-line boundary** (skipBlankLines + skipComments ESLint config leaves headroom for now, but Phase A's rollback button additions are at risk). Extract `DiffReviewHeaderActions` into its own file before adding rollback. Phase B's export button follows the same extracted component.

**`HunkView.tsx` is 308 raw lines** — no existing eslint-disable. ESLint `max-lines: 300` is configured with `skipBlankLines: true, skipComments: true`, which is how the file currently passes. Any Phase A keyboard or Phase B export additions touching that file must first extract `buildDisplayLines` and the style-constant block into `hunkViewHelpers.ts`.

**`diffReviewState.ts` is at 266 lines.** Adding the rollback action and batch-snapshot logic in Phase A will push it toward 300 — split `useRollbackAction` into `diffReviewState.rollback.ts` before committing.

**Graph panel rendering** — no existing `GraphPanel/` directory. Uses the existing `graph:searchGraph` and `graph:getArchitecture` IPC channels from `graphHandlers.ts` for data. Render with a `<canvas>` element and a hierarchical or force-directed layout (check if d3-force is already installed; else hand-rolled BFS tree). Phase D adds two new IPC channels: `graph:getNeighbourhood(symbolId, depth)` and `graph:getBlastRadius(symbolId, depth)` — both declared in a new `src/renderer/types/electron-graph.d.ts`, re-exported from `electron.d.ts`.

**Graph panel in `CentrePaneConnected`** — the existing special-view pattern (lazy import, `display:none` toggling, event-driven open) in `CentrePaneConnected.tsx` is the correct integration point. Add `'graph-panel'` to `SpecialViewType`, listen for `agent-ide:open-graph-panel`, lazy-import `GraphPanel`. Extract `useGraphPanelEvents` if the event-map function exceeds the 40-line limit.

**`@symbol:` mention system already exists** — `MentionType` includes `'symbol'`, `buildSymbolMentionResult` formats `@symbol:filePath::name::line` keys. Phase D extends autocomplete to also resolve bare `@symbol:functionName` queries via `graph:searchGraph` and present a disambiguation list when multiple symbols share the name. Additive only — existing key format is unchanged.

**Hook authoring wizard** writes to `.claude/settings.json` via `window.electronAPI.rulesAndSkills.addHook` (or equivalent existing hook write channel — verify). The existing `HooksConfigSubsection.tsx` manages raw add/remove. The wizard is a separate overlay/modal in `HookAuthoring/`; it does not replace the subsection. JSON-schema validation runs client-side using the `HOOK_EVENT_CATEGORIES` catalog already defined in `HooksConfigSubsection.tsx` before any IPC call is made — extract this constant into `hooksEventCategories.ts` rather than duplicating it.

**Rule authoring wizard** calls `window.electronAPI.rulesAndSkills.createRule` / `updateRule`. Existing `rulesDirectoryManager.ts` sanitizes filenames and handles `mkdir -p`. The glob preview uses `minimatch` (already in the dependency tree via chokidar) directly in the renderer — no IPC round-trip needed for live preview.

**Hook event replay (Phase G)** requires a new IPC channel `hooks:getRecentEvents` that returns the last N payloads buffered in `hooks.ts`. A replay trigger sends a synthetic event to the existing hook pipeline. Declare the channel in the relevant preload types.

**ESLint split points to anticipate:**

- `DiffReviewPanelSections.tsx` — at 300 raw lines. Pre-extract `DiffReviewHeaderActions` in Phase A.
- `HunkView.tsx` — 308 raw lines. Extract `hunkViewHelpers.ts` before any additions.
- `diffReviewState.ts` — 266 lines; Phase A rollback additions will exceed 300. Split into `diffReviewState.rollback.ts`.
- `graphHandlers.ts` — Phase D additions will exceed per-function 40-line limit. Extract `registerGraphNeighbourhoodChannels` sub-function.
- `GraphPanel/GraphCanvas.tsx` — layout + viewport culling approaches 300 lines; pre-split into `GraphCanvas.tsx` (rendering) + `useGraphLayout.ts` (layout engine) + `useGraphViewport.ts` (zoom/pan state) from the start.
- `HooksSection.tsx` — 111 lines; Phase E/F each add a wizard-launch button + modal mount. Stays within budget only if wizard modals are separate components.

**Design tokens only** — `GraphPanel` chrome uses `bg-surface-raised`, `border-border-default`. Node fill colors use `var(--interactive-accent)` (functions), `var(--status-info)` (classes), `var(--text-semantic-muted)` (modules). No hex or rgb.

---

## Risks

- **Graph rendering perf on larger repos** — existing graph has ~1.4K nodes; future repos could be larger. Phase C must virtualize offscreen nodes (skip draw for nodes outside viewport bounds) and apply level-of-detail (edges hidden at zoom < 0.3; labels hidden at zoom < 0.5). Measure initial render time on this repo's own graph before shipping. (Flagged in roadmap line 1358.)
- **`DiffReviewPanelSections.tsx` and `HunkView.tsx` at or over line budget** — both require pre-splitting extractions before Phase A or Phase B additions land.
- **Post-accept rollback stale-hunk risk** — if the user edits the file between accepting some hunks and triggering rollback, stored `rawPatch` offsets may no longer match. Fallback: rollback reverts via `git.revertHunk` and surfaces an error toast if the patch fails to apply; review state is left in the last-known decided state rather than silently corrupting.
- **Hook-authoring UI producing invalid config** — JSON-schema validation runs in the wizard before any write is attempted; save button disabled while form is invalid. (Flagged in roadmap line 1359.)
- **`@symbol:functionName` mention conflict with `@symbol:filePath::name::line`** — bare query intercepted in autocomplete before the key is formed; autocomplete calls `graph:searchGraph` and presents disambiguation list when multiple symbols share a name. Existing pinned-item key format unchanged.
- **Shared review-panel framework scope creep** — roadmap bundles these three features for "shared review-panel infrastructure." The existing `CentrePaneConnected` special-view pattern is already that framework; no new `ReviewPanelHost` abstraction is needed.
- **`review.enhanced` flag gates graph panel** — graph panel is architecturally independent of diff review; gating it behind `review.enhanced` is correct per the roadmap but means disabling the flag also hides the graph explorer. Documented coupling.

---

## Acceptance

- Per-hunk accept/reject works; mixed accept/reject produces correct final file state.
- Keyboard shortcuts match spec.
- Graph panel renders the project's ~1.4K-node graph in < 2 s with interactive zoom.
- Hook wizard outputs valid `.claude/settings.json`; rule wizard outputs valid `.md` with frontmatter.
- Blast-radius pin includes callers up to configurable depth (default 2).
- Rollback of last accepted batch reverts all staged hunks; error toast shown if any patch fails to apply cleanly.
- Export produces a Markdown PR-description draft containing a file-change table and accepted hunk summaries.
- Hook event replay replays last stored payload against current code state; result appears in hook status log.
- Feature flag off → keyboard shortcuts not registered, graph panel event not wired, wizard launch buttons not rendered; all existing review and hook UI unchanged.
