<!-- claude-md-manual:preserved -->
# Terminal — xterm.js Multi-Session Terminal UI

Full-featured terminal subsystem: xterm.js rendering, PTY IPC, shell integration (OSC 633/133), command blocks, tab completions, history search, rich multiline input, session persistence, and split panes.

## Architecture

Two-layer design: a **Controller** object assembled from hooks, consumed by a thin **View**.

```
TerminalManager (session routing)
  └── TerminalManagerContent (tab bar + split pane)
        └── TerminalInstance (mounts controller)
              └── TerminalInstanceView (pure render, receives controller)
```

The controller is built by `useTerminalInstanceController` (entry: `useTerminalSetup.ts`), which composes ~10 focused hooks into a single typed object. Nothing is threaded through props — the view destructures the controller.

## Patterns

### Controller Object Pattern

`useTerminalInstanceController` returns a single `TerminalInstanceController` object (defined in `.types.ts`). Never add state directly to `TerminalInstanceView` — add a hook, compose it in `TerminalInstanceController.ts`, and expose it through the controller type.

### `useTerminalSetup` Decomposition

The setup hook is split by phase:

- `.lifecycle` — creates xterm, attaches addons, tears down
- `.runtime` — ResizeObserver + fit (requires double-rAF guard)
- `Keyboard` — attaches key handlers
- `Data` — bridges PTY IPC → xterm `.write()`
- `Cleanup` — IPC listener teardown

When adding a new xterm feature, find the appropriate phase file rather than adding to the entry `.ts`.

### OSC Shell Integration Priority

OSC 633 (VS Code protocol) is preferred. `shellIntegrationAddon.ts` emits typed `ShellIntegrationEvent`s. If 633 is not detected within the first few prompts, `osc133Handler.ts` falls back to OSC 133 heuristics. Command blocks use whichever is active (`osc133Active: boolean | null` — null means undecided).

### `terminalRegistry` for Cross-Component Access

Other modules (e.g. `useIdeToolResponder`) call `getTerminalLines(sessionId)` to read buffer content. Register on mount, unregister on unmount. Do not reach into the registry from within Terminal components — use the controller's `terminalRef` instead.

## Gotchas

- **Package**: `@xterm/xterm` only — never `xterm`. All addons must be `@xterm/*` at the same version. Mixing causes duplicate class instance crashes.
- **Fit timing**: call `fit()` only after a **double-rAF** following `term.open()`. Use `isReadyRef` guard in ResizeObserver to prevent premature calls.
- **WebGL renderer**: `@xterm/addon-webgl` is loaded synchronously BEFORE `term.open()` in `loadCoreAddons()`. Loading it after `open()` causes a double cursor (DOM + WebGL overlap). This is the VS Code pattern.
- **OSC 10/11/12 blocked**: registered via `term.parser.registerOscHandler` to prevent programs from overriding theme colors.
- **Session key for `useTerminalSetup`**: the `useEffect` depends only on `sessionId`. Changing any other prop does not re-bootstrap — update the effect deps deliberately.
- **Command block limits**: hard cap at 500 blocks, 1000 lines per block (`MAX_BLOCKS`, `MAX_BLOCK_LINES` in `useCommandBlocksController.ts`) to prevent memory growth in long-lived sessions.
- **RichInput** uses CodeMirror 6 with a custom `StreamLanguage` shell tokenizer — not Monaco. Keep shell keyword lists in `RichInputBody.tsx`.
- **getCellHeight**: `CommandBlockOverlayBody` reaches into `term._core._renderService.dimensions` via type-cast to position overlays. This is an xterm internal — test after xterm version bumps.
