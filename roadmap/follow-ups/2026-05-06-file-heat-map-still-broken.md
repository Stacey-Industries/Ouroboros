---
status: OPEN
created: 2026-05-06
updated: 2026-05-06
parent_wave: wave-82
---

# File-tree heat map still does not light up after agent edits

**Symptom (round-5 smoke, 2026-05-06):** with the heat-map toggle ON in the file tree, asking the in-app chat to write/edit a file does NOT produce a colored left-border on the edited file's row. Toggle off → toggle on cycle does not surface borders either.

**What was tried in wave-82.x:**

- **Wave 82.1 (2026-05-03):** extended `EDIT_TOOL_NAMES` in `useFileHeatMap.ts` to cover MCP-style tool names alongside the legacy Claude Code names:
  ```
  Write, Edit, NotebookEdit, MultiEdit          # legacy
  write_file, edit_file, notebook_edit, multi_edit   # MCP-style
  ```
  Hypothesis was that backend emits `write_file` (etc.) and the heat map filtered on the legacy set only.

- **Wave 82.1 also fixed `extractFilePath` JSON parse** in `useFileHeatMap.ts` (round 2 patch).

After both fixes, round-5 smoke still showed no border. So either:

1. The tool-name set is still missing the actual emitted name (look at the live event payload — what does `tool_name` look like in `agentEvents.toolStart` / `toolEnd` for `Write`/`Edit` calls in 2026-05+?).
2. `extractFilePath` is not actually pulling the path out of the payload shape the backend emits today.
3. The path being extracted does not match the file-tree row's normalized path (slash direction, drive-letter case, relative vs absolute).
4. The state plumbing into `useFileHeatMap` is not subscribing to whatever events fire — fine in principle but the subscription is broken.

## Reproducible repro

1. `npm run dev`
2. In chat-only workbench, ask: "create test.md with the words 'hello world'"
3. Expand the file tree. Toggle the heat-map button ON (eye-icon-ish).
4. Wait for the agent's tool call to complete; observe the file row.
5. **Expected:** colored left border on `test.md`.
6. **Actual:** no border ever appears. Toggling off→on does not help.

## How to investigate (per debug-before-fix.md)

Don't propose another fix from code reading. Instrument first:

1. Add a temporary `log.info('[heat-map] tool event', { name, input, output })` at the subscription point in `useFileHeatMap.ts` so you see the live tool-name and payload shape on every fire.
2. Add a temporary `log.info('[heat-map] extracted path', { rawInput, extracted, treeRowKey })` so you can confirm whether the extracted path matches the file-tree row's lookup key.
3. Reproduce step 1-4 above. Share the console lines.
4. Diagnose from observed runtime data, then propose a minimal fix.

## Files involved

- `src/renderer/hooks/useFileHeatMap.ts` — subscription, tool-name filter, path extraction, state.
- `src/renderer/components/FileTree/FileTree.tsx` — passes `getHeatLevel` into the tree body when `heatMapEnabled` is true.
- `src/renderer/components/FileTree/RootSection.tsx` (or wherever the row receives `heatLevel`) — applies the colored left border.

Backend emitter side (if the event payload itself is the issue):
- `src/main/agentChat/*` — chat-orchestration → renderer event bridge.
- `src/main/hooks.ts` / `src/main/hooksEditTap.ts` — hook events that report tool calls.

## Why deferred

Wave 82 (chat-only polish bundle) closed 14 of 15 items. This is the last open item from the wave. Cole accepted the rest of the wave for ship; the heat map needs an instrumented investigation that did not fit the wave's smoke window. File this as `OPEN`, pick up in the next renderer-touching wave or as a standalone fix.

## Marker for the wave brief

`wave-82-auto-brief.md` should reflect: B2 (heat map) — **NOT CLOSED in wave-82**. Deferred to follow-up.
