# Contexts — App-level React state providers

React contexts that lift shared state above the component tree so it survives panel mount/unmount cycles.

## Key Files

| File                     | Role                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectContext.tsx`     | Multi-root project state — persists roots per-window via `window.setProjectRoots()`. Provides `projectRoot`, `addProjectRoot`, `removeProjectRoot`.         |
| `ApprovalContext.tsx`    | Pre-execution approval queue — listens for `approval:request` IPC events, renders `ApprovalDialog` overlay, plays an 880 Hz tone on new requests.                    |
| `FocusContext.tsx`       | Keyboard focus tracker — `Ctrl+1–4` switches between `sidebar`, `editor`, `terminal`, `agentMonitor`. Panels update focus via click handlers.                        |
| `ToastContext.tsx`       | Toast/notification system — wraps `useToast` hook, renders `ToastContainer`. Also exposes progress tracking (`startProgress`, `updateProgress`, `completeProgress`). |
| `AgentEventsContext.tsx` | Agent session state — wraps `useAgentEvents` hook at the App level so IPC listeners stay active even when AgentMonitorPane is collapsed/unmounted.                   |

## Patterns

- **Consistent shape**: Each context exports a `useXxxContext()` hook (throws if used outside provider) and an `XxxProvider` component.
- **Thin wrappers**: Contexts hold minimal logic — they lift existing hooks (`useToast`, `useAgentEvents`) or IPC listeners to a stable tree position.
- **`useMemo` on values**: Every provider memoizes its context value to prevent unnecessary re-renders downstream.
- **Side-effect ownership**: `ApprovalContext` and `ProjectContext` own their own IPC subscriptions (`useEffect` with cleanup). `ToastContext` and `AgentEventsContext` delegate to hooks.

## Gotchas

- **AgentEventsContext exists because of unmounting** — if the agent monitor panel is collapsed, its children unmount. Without this context, IPC events arriving while collapsed are silently dropped. Don't move `useAgentEvents` back into the panel component.
- **ApprovalContext renders UI** — unlike other contexts, it renders `<ApprovalDialog>` directly inside the provider. This is intentional so the approval overlay appears regardless of which panel is focused.
- **ProjectContext persists on every mutation** — `addProjectRoot`, `removeProjectRoot`, `setProjectRoot` all call `persistRoots()` which writes to electron-store synchronously. Don't batch rapid mutations without debouncing.

## Dependencies

- **IPC bridge**: `window.electronAPI.approval`, `window.electronAPI.config` — contexts assume these exist (guarded by `typeof window` checks for SSR safety).
- **Hooks**: `../hooks/useToast`, `../hooks/useAgentEvents` — contexts re-export their return types.
- **Components**: `ApprovalDialog` (from `AgentMonitor/`), `ToastContainer` (from `shared/`).
