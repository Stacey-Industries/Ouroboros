<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Renderer — React Entry Point & Root Orchestration

React browser process. Entry at `index.tsx`, root component in `App.tsx`. Everything under `src/renderer/` runs in the Chromium renderer process — no Node APIs.

## Key Files

| File        | Role                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `index.tsx` | React bootstrap — mounts `<App>`, blocks file-drop navigation, orchestrates splash screen fade-out |
| `App.tsx`   | Root component — three-layer bootstrap (config gate → provider stack → hook orchestration)         |
| `env.d.ts`  | Vite `ImportMetaEnv` type augmentation                                                             |

## Three-Layer Bootstrap Pattern

`App.tsx` intentionally splits into three nested components to separate concerns:

1. **`App`** — config gate. Calls `useConfig()` + `useThemeRuntimeBootstrap()`. Renders `<LoadingScreen>` until config resolves. Extracts typed values from raw config before passing down.

2. **`ConfiguredApp`** — provider stack. Wraps everything in contexts. Order matters:

   ```
   ToastProvider > FocusProvider > AgentEventsProvider > ApprovalProvider > ProjectProvider
   ```

   `ProjectProvider` is innermost — it depends on `AgentEventsProvider`. `ToastProvider` is outermost — toasts must work from any context.

3. **`InnerApp`** — hook orchestration. Calls all top-level hooks (`useTerminalSessions`, `useWorkspaceLayouts`, `useCommandRegistry`, etc.) and wires their outputs together via `buildInnerAppLayoutProps`. Branches between `<ChatOnlyShellWrapper>` (when `isChatWindow || immersiveFlag`) and `<InnerAppLayout>` (IDE shell). All providers remain above the branch — toggling shells does not re-mount contexts.

## Prop Builder Functions

`InnerApp` uses explicit builder functions instead of inline JSX prop spreading:

- `buildInnerAppLayoutProps(...)` — assembles the full `InnerAppLayoutProps` from multiple hook return values
- `buildTerminalControl(terminal)` — shapes terminal hook output into the `terminalControl` slot expected by layout

## Gotchas

- **Tailwind v4 chokes on Windows paths in repo content.** Tailwind's auto-source scan reads files anywhere in the working tree as candidate-class sources. Windows path segments like `C:\...\C--Web-App-Agent-IDE\...` get tokenized as CSS variable names, and 6-hex-shaped fragments (`\afa0da` etc.) parse as Unicode escapes — when the value exceeds U+10FFFF, `String.fromCodePoint` throws `RangeError: Invalid code point` and the renderer build dies. `globals.css` carries explicit `@source not` directives for `roadmap/wave-*-output/**` and `roadmap/_archived/**`. **If you reorganize directories under `roadmap/` or add a new analyzer-output sibling, extend the `@source not` glob in `globals.css` in the same change.** Reproduced and fixed twice now (Wave 53c v2.7.4, Wave 53k roadmap archive).
- **`useCustomCSS`** injects user-defined CSS into `<head>` as `<style id="custom-css">`. Effect replaces `el.textContent` on every change — safe to call repeatedly.
- **Splash screen** (`#splash`) lives in `index.html`, not in React. `index.tsx` drives its dismissal via a 300ms `setTimeout` after `createRoot().render()`. The CSS transition is defined in `index.html`.
- **File-drop prevention** is global in `index.tsx`. Individual components (e.g. FileTree) add their own `drop` handlers — the global handler only prevents Electron's fallback navigation to `file://` URLs.
- **`useThemeRuntimeBootstrap`** must be called in `App` (before `ConfiguredApp`) so CSS vars are applied before the provider tree renders — avoids flash of wrong theme.
- **`env.d.ts`** — do not delete; without it, `import.meta.env` accesses are untyped.

## Relationships

- Consumes `window.electronAPI` (from `src/preload/preload.ts`) — no direct Node/Electron imports allowed here
- All hooks in `src/renderer/hooks/` feed into `InnerApp`
- All contexts in `src/renderer/contexts/` are mounted by `ConfiguredApp`
- `InnerAppLayout` (`components/Layout/InnerAppLayout.tsx`) is the sole render output of `InnerApp`
- Theme CSS vars are initialized by `useThemeRuntimeBootstrap` before the app tree renders
