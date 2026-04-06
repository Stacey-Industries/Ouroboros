<!-- claude-md-auto:start -->
Now I have enough to write a precise CLAUDE.md.

# Orchestration — Task Composer & Session Monitor

UI panel for composing, launching, and inspecting orchestration tasks. Connects the renderer to `window.electronAPI.orchestration.*` IPC calls. Displays a four-tab view: overview, context packet, verification results, and session history.

## Key Files

| File | Role |
|---|---|
| `OrchestrationPanel.tsx` | Public entry point — thin shell, delegates to `OrchestrationPanelContent` |
| `OrchestrationPanelContent.tsx` | Orchestrates tab state + model; switches between empty/loaded layouts |
| `OrchestrationPanelContent.parts.tsx` | Renders the loaded layout: tab bar routing and per-tab pane switching |
| `OrchestrationPanelSections.tsx` | Shared section components (header, tab bar, overview content, badges) |
| `OrchestrationPanelSections.parts.tsx` | Sub-parts for overview tab (task state body, session memory lists) |
| `OrchestrationTaskComposer.tsx` | Task creation form shell — goal, mode, provider, verification profile |
| `OrchestrationTaskComposer.parts.tsx` | Form field UI parts (inputs, selects, action row) |
| `useOrchestrationTaskComposerModel.ts` | Model hook: preview context → create task → start task lifecycle |
| `useOrchestrationModel.ts` | Thin re-export of `model/useOrchestrationModelCore` — do not edit for behavior changes |
| `useOrchestrationModel.helpers.ts` | Pure helpers: session sorting/merging, error normalizing, API guard |
| `ContextPreview.tsx` | Context tab — displays ranked files + metrics for a session's context packet |
| `ContextPreviewSections.tsx` | Sub-sections: metrics panel, file list with reasons/snippets, sidebar |
| `ContextMetricsGrid.tsx` / `.parts.tsx` | Token budget grid (used, reserved, omitted) |
| `VerificationSummary.tsx` / `Sections.tsx` / `Sections.parts.tsx` | Verification tab — issue list, pass/fail summary |
| `TaskSessionHistory.tsx` / `HistorySections.tsx` / `HistoryContent.tsx` | History tab — past session records |
| `orchestrationUi.tsx` | Shared UI utilities: `badgeStyle`, `panelStyle`, `resolveStatusTone`, formatters |
| `ContextPreview.test.ts` | Tests `ContextPreview` via `renderToStaticMarkup` — structural output, not interaction |
| `index.ts` | Barrel: `OrchestrationPanel`, `ContextPreview`, `TaskSessionHistory`, `VerificationSummary`, `useOrchestrationModel` |

## Patterns

### `.parts.tsx` file convention
Every substantial component has a companion `*.parts.tsx` with its sub-components. The main file is a minimal shell; all rendering logic lives in `.parts.tsx`. Keeps per-file line counts under the 300-line ESLint limit without splitting into unrelated modules.

### `orchestrationUi.tsx` as shared style factory
Instead of duplicating inline styles, all badge/panel/status styles are functions returning `React.CSSProperties`:
- `badgeStyle(background, color)` — pill badge
- `panelStyle(background?)` — card border + background
- `resolveStatusTone(status)` — maps status strings to `{ background, color }` tokens

Always import from here rather than building inline equivalents.

### Task lifecycle (two-step)
`useOrchestrationTaskComposerModel` creates tasks in two sequential IPC calls:
1. `orchestration.createTask(request)` — returns `taskId` + partial session
2. `orchestration.startTask(taskId)` — returns final session with context packet

The `sessionId` for navigation may come from either result — `resolveSessionId` prefers the start result and falls back to the create result. Do not collapse into a single call.

### `hasElectronAPI()` guard
All IPC calls are guarded with `hasElectronAPI()`. This is duplicated between `useOrchestrationTaskComposerModel.ts` and `useOrchestrationModel.helpers.ts` intentionally — the composer is self-contained, the model helpers serve the `model/` subdirectory. Do not remove either copy.

### `deriveCurrentStep` priority chain
In `OrchestrationPanelContent.tsx`, the "current step" string resolves as:
```
providerEvent.message → state.message → latestResult.message → state.status → 'idle'
```
This gives live streaming progress events priority over persisted state. Preserve this order.

## Gotchas

- **`useOrchestrationModel.ts` is a facade** — the real implementation is in `model/useOrchestrationModelCore` (subdirectory not listed here). Editing `useOrchestrationModel.ts` changes nothing; find the core hook.
- **`ContextPreview.test.ts` uses `renderToStaticMarkup`** — not `@testing-library/react`. Tests assert on rendered HTML structure, not DOM behavior. Adding interaction tests requires a different setup.
- **Context builder integration** — `OrchestrationTaskComposer` pulls in `ContextSelectionSection` and `useContextSelectionModel` from `../ContextBuilder/`. Context file selection is owned by ContextBuilder, not this module.
- **Four-tab navigation state lives in `OrchestrationPanelContent`** — the `activeTab` state and `handleTaskReady` callback (which switches to `'overview'` after launch) are both here. Tab switching from child components must go through `onSelectTab` prop.

## Dependencies

- **IPC**: `window.electronAPI.orchestration.*` — `previewContext`, `createTask`, `startTask`, `resumeSession`, `rerunVerification`, `pauseSession`, `cancelSession`
- **Types**: `../../types/electron` — `TaskSessionRecord`, `OrchestrationState`, `ContextPacket`, `TaskResult`, `VerificationSummary`, `ProviderProgressEvent`
- **ContextBuilder**: `../ContextBuilder/useContextSelectionModel`, `../ContextBuilder/ContextSelectionSection`, `../ContextBuilder/ContextBuilderPrimitives`
- **Model subdirectory**: `model/useOrchestrationModelCore` — contains the subscription and session management logic
<!-- claude-md-auto:end -->
