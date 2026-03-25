# Orchestration Renderer Smoke Checklist

## Scope

Use this checklist for the first orchestration renderer ship slice. Prefer the existing running app and reload the renderer with `Ctrl+R` instead of restarting Electron.

## Preconditions

- Open a project root with at least one editable file.
- Ensure the orchestration-enabled build is already running in the current Ouroboros window.
- If you need a fresh renderer state, press `Ctrl+R` in the app window.

## Automated coverage already in repo

- `src/renderer/components/ContextBuilder/useContextSelectionModel.test.ts`
- `src/renderer/hooks/orchestrationCommandHelpers.test.ts`
- `src/renderer/hooks/orchestrationEventSubscriptions.test.ts`
- `src/renderer/components/Orchestration/ContextPreview.test.ts`

These cover:

- include, exclude, and pin selection invariants
- open, resume-latest, and rerun-verification command flows
- orchestration toast and provider-session event handling
- context reason, omitted-file, snippet, and diff-summary rendering

## Manual smoke steps

### 1. Open orchestration view

- Open the command palette.
- Run `Open Orchestration`.
- Confirm the centre pane switches to the orchestration view.
- Confirm the tab set shows `Overview`, `Context`, `Verification`, and `History`.

### 2. Create and start a task

- Enter a narrow goal in the orchestration composer.
- Leave provider on the Claude-first path.
- Click `Preview Context`.
- Confirm the preview status updates and the preview file list appears.
- Click `Start Task`.
- Confirm the panel stays open and routes to the new session.

### 3. Inspect ranked files and reasons

- Open the `Context` tab.
- Confirm at least one ranked file shows:
  - file path
  - score/confidence
  - `Why it was selected`
  - snippet content or selected ranges
- Confirm omitted candidates render when the preview omits files.

### 4. Adjust include, exclude, and pin state

- In `Context Selection Controls`, add one file via `Add Include`.
- Add another file via `Add Exclude`.
- Add another file via `Add Pin`.
- Confirm the counts update in `Manual controls`.
- In `Previewed Context Files`, toggle `Pin`, `Include`, and `Exclude` on the same file and confirm:
  - excluding removes conflicting include/pin state
  - pinning or including clears exclusion for that file
  - the badges reflect the current state

### 5. Submit through the Claude-first path

- Start the task with provider `Claude Code`.
- Confirm provider progress toasts appear.
- If a provider session link is emitted, confirm it is associated with the orchestration session instead of replacing Agent Monitor behavior.

### 6. Confirm existing edit flow still works

- Let the provider produce edits through the normal edit path.
- Open the changed file in the editor.
- Confirm the file viewer, save flow, and diff behavior still work normally.

### 7. Run verification and inspect results

- Use `Rerun verification` from the orchestration header or command surface.
- Confirm verification status/toasts appear.
- Open the `Verification` tab.
- Confirm the summary, issues, and any required review state are visible.

### 8. Validate resume and reopen after renderer reload

- Press `Ctrl+R`.
- Re-open orchestration from the command palette if needed.
- Confirm the latest session reloads from persisted state.
- Run `Resume Latest Orchestration Task`.
- Confirm the centre pane reopens the session and does not lose context, verification, or diff summary data.

### 9. Check adjacent views for regression

- Open `Settings` and confirm it still renders normally.
- Open `Build Project Context` and confirm context-builder flows still work.
- Open diff review and confirm centre-pane routing still behaves normally.
- Open Agent Monitor and confirm its existing views/events still work without orchestration stealing focus unexpectedly.

## Expected outcomes

- Orchestration opens from the intended command/event entry points.
- Context reasons and omitted candidates are visible.
- Include, exclude, and pin controls stay mutually consistent.
- Verification rerun and latest-task resume are reachable and functional.
- Reloading the renderer preserves resumable orchestration state.
- Settings, context builder, diff review, and Agent Monitor show no obvious regression.

## If a step fails

Record:

- exact step number
- visible toast or error text
- whether the failure occurred before or after renderer reload
- session ID if visible in the orchestration history
- whether the problem is routing, state hydration, provider progress, verification, or adjacent-view regression
