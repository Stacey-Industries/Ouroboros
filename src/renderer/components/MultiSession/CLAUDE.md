<!-- claude-md-auto:start -->
The CLAUDE.md for this directory already exists and is comprehensive. Here's what it contains — no changes needed:

**`src/renderer/components/MultiSession/CLAUDE.md`** already documents:

- The two-phase Launcher → Monitor pattern
- Three-layer component hierarchy (`Controls` → `Parts` → top-level)
- The `agent-ide:spawn-claude-template` CustomEvent dispatch flow and why sessions are matched by label (not ID)
- `MAX_SLOTS = 4`, default 2 slots, `'__custom__'` sentinel
- Critical gotchas: duplicate label deduplication, `haveSameIds` re-render guard, DOM event silently no-ops if listener isn't mounted, template overrides merge order
- All dependency relationships to `AgentMonitor`, `AgentEventsContext`, `templateResolver`

The file is already well-suited to guide future work in this directory.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# MultiSession — Parallel Agent Session Launcher & Monitor

Two-phase UI for configuring and observing parallel Claude Code sessions: a **Launcher** (configure + fire) and a **Monitor** (watch the batch in a live grid).

## Key Files

| File                               | Role                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `MultiSessionLauncher.tsx`         | Top-level launcher panel — composes model + Parts                                     |
| `MultiSessionMonitor.tsx`          | Top-level monitor panel — composes model + Parts                                      |
| `useMultiSessionLauncherModel.ts`  | Launcher state: slots, templates, launch dispatch                                     |
| `multiSessionMonitorModel.ts`      | Monitor state: session matching, grid layout, batch stats                             |
| `MultiSessionLauncherParts.tsx`    | Composed sections: `SlotEditor`, `LauncherHeader`, `LauncherFooter`                   |
| `MultiSessionLauncherControls.tsx` | Atomic controls: `IconButton`, selects, prompt field, SVG icons                       |
| `MultiSessionMonitorParts.tsx`     | Monitor rendering: `SessionGrid`, `MonitorHeader`, `MonitorFooter`, `CompactToolCall` |
| `index.ts`                         | Barrel — exports `MultiSessionLauncher` + `MultiSessionMonitor` only                  |

## Component Layering

Three layers — do not collapse them:

```
MultiSessionLauncherControls  ← atoms (IconButton, selects, icons)
       ↓
MultiSessionLauncherParts     ← composed sections (SlotEditor, LauncherHeader/Footer)
       ↓
MultiSessionLauncher          ← top-level panel
```

`MultiSessionMonitorParts` → `MultiSessionMonitor` follows the same two-layer structure.

## Data Flow

```
User fills slots → handleLaunchAll → dispatchLaunch (CustomEvent)
                                          ↓
                              agent-ide:spawn-claude-template
                                          ↓
                              AgentEventsContext creates sessions
                                          ↓
                        useMultiSessionMonitorModel matches by label
```

Sessions are identified by **label string** at launch time because session IDs don't exist yet — the `agent-ide:spawn-claude-template` CustomEvent fires before `AgentEventsContext` creates the `AgentSession`. The monitor later matches labels → IDs by scanning the agents array sorted newest-first.

## Key Types

- **`SessionSlot`** — one configurable launch unit: `{ id, templateId, customPrompt, modelOverride, effortOverride }`
- **`BatchStats`** — aggregate across all batch sessions: tokens, cost, completed/total counts
- **`GridLayout`** — `{ columns, rows }` derived purely from slot count (1–2 sessions: 1 row; 3–4: 2×2)

## Hard Limits & Constraints

- **`MAX_SLOTS = 4`** — enforced in `useSessionSlots.handleAddSlot` and `LauncherFooter`. Grid layout only supports up to 2×2.
- Default state starts with **2 slots** pre-created (not 1).
- `templateId === '__custom__'` is the sentinel for free-text prompts. All other values are `AgentTemplate.id` references.
- Custom-prompt label is truncated to 40 chars with `...` — used as the session's `taskLabel` for monitor matching.

## Gotchas

- **Session matching uses label, not ID.** If two sessions have identical labels (e.g., same template launched twice), `matchBatchSessionIds` deduplicates with `usedIds` — the most recent one wins. Avoid duplicate labels across a batch.
- **`haveSameIds` prevents re-render cascades.** `setBatchSessionIds` is gated behind an identity check on every `agents` update. Without it, every agent heartbeat event would reset the batchSessions array reference and cause downstream `useMemo` thrashing.
- **Launch via DOM CustomEvent, not IPC.** `dispatchLaunch` calls `window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', ...))`. This is renderer-only — it will silently do nothing if the listener in `useAgentEvents` isn't mounted.
- **Slot overrides layer on top of template `cliOverrides`.** `applySlotOverrides` merges per-slot model/effort onto template-level CLI overrides, with slot-level taking precedence.
- **`useAgentTemplates`** fetches once on mount via `window.electronAPI.config.get('agentTemplates')`. Templates are not reactive — changes to the config after the launcher opens won't be reflected.

## Dependencies

- `../AgentMonitor/types` — `AgentSession`, `ToolCallEvent`
- `../AgentMonitor/costCalculator` — `estimateCost`, `formatCost`, `formatTokenCount`
- `../../contexts/AgentEventsContext` — `useAgentEventsContext` (provides live `agents` array)
- `../../contexts/ProjectContext` — `useProject` (provides `projectRoot`)
- `../../utils/templateResolver` — `resolveTemplate` (expands `{{projectRoot}}` etc. in template prompts)
- `../../types/electron` — `AgentTemplate`, `ClaudeCliSettings`
