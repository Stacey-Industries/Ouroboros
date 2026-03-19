<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
Three patterns worth noting in this module:

1. **`buildContextBuilderModel()` as a pure assembler** — it's a plain function, not a hook. This is a deliberate boundary: hooks handle effects/subscriptions, the builder just shapes data. This makes the public `ContextBuilderModel` interface stable even if internal hook structure changes.
2. **`useContextRegeneration` vs `useContextScan`** — two separate hooks serve different lifecycles. `useContextScan` is imperative (returns a callable). `useContextRegeneration` is declarative (fires on `options` change). Keeping them separate avoids a tangled effect that tries to do both.
3. **`ContextSelectionModel` uses `"group::item"` composite keys** in a `Set<string>` rather than nested Maps. Simple, serializable, and avoids reference equality issues with object keys.
   `─────────────────────────────────────────────────`

The CLAUDE.md has been written. Here's what the new version adds over the old:

- **`ContextSelectionModel` is optional** — documents the `null` case when no `contextSelection` config is passed (previously undocumented)
- **Initial scan on mount** — explains the `useContextBuilderScanLifecycle` effect fires exactly once, clarifying the dependency chain
- **State bundling rationale** — explains why `useContextBuilderState` exists as a separate helper
- Merged the duplicate manual/auto sections into one authoritative document
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# ContextBuilder — Project context scanner and CLAUDE.md generator

Scans a project directory, generates structured context (commands, structure, deps), and lets users edit/export the result as a CLAUDE.md file or system prompt injected into Claude CLI settings.

## Key Files

| File                                | Role                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextBuilder.tsx`                | Entry point — wires `useContextBuilderModel` to `ContextBuilderView`. Props: `projectRoot`, `onClose`, optional `contextSelection`.                                 |
| `ContextBuilderView.tsx`            | Layout shell — Header + Body in a flex column. Adds `onClose` to the model spread.                                                                                  |
| `ContextBuilderHeader.tsx`          | Title bar with scanning indicator, timed status badge, and close button.                                                                                            |
| `ContextBuilderBody.tsx`            | Main content — option toggles, project info badges, directory structure tree, generated context editor.                                                             |
| `ContextBuilderPrimitives.tsx`      | Local design system — shared `React.CSSProperties` objects and small presentational components (`Badge`, `ActionButton`, `Section`, `ErrorBanner`, `LoadingState`). |
| `ContextSelectionSection.tsx`       | Grouped checkbox UI for selecting context items. Driven by `ContextSelectionModel`.                                                                                 |
| `GeneratedContextSection.tsx`       | Editable textarea for generated content + action buttons (copy, create/update CLAUDE.md, set system prompt, rescan).                                                |
| `useContextBuilderModel.ts`         | All state and actions. Orchestrates scan lifecycle, option toggling, clipboard, file writes, and system prompt injection.                                           |
| `useContextBuilderModel.helpers.ts` | `useContextBuilderState` (all `useState` calls bundled) and `useTimedStatus` (auto-clearing status messages).                                                       |
| `useContextSelectionModel.ts`       | Standalone selection model — groups of items with toggle/selectAll/clearAll. Uses `Set<string>` keyed by `"group::item"`.                                           |
| `index.ts`                          | Barrel — exports `ContextBuilder`, model types, and `ContextSelectionSection`.                                                                                      |

## Architecture

**Model-view split**: `ContextBuilder.tsx` calls `useContextBuilderModel()` and passes the entire model to `ContextBuilderView` via spread. View components receive sliced props — no component manages its own data-fetching or side effects.

**Hook composition**: The model hook assembles focused sub-hooks (`useContextScan`, `useContextRegeneration`, `useCopyToClipboardAction`, `useCreateClaudeMdAction`, etc.), each returning a single stable callback. `buildContextBuilderModel()` maps internal state + actions into the public `ContextBuilderModel` interface.

**State bundling**: `useContextBuilderState` in `.helpers.ts` co-locates all `useState` calls so the main model hook stays readable. `useTimedStatus` encapsulates the auto-clear timer with a ref-based cleanup.

## IPC Calls

| Action            | Channel                                  | Notes                                                      |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Scan project      | `context.generate(projectRoot, options)` | Returns `{ success, context, content, error }`             |
| Create CLAUDE.md  | `files.createFile(path, content)`        | Path built by `getClaudeMdPath()` — backslashes normalized |
| Update CLAUDE.md  | `files.saveFile(path, content)`          | Same path                                                  |
| Set system prompt | `config.get/set('claudeCliSettings')`    | Writes to `appendSystemPrompt` field                       |

## Patterns & Conventions

- **Inline styles, not Tailwind** — all styling uses `React.CSSProperties` objects in `ContextBuilderPrimitives.tsx`. This is intentional; the component is self-contained and doesn't depend on Tailwind class scanning. Colors still reference CSS custom properties (`var(--bg)`, `var(--text)`, `var(--border)`, `var(--accent)`).
- **Options auto-regenerate** — toggling `includeCommands`/`includeStructure`/`includeDeps` fires `useContextRegeneration` via `useEffect` dependency on `options`. Effect has a cancellation flag (`let cancelled = false`) to discard stale results.
- **Timed status messages** — `useTimedStatus` returns `[message, showStatus(msg, durationMs?)]`. Auto-clears after 2s by default; CLAUDE.md write actions use 3s.
- **`ContextSelectionModel` is optional** — callers pass `contextSelection?: ContextSelectionConfig`. If absent, `contextSelection` in the model is `null` and `ContextSelectionSection` is not rendered.

## Gotchas

- **Path normalization**: `getClaudeMdPath()` replaces backslashes with forward slashes. Required because `projectRoot` may be a Windows path — do not inline this logic elsewhere.
- **Rapid option toggling** queues multiple IPC calls — each toggle cancels the prior effect but still fires a new `context.generate`. No debounce exists; only the last non-cancelled result is applied.
- **`handleCreateClaudeMd` requires a completed scan** — early-returns if `context` is null. Disable the button in UI when `context === null` (i.e. before first scan completes).
- **`handleResetEdits`** is an inline arrow in `buildContextBuilderModel`, not a hook. It closes over `generatedContent` at build time — don't extract it as `useCallback` without adding `generatedContent` as a dependency.
- **Initial scan on mount**: `useContextBuilderScanLifecycle` calls `void runScan()` in a `useEffect` with `[runScan]` dep. Since `runScan` is a `useCallback` stable across renders, this fires exactly once on mount.
