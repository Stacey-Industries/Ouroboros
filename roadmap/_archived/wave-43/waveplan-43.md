# Wave 43 — Chat Polish, QR Fix, Legacy Sweep, Streaming Batching
## Implementation Plan

**Version target:** v2.1.0 (minor — no breaking changes, visible UX rework)
**Feature flag:** none (Wave 42's `layout.immersiveChat` stays; all polish applies to both IDE and chat-only paths where relevant)
**Dependencies:** Wave 42 (`ChatOnlyShell`), Wave 20 (`chat-primary` preset — being retired)

---

## Overview

Three independent threads rolled into one wave because they all touch the chat surface and should ship together:

1. **Legacy sweep.** The original "chat mode" was the Wave 20 `chat-primary` layout preset — `AgentChatWorkspace` slotted into the IDE editor pane. Wave 42's `ChatOnlyShell` superseded it. The old preset is still wired and carries a latent bug (`SessionSidebar.tsx:28-37` self-gates on `layout.chatPrimary`, which now silently blanks the sidebar inside `ChatOnlyShell`). Retire the preset and all its supporting code.

2. **Mobile QR dev-mode fix.** Scanning the dev-mode QR shows only `ouroboros` with no resolvable link. Three converging causes: (a) `startWebServerAsync()` is fire-and-forget (`main.ts:275`), so `getWebServerPort()` can return `null` when the pairing code is issued, (b) `detectLocalIp()` falls back to `127.0.0.1` on Windows when the active interface is a VPN/WSL adapter, (c) the pairing router is only mounted at server-boot if `mobileAccess.enabled` is already on (`webServer.ts:174`), so toggling the setting after launch silently 404s.

3. **Chat-only shell polish + streaming batching.** The shell is structurally correct but still wears IDE chrome. Targets: Claude Code CLI, Piebald, and the new Claude coding UI — low-chrome, floating composer, consistent gutter, persistent context bar, single background surface. Streaming currently calls `setState` on every IPC chunk (`useAgentChatStreaming.ts:107-126`); add rAF batching so paint work is bounded to once per frame.

**Interleaved tool-call rendering is intentionally out of scope.** Non-consecutive tool cards are correct for Ouroboros — the product value is visibility, not the collapsed summary Codex uses. Do not touch `buildRenderItems` (`AgentChatMessageComponents.messages.tsx:211-228`).

---

## Scope

### In-scope

- **Legacy sweep:** delete `chat-primary` preset, its config flag, settings toggle, hook, and latent `SessionSidebar` gate. Migration path: if a user has `layout.chatPrimary: true` on disk, flip to `layout.immersiveChat: true` once on startup then clear the legacy key.
- **Mobile QR fix:** `await` server start before allowing pairing-code generation; improve `detectLocalIp()` to skip internal/VPN/WSL adapters; make pairing router mount reactive to `mobileAccess.enabled` flips (remount or lazy-mount); render the pairing URL as plain text beside the QR so the user can verify host/port.
- **Chat-only shell polish:** strip title-bar divider + "Chat Mode" badge; make status bar conditional (only renders when it has content); unify background surface (remove the three-tone `surface-base` / `surface-panel` / `surface-panel` stack); move model + permission-mode chips from composer footer into title bar; replace composer with a floating pill (no raw textarea on flat panel); persistent context bar even at rest; raise textarea max-height from 120px → ~40vh; suppress `SideChatDrawer` and `BranchCompareModal` in chat-only mode.
- **Token + inline-style cleanup:** replace `USER_BUBBLE_STYLE` inline `color-mix()` object (`AgentChatMessageComponents.messages.tsx:19-25`) with a single `--surface-user-bubble` token; fix `--text-primary` / `--text-muted` references in `AgentChatComposerInput.tsx:58-59` to `-semantic-*` form; migrate inline `toggleBtnStyle` (`AgentChatComposerSection.tsx:243-251`) and the `borderTop` inline style in `AgentChatConversation.tsx:174` to token-driven classes.
- **Assistant gutter + tool cards:** add consistent ~28px left gutter for assistant messages (align text blocks and tool cards); drop `glass-card` + `rounded-md border` on inline tool cards in chat-only context — render flat, subtly tinted.
- **Streaming rAF batching:** accumulate chunks in a ref buffer inside `useAgentChatStreaming`; flush to state once per `requestAnimationFrame`; flush immediately on `complete` / `error` / `thread_snapshot`. Preserve the existing pure reducer (`AgentChatStreamingReducers.applyChunk`) unchanged.

### Out-of-scope

- Interleaved tool-call grouping (explicitly kept as-is).
- `IdeToolBridge` cross-window delegation (Wave 44+ candidate).
- Backend streaming protocol changes — batching is renderer-side only.
- Mobile QR UX beyond the dev bug (no redesign of the pairing screen).
- Diff review overlay animation / `enhancedEnabled` wiring (separate deferred).

---

## Architecture notes

### rAF batching design

Current flow (`useAgentChatStreaming.ts:107-126`):

```
IPC chunk → handleChunk → setStateMap(prev → applyChunk(prev, chunk)) → React re-render
```

At 20–50 chunks per 16ms frame (fast Sonnet / cached), this fires 20–50 re-renders per paint. Each triggers a Zustand write, `AgentChatConversation` diff, markdown re-parse, and scroll-follow recalc.

Target flow:

```
IPC chunk → push to pendingRef → schedule rAF (if not already scheduled)
rAF tick → drain pendingRef → fold all chunks via applyChunk → single setStateMap → single React render
```

Key constraints:

- **Preserve `applyChunk` purity.** The reducer is already correct. Batching only changes *when* it runs, not what it does. Fold the drained buffer left-to-right exactly like `replayBufferedChunks` does.
- **Do not batch `thread_snapshot`.** It's a DOM event dispatch (`window.dispatchEvent`), not a state change. Fire synchronously on receipt so listeners don't lag a frame.
- **Do not batch `complete` / `error`.** Flush the buffer first (so any pending deltas land), then apply the terminal chunk synchronously. Otherwise the "done" state can trail the last delta by a frame, and the cleanup timer in `useCleanupCompletedStreams` races with replay.
- **Per-thread buffer, single rAF.** Chunks for different threads land in the same pending queue; the rAF handler drains all of them and writes once via a single `setStateMap` call using the existing per-thread reducer.
- **Test harness.** jsdom's `requestAnimationFrame` defaults to `setTimeout(0)`-ish behaviour; existing tests call `applyChunk` directly and should keep passing. New tests for the hook go through `vi.useFakeTimers()` + manual rAF flush (`vi.advanceTimersByTime(16)` or a spied-on rAF).
- **Cancel on unmount.** Clear the pending rAF in the `useEffect` cleanup returned from `useStreamChunkListener`.

### Chat-only chrome unification

- **Background:** single `--surface-chat` token, applied at `ChatOnlyShell` root; `AgentChatWorkspace` and `AgentChatConversation` inherit (no override). Add token to `tokens.css` / `globals.css @theme`.
- **Title bar:** remove `border-b border-border-semantic`; drop `ChatModeBadge`; move model + permission-mode controls here via a new `ChatOnlyHeaderControls` component that reuses the existing `ChatControlsBar` primitives. "Exit chat mode" moves to window menu only.
- **Status bar:** wrap in a `ConditionalStatusBar` — render nothing when no branch, no active streaming, no pending diffs. The footer should be invisible at rest.
- **Composer:** wrap the textarea + footer in a new `FloatingComposer` container — rounded 12px, `bg-surface-raised`, subtle `shadow-sm`, 0-border. Align left edge to message left edge (unify `px-4` scroll padding with composer container padding).
- **Drawer:** drop `shadow-lg`, scrim to 0.2 opacity via `--surface-scrim-chat` token, transition to `duration-150 ease-out`.

### Legacy sweep dependency order

`chat-primary` preset removal has to land **before** the `SessionSidebar` gate removal — otherwise chat-primary users temporarily see an empty sidebar. Sequenced inside Phase A.

---

## Phase A — Legacy `chat-primary` removal

**Goal:** Delete the Wave 20 chat-in-editor path. Migrate any user who had the old toggle on. Fix the latent `SessionSidebar` gate.

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/Layout/InnerAppLayout.tsx` | Delete the `chatMode` branch at lines 185-201. The preset switch collapses to the normal IDE layout. |
| `src/renderer/components/Layout/layoutPresets/presets.ts` | Delete `chatPrimaryPreset` (lines 53-76). Remove from preset registry. |
| `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx` | Delete `readChatPrimaryFlag` + `useChatPrimaryFlag` (lines 108-225). Delete the `forcePresetId` call site that consumes it. |
| `src/main/configSchemaTail.ts` | Delete `chatPrimary: boolean` (line 263). Add migration: on config load, if `layout.chatPrimary === true`, set `layout.immersiveChat = true` and delete the old key. One-shot; does not re-run. |
| `src/renderer/types/electron-foundation.d.ts` | Delete `chatPrimary?: boolean` (line 234). |
| `src/renderer/components/Settings/settingsEntries.ts` | Delete the "Start in chat mode" entry (line 90). |
| `src/renderer/components/Settings/GeneralSection.tsx` | If hand-coded, delete the toggle row (lines 34-37). If auto-built from entries, no change. |
| `src/renderer/components/SessionSidebar/SessionSidebar.tsx` | Delete the `layout.chatPrimary` self-gate (lines 28-37). Sidebar now always renders when mounted. |

### Subagent briefing

- **Read first:** all files listed above; `roadmap/wave-20-plan.md` and `roadmap/wave-42-plan.md` for context on what each piece was for.
- **Migration code goes in `src/main/config.ts` (or wherever `loadConfig` is).** It must be idempotent — on a fresh install the legacy key isn't present; the migration no-ops. On an existing install with `chatPrimary: true`, it flips once and deletes the key so subsequent loads also no-op.
- **Do not delete `PopOutChatButton`, `createChatWindow`, or `windowManagerChatWindow.ts`.** These are the pop-out chat window feature (Wave 20 Phase B), still live and called from `AgentChatTabBar` + `TitleBar.menus.ts`.
- **Scoped test runs:** `npx vitest run src/renderer/components/Layout/` and `npx vitest run src/renderer/components/Settings/` and `npx vitest run src/renderer/components/SessionSidebar/`.
- **Manual verification by parent:** launch with a dev config containing `layout.chatPrimary: true`; confirm migration flips to `immersiveChat: true` on next load.

### Acceptance criteria

- [ ] `grep -rn "chatPrimary\|chat-primary\|chatPrimaryPreset" src/` returns zero matches outside of test fixtures and historical roadmap files.
- [ ] Migration path flips old config key once; no duplicate flips on subsequent loads.
- [ ] `SessionSidebar` renders inside `ChatOnlyShell` regardless of any config state.
- [ ] Scoped test runs pass.
- [ ] `npx tsc --noEmit` clean.
- [ ] Commit: `refactor(wave-43): Phase A — retire chat-primary legacy path`

---

## Phase B — Mobile QR dev-mode fix

**Goal:** Scanning the dev-mode QR produces a working pairing URL. No more `127.0.0.1` or `ouroboros`-only text.

### Modified files

| File | Change |
|------|--------|
| `src/main/main.ts` | Change `initializeApplication` to `await startWebServerAsync()` before any code path that generates pairing codes. If that serializes too much startup, keep it async but expose a `whenWebServerReady()` promise that `pairingHandlers` awaits before `getWebServerPort()`. |
| `src/main/mobileAccess/pairingHandlers.ts` | In `buildQrPayload` (line 58), replace the `?? 7890` fallback with an explicit error path: if the server isn't listening, reject pairing generation with a typed error the renderer can show ("Web server not ready — try again in a moment"). Call `await whenWebServerReady()` before reading the port. |
| `src/main/mobileAccess/pairingHandlers.ts` | Rewrite `detectLocalIp()` to enumerate interfaces, exclude `internal`, exclude known VPN/WSL adapter name prefixes (`vEthernet`, `WSL`, `VMware`, `VirtualBox`, `ZeroTier`, `Tailscale`), prefer the interface matching the default route if detectable. Add unit test. |
| `src/main/web/webServer.ts` | Refactor line 174 so `createPairingRouter()` mount is lazy: always register the route handler, but have the handler itself check `getConfigValue('mobileAccess')?.enabled` at request time. Returns 503 (not 404) when disabled. |
| `src/main/web/webServer.ts` | Export a new `whenWebServerReady(): Promise<void>` that resolves when `httpServer` has fired `listening`. Reject if startup fails. |
| `src/renderer/components/Settings/MobileAccessPairingSection.tsx` | In `QrBlock` / `PairingDisplay`, render `pairing.qrPairingUrl` as copyable plain text below the QR. User can visually verify the host is not `127.0.0.1`. |
| `src/renderer/components/Settings/MobileAccessPairingSection.tsx` | Handle the new "server not ready" error state: show a retry button + a one-line hint. Don't render a QR until we have a real URL. |

### Subagent briefing

- **Read first:** `src/main/main.ts:244-279`, `src/main/mobileAccess/pairingHandlers.ts` (full — it's small), `src/main/web/webServer.ts:160-200 and 340-360`, `src/renderer/components/Settings/MobileAccessPairingSection.tsx`.
- **Do not hardcode VPN adapter names in a cross-platform way.** On Windows, `os.networkInterfaces()` returns adapter friendly names (`Ethernet`, `vEthernet (WSL)`, `Wi-Fi`). On macOS and Linux they're short names (`en0`, `wlan0`, `tun0`). Platform-gate the exclusion list; write the Windows list first since that's where the bug reproduces.
- **Test without a real network.** Mock `os.networkInterfaces()` in the unit test for `detectLocalIp`. Verify: (a) internal-only → throws a typed "no LAN interface" error; (b) `vEthernet (WSL)` alongside a real `Wi-Fi` → picks `Wi-Fi`; (c) two real interfaces → picks the one matching the default route (or falls back to first non-internal if route detection isn't available).
- **`startWebServerAsync` signature change is load-bearing.** Any caller that was relying on its fire-and-forget behaviour must be updated. Grep for all call sites before editing.
- **Pairing handler test:** mock the new `whenWebServerReady()` promise to stay pending; assert pairing generation blocks until it resolves; resolve it and assert the URL uses the correct port.
- **Security rules** apply to `src/main/**` — `eslint-plugin-security` at error. No dynamic `require`, no `eval`, no dynamic `path.join` from user input.
- **Scoped tests:** `npx vitest run src/main/mobileAccess/` and `npx vitest run src/main/web/`.

### Acceptance criteria

- [ ] Pairing URL rendered visibly beside QR code in Settings.
- [ ] `detectLocalIp()` no longer returns `127.0.0.1` on a Windows machine with WSL + a Wi-Fi adapter.
- [ ] Pairing generation waits for server readiness instead of falling back to port 7890.
- [ ] Toggling `mobileAccess.enabled` off → on does not require an app restart (pairing endpoint responds without relaunch).
- [ ] `/api/pair` returns 503 with a clear body when disabled, not 404.
- [ ] Parent runs manual check: scan QR from phone on same LAN, deep link opens and pairing completes.
- [ ] Commit: `fix(wave-43): Phase B — mobile QR dev-mode reliability`

---

## Phase C — Chat-only shell chrome strip

**Goal:** Remove IDE-flavoured chrome from `ChatOnlyShell`. Single background surface. Title bar hosts model/permission chips. Status bar is conditional.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyHeaderControls.tsx` | 80 | Moves model selector + permission-mode chips from composer footer to title bar. Reuses `ChatControlsBar` primitives; different layout (inline with header, not stacked). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyHeaderControls.test.tsx` | 50 | Covers chip rendering, model-change event dispatch, permission-mode toggle. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/styles/tokens.css` | Add `--surface-chat` (single unified chat background). Add `--surface-scrim-chat` at 0.2 opacity for drawer backdrop. Register both in `globals.css @theme`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Root uses `bg-surface-chat`. Pass through to descendants (remove per-child background tokens). |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` | Drop `border-b border-border-semantic`. Delete `ChatModeBadge`. Delete "Exit chat mode" text button (move to window menu only — see below). Mount `ChatOnlyHeaderControls` between project name and window controls. |
| `src/renderer/components/Layout/TitleBar.menus.ts` | Add "Exit Chat Mode" to View menu (flips to "Enter Chat Mode" when off). Already half-wired from Wave 42 Phase C — confirm and complete. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyStatusBar.tsx` | Wrap return in a `hasAnyContent` guard — if no branch, no streaming token usage, no pending diffs, return `null`. No empty footer. Drop `border-t`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlySessionDrawer.tsx` | Drop `shadow-lg`. Backdrop uses `var(--surface-scrim-chat)` instead of inline `opacity: 0.4`. Transition `duration-150 ease-out`. Drawer width `w-64` (down from `w-72`). |
| `src/renderer/components/AgentChat/AgentChatWorkspace.tsx` | Accept a `variant?: 'ide' \| 'chat-only'` prop. When `chat-only`: do not mount `SideChatDrawer` (line 313-321) or `BranchCompareModal` (line 322). Default to `ide`. |
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` | Pass `variant="chat-only"` to `AgentChatWorkspace`. |
| `src/renderer/components/AgentChat/AgentChatComposerParts.tsx` | Conditionally hide the model/permission chips from `ComposerFooter` when the new `ChatOnlyHeaderControls` is active. Detect via a cheap context flag or prop drill from `variant`. |

### Subagent briefing

- **Read first:** `src/renderer/components/Layout/ChatOnlyShell/*` (all files), `src/renderer/components/AgentChat/AgentChatWorkspace.tsx`, `src/renderer/components/AgentChat/AgentChatComposerParts.tsx`, `src/renderer/components/AgentChat/ChatControlsBar.tsx`, `src/renderer/styles/tokens.css`.
- **Design tokens only.** No hex values, no raw `rgba`. The `.claude/rules/renderer.md` color rule is enforced by a pre-commit hook.
- **The `variant` prop is the cleanest way to switch workspace behaviour.** Do not introduce a context for it — two-shell system, one prop. Future-proof: if a third variant appears, migrate then.
- **Moving model/permission chips is visible UX.** Keep a fallback: if `ChatOnlyHeaderControls` is mounted, suppress the chip block in composer footer; otherwise composer footer keeps them (IDE mode unchanged).
- **ESLint per-file limits:** 300 lines, 40 lines/function, complexity 10. `ChatOnlyHeaderControls` will be small; stay well under.
- **Scoped tests:** `npx vitest run src/renderer/components/Layout/ChatOnlyShell/` and `npx vitest run src/renderer/components/AgentChat/AgentChatWorkspace.test.tsx` if it exists.

### Acceptance criteria

- [ ] `ChatOnlyShell` renders with a single uniform background (no visible two-tone layering at edges).
- [ ] Title bar has no divider, no badge, no "Exit" text button. Model + permission chips visible inline.
- [ ] Status bar invisible when there is nothing to show. No phantom 24px strip.
- [ ] Session drawer backdrop is subtle (~0.2 scrim), no shadow, faster animation.
- [ ] `SideChatDrawer` and `BranchCompareModal` not mounted in chat-only mode (confirm via test-tree inspection).
- [ ] IDE mode unaffected — existing `InnerAppLayout` tests still pass.
- [ ] Commit: `feat(wave-43): Phase C — chat-only chrome strip + header controls`

---

## Phase D — Floating composer + token cleanup

**Goal:** Composer reads as a floating pill on the unified surface, not a raw textarea. Inline-style `color-mix()` bubble is replaced by a design token. Existing bogus token references are fixed.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/AgentChat/FloatingComposerContainer.tsx` | 70 | Wrapper providing the pill surface: `bg-surface-raised`, `rounded-xl`, `shadow-sm`, `border-0`, consistent horizontal padding. Accepts children (textarea + footer). |
| `src/renderer/components/AgentChat/FloatingComposerContainer.test.tsx` | 40 | Snapshot + token-class assertions. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/styles/tokens.css` | Add `--surface-user-bubble` + `--surface-user-bubble-border`. Add `--surface-raised-chat` if the existing `surface-raised` clashes with IDE panel elevation (decide after reading). |
| `src/renderer/components/AgentChat/AgentChatComposer.tsx` | Wrap body in `<FloatingComposerContainer>`. Keep existing `ComposerBody`, `ComposerSection`, `ComposerFooter` as children. Adjust internal padding so container provides the outer pad. |
| `src/renderer/components/AgentChat/AgentChatComposerSupport.ts` | Rewrite `getComposerRootClassName` (line 41): current `pb-1 pt-2` becomes a no-op shell — the container owns padding now. |
| `src/renderer/components/AgentChat/AgentChatComposerInput.tsx` | Raise `maxHeight` from 120 to 'calc(40vh)' or a numeric ~320px (pick one; comment the reasoning). Fix token references at lines 58-59: `var(--text-primary)` → `var(--text-semantic-primary)`, `var(--text-muted)` → `var(--text-semantic-muted)`. |
| `src/renderer/components/AgentChat/AgentChatComposerSection.tsx` | Delete the inline `toggleBtnStyle` function (lines 243-251). Replace with a Tailwind class sequence: `text-xs px-2 py-0.5 rounded border border-border-semantic`. Delete the fully-inline toggle-row style object (lines 302-311); use `flex items-center px-2 pt-0.5 gap-1.5`. |
| `src/renderer/components/AgentChat/AgentChatConversation.tsx` | Replace inline `borderTop: '1px solid var(--border-subtle)'` at line 174 with a className `border-t border-border-subtle`. |
| `src/renderer/components/AgentChat/AgentChatMessageComponents.messages.tsx` | Replace `USER_BUBBLE_STYLE` (lines 19-25) with a className: `bg-surface-user-bubble border border-surface-user-bubble-border text-text-semantic-primary px-3.5 py-2.5 rounded-xl rounded-br-sm backdrop-blur-sm shadow-sm`. The `backdrop-filter: blur(8px)` effect moves into `tokens.css` as a utility if needed; single token covers the surface. |
| `src/renderer/components/AgentChat/AgentChatContextBar.tsx` | Make context bar persistent — render always, not only when streaming. Drop the conditional at its mount site (find via grep). |
| `src/renderer/components/AgentChat/AgentChatComposerParts.tsx` | `ComposerContextBar` always mounts its child `AgentChatContextBar` (don't gate on `isStreaming`). |

### Subagent briefing

- **Read first:** all files listed; `src/renderer/styles/tokens.css`; `src/renderer/styles/globals.css` for `@theme` registration pattern.
- **`color-mix()` equivalence.** The current bubble uses `color-mix(in srgb, var(--interactive-accent) 12%, transparent)`. The new `--surface-user-bubble` token should be defined per theme; pick a value in each theme file that matches or improves on the current appearance. Do NOT keep `color-mix` — the token system exists to avoid that.
- **`backdrop-filter: blur(8px)` is borderline.** If the theme design doesn't call for a blur, drop it. If it does, add `backdrop-blur-sm` Tailwind utility rather than inline style.
- **The composer pill must align with the message column.** `MessageList` uses `px-4`; ensure the floating container's effective left edge matches. Use a visual test (parent runs dev server) to confirm.
- **Token reference fix is a one-line change with an outsized blast radius** — if `--text-primary` was defined anywhere as a fallback (legacy), the Send button has been invisible in light theme. Grep for both forms globally and dedupe.
- **ESLint:** `simple-import-sort` + complexity + line limits apply; the token migration should shrink files, not grow them.
- **Do NOT touch** `buildRenderItems` in `AgentChatMessageComponents.messages.tsx:211-228` — interleaved tool-call grouping is intentional per user direction.
- **Scoped tests:** `npx vitest run src/renderer/components/AgentChat/`.

### Acceptance criteria

- [ ] Composer renders as a visibly contained floating surface, not flush with the conversation background.
- [ ] Textarea expands up to ~40vh before scrolling.
- [ ] Send button visible in all themes (light, dark, glass, high-contrast).
- [ ] User bubble visually equivalent or improved; no inline `color-mix` / `backdropFilter` object in `messages.tsx`.
- [ ] No `style={{ ... }}` objects containing raw colors in any file touched by this phase (grep check).
- [ ] Persistent context bar visible before, during, and after streaming.
- [ ] All scoped tests pass.
- [ ] Commit: `feat(wave-43): Phase D — floating composer + token cleanup`

---

## Phase E — Assistant gutter + flat tool cards

**Goal:** Assistant message content aligns on a consistent left gutter. Tool cards drop the double-framed IDE look in chat-only mode.

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/AgentChat/AgentChatMessageComponents.messages.tsx` | Normalise text block `pl-7` (line 251) and tool card `my-1.5` spacing to use the same `pl-7` (or a shared constant). Consecutive assistant blocks collapse spacing — tune `space-y-*` or introduce per-block margin control. |
| `src/renderer/components/AgentChat/AgentChatMessageComponents.assistant.tsx` | Assistant message wrapper: `max-w-[95%]` → `max-w-full` (centered in parent which already caps at `max-w-4xl`), add explicit `pl-7` gutter at the outer wrapper so ALL children inherit alignment. Drop nested per-block indent overrides. |
| `src/renderer/components/AgentChat/AgentChatToolCard.tsx` | When a context flag / prop indicates chat-only mode, drop `glass-card` + `rounded-md border` (line 151). Replace with `bg-surface-panel/50 rounded-md px-2 py-1` (flat tinted strip). Keep existing classes for IDE mode. |
| `src/renderer/components/AgentChat/AgentChatConversationBody.tsx` | `space-y-4` between messages becomes density-aware — tighter gap between consecutive assistant blocks, normal gap between user+assistant turn boundaries. |

### Subagent briefing

- **Read first:** `AgentChatMessageComponents.assistant.tsx`, `AgentChatMessageComponents.messages.tsx`, `AgentChatToolCard.tsx`, `AgentChatConversationBody.tsx`, `src/renderer/contexts/DensityContext.tsx`.
- **Gutter is ~28px (`pl-7` in Tailwind = 1.75rem = 28px).** Apply at the assistant message wrapper level, not per-block. Test visually that text blocks, code blocks, tool cards, thinking blocks, and plan blocks all start at the same column.
- **Density integration:** the existing `DensityContext` is mounted but barely used (only toggles `py-0.5` vs `py-1` in the assistant wrapper — noted in prior research). Wire density into the message-to-message spacing decision too.
- **Chat-only flag for tool cards:** easiest implementation is a prop on `AgentChatBlockRenderer` that propagates down. Or a cheap `useChatOnlyMode()` hook that reads from a single source of truth (`ChatOnlyShellWrapper` could set a context). Pick whichever keeps the diff smaller.
- **Do NOT** touch tool grouping logic (`buildRenderItems`). Spacing and styling only.
- **Scoped tests:** `npx vitest run src/renderer/components/AgentChat/AgentChatMessageComponents` and `AgentChatToolCard`.

### Acceptance criteria

- [ ] Assistant text, code, tool, thinking blocks all start at the same x-coordinate in the rendered conversation (visually verify in dev).
- [ ] Tool cards in chat-only mode are flat-tinted, no border, no `glass-card`. IDE mode unchanged.
- [ ] Vertical rhythm between consecutive assistant blocks tighter than between turns.
- [ ] Existing tests pass; add one snapshot test for the unified gutter.
- [ ] Commit: `feat(wave-43): Phase E — assistant gutter + flat tool cards`

---

## Phase F — Streaming rAF batching

**Goal:** `setStateMap` fires at most once per animation frame regardless of chunk rate. Smooth streaming on fast models. Preserve reducer purity.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/AgentChat/useRafBatchedChunks.ts` | 80 | New hook: takes the per-chunk handler (reducer application to the map) and returns a batched handler + a `flushNow()`. Owns `pendingRef`, `rafIdRef`, cleanup. |
| `src/renderer/components/AgentChat/useRafBatchedChunks.test.ts` | 100 | `vi.useFakeTimers()`-based: push 5 chunks, assert zero state updates before rAF tick, one update after. Terminal chunks (`complete`, `error`) flush synchronously + apply. `thread_snapshot` bypasses batching entirely. Unmount cancels pending rAF. |

### Modified files

| File | Change |
|------|--------|
| `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | Rework `handleChunk` to route through `useRafBatchedChunks`. The per-chunk reducer logic (currently lines 118-125) moves into the batched flush callback — it folds the pending array through `applyChunk` in order, producing a single `setStateMap` call. `thread_snapshot` still dispatches synchronously before batching. `complete` and `error` flush immediately: drain pending, apply terminal chunk, single `setStateMap`. |
| `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | Update `useStreamChunkListener` cleanup to also call `flushNow()` on unmount so no pending chunks are lost if the stream terminates at the same tick as unmount. |

### Subagent briefing

- **Read first:** `useAgentChatStreaming.ts` (full — 135 lines), `AgentChatStreamingReducers.ts` (full — understand `applyChunk` signature and the `replayBufferedChunks` loop — the batched flush does the same kind of left-fold), `useAgentChatStreaming.test.ts` (existing test surface).
- **Design sketch:**
  ```ts
  // useRafBatchedChunks.ts
  export function useRafBatchedChunks(
    onFlush: (chunks: AgentChatStreamChunk[]) => void,
  ): {
    enqueue: (chunk: AgentChatStreamChunk) => void;
    flushNow: () => void;
    cleanup: () => void;
  };
  ```
  `enqueue` pushes to `pendingRef.current`; if no rAF scheduled, schedule one. rAF callback drains `pendingRef`, calls `onFlush(drained)`, clears `rafIdRef`. `flushNow()` cancels any scheduled rAF and drains synchronously. `cleanup()` cancels rAF on unmount.
- **In `useAgentChatStreaming`:**
  ```ts
  const applyBatch = useCallback((chunks: AgentChatStreamChunk[]) => {
    setStateMap((prev) => {
      let updated: Map<string, AgentChatStreamingState> | null = null;
      for (const chunk of chunks) {
        const tid = chunk.threadId;
        if (!tid) continue;
        const threadPrev = (updated ?? prev).get(tid) ?? INITIAL_STATE;
        const next = applyChunk(threadPrev, chunk);
        if (next === null) continue;
        updated = updated ?? new Map(prev);
        updated.set(tid, next);
      }
      return updated ?? prev;
    });
  }, []);
  ```
- **Terminal-chunk semantics.** `complete` / `error` must NEVER get dropped or lag — flush the pending buffer first, then apply the terminal chunk, all inside a single `setStateMap`. Tests must cover this.
- **`thread_snapshot` is pre-batch.** It's a DOM event dispatch — keep the existing synchronous `window.dispatchEvent` call at the top of `handleChunk` unchanged.
- **jsdom's `requestAnimationFrame`:** exists but is effectively `setTimeout(fn, 0)`. Tests should use `vi.useFakeTimers()` with `vi.advanceTimersByTime(20)` to fire the rAF, or mock `requestAnimationFrame` directly with a spy that synchronously invokes the callback. Pick the pattern the rest of the codebase already uses (grep `vi.spyOn.*requestAnimationFrame` or look at existing streaming tests).
- **Do not modify the reducer.** `applyChunk` stays pure. Batching is purely an ordering concern in the caller.
- **Performance assertion (optional, in test):** fire 50 chunks synchronously; assert `setStateMap` called exactly once. This is the whole point of the feature.
- **Scoped tests:** `npx vitest run src/renderer/components/AgentChat/useAgentChatStreaming` and the new `useRafBatchedChunks.test.ts`.
- **Parent runs full suite post-commit.**

### Acceptance criteria

- [ ] 50 rapid chunks → 1 `setStateMap` call (verify via spy in test).
- [ ] `complete` chunk flushes any pending deltas then applies terminal state in same tick (no flash of "still streaming").
- [ ] `error` chunk behaves identically; no lost deltas.
- [ ] `thread_snapshot` dispatches DOM event synchronously regardless of batch state.
- [ ] Unmount during in-flight rAF does not leak a setState-on-unmounted-component warning.
- [ ] All existing `useAgentChatStreaming.test.ts` cases still pass without modification.
- [ ] Visible smoothness in manual dev-server verification (parent runs dev, sends a long prompt to a fast model, confirms no text-jitter).
- [ ] Commit: `perf(wave-43): Phase F — rAF-batched streaming chunks`

---

## Phase G — Tests, docs, CLAUDE.md updates

**Goal:** Integration test for the unified polish; docs reflect the two-shell model after legacy removal; CLAUDE.md entries for the new surfaces.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.polish.integration.test.tsx` | 120 | Mount `ChatOnlyShell` with mocked workspace; verify single background, no title-bar divider, no status bar when idle, composer is `FloatingComposerContainer`, header controls rendered, drawer uses new scrim. |

### Modified files

| File | Change |
|------|--------|
| `CLAUDE.md` (project root) | Delete the stale line about `layout.chatPrimary` in "Key Conventions" if present. Add a line: "**Chat-only polish:** composer is a `FloatingComposerContainer`; model + permission chips live in the title bar via `ChatOnlyHeaderControls`; streaming is rAF-batched." |
| `src/renderer/components/AgentChat/CLAUDE.md` | Add `FloatingComposerContainer.tsx`, `ChatOnlyHeaderControls.tsx`, `useRafBatchedChunks.ts` to the Key Files table. Note rAF-batching in the Patterns section. |
| `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` | Update architecture summary to reflect the unified background, conditional status bar, moved header controls, and `variant="chat-only"` prop on `AgentChatWorkspace`. |
| `docs/architecture.md` | Remove any reference to `chat-primary` preset. Add one sentence on the rAF-batched streaming pipeline. |
| `src/renderer/components/Layout/CLAUDE.md` | Remove `chatPrimaryPreset` from the preset list. |

### Acceptance criteria

- [ ] Integration test passes.
- [ ] All five `CLAUDE.md` files updated; no stale references to `chatPrimary`.
- [ ] `grep -rn "chat-primary\|chatPrimary" docs/ src/ CLAUDE.md` returns only historical roadmap matches.
- [ ] Commit: `docs(wave-43): Phase G — integration test + CLAUDE.md updates`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet` (per user rule `agent-model-selection.md`).
- **Isolation:** sequential phases on master; no worktrees needed.
- **Branching:** all commits on `master`.
- **Test policy:** subagents MUST NOT run `npm test` (full vitest suite, ~280s, exceeds subagent patience per memory `feedback_agent_test_verification.md`). Subagents run scoped vitest: `npx vitest run <path>`. Parent runs `timeout 360 npx vitest run` once per wave post-commit.
- **Lint policy:** subagents MUST NOT relax ESLint rules. Per memory `feedback_never_change_lint_rules.md` — `max-lines-per-function: 40`, `complexity: 10`, `max-lines: 300`, `max-depth: 3`, `max-params: 4`, `security: error`. Split the code.
- **Debug policy:** per memory `feedback_debug_before_fix.md` — after 1 failed fix, add `log.info('[trace:WAVE43-X]', ...)` and hand back to parent rather than guessing a second fix. Phase B (main-process event flow) and Phase F (streaming timing) are the highest-risk.
- **Commit policy:** one commit per phase, conventional commits format. Subagents commit locally; parent reviews aggregate diff and pushes once all phases complete (per memory `feedback_wave_push_policy.md`).
- **Scope discipline:** each phase lists exact files. If an agent thinks it needs to edit a file not listed, stop and report to parent.

### Phase dispatch order

Phases run **sequentially** (each reads output of prior):

1. **Phase A** — legacy `chat-primary` removal (isolated, low risk, clears obstacles).
2. **Phase B** — mobile QR fix (independent of chat changes; can run in parallel with A if dispatched as separate agents, but cleanest sequential).
3. **Phase C** — chrome strip + header controls (depends on A: `SessionSidebar` gate removed, clean base).
4. **Phase D** — floating composer + token cleanup (depends on C: `variant` prop exists on workspace).
5. **Phase E** — gutter + flat tool cards (depends on D: message component touched recently, don't thrash).
6. **Phase F** — rAF batching (independent of C/D/E UI work, but sequenced last so parent can manually verify streaming smoothness against the finished UI).
7. **Phase G** — integration tests + docs (requires everything).

### Per-phase briefing template

Each subagent invocation passes:
- Link to this plan (`roadmap/wave-43-plan.md`).
- The specific Phase section only (excerpted).
- Reminder of test/lint/commit rules above.
- Expected output: commit SHA + one-paragraph summary of any deviation from spec.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Config migration regresses old `chatPrimary: true` users into `immersiveChat` unexpectedly.** | The migration is intentional — the user explicitly chose chat mode before; translating to the new surface is the correct default. Document in release notes. If user wants IDE mode, one click in Settings. |
| **Moving model/permission chips to title bar creates clutter on narrow windows.** | `ChatOnlyHeaderControls` collapses to icon-only at narrow widths (CSS breakpoint, not JS). Test at 640px, 800px, 1024px. |
| **`detectLocalIp()` adapter exclusion list wrong for some user's setup** (e.g. Tailscale genuinely is their LAN). | Pairing URL rendered as copyable text means the user can see what we picked and override by editing the URL — they can type the real LAN IP manually. Full fix (user-pick interface) deferred to wave 44. |
| **rAF batching introduces a one-frame latency floor on first-paint of streamed text.** | Measure: 16ms worst-case vs. current 0ms worst-case. Imperceptible in practice; the smoothness gain dominates. If QA disagrees, lower batching granularity to microtask (`queueMicrotask`) — still one-per-task but faster. |
| **Token migration breaks a theme that wasn't tested** (high-contrast, light). | Phase D acceptance explicitly requires visual verification in all themes. Parent runs dev server and cycles themes. |
| **`variant` prop on `AgentChatWorkspace` balloons into a full branching UI over time.** | Hard rule documented in `AgentChatWorkspace` header comment: `variant` gates rendering only of `SideChatDrawer` and `BranchCompareModal`. New variant-specific behaviour MUST motivate its own prop or context, not piggyback. |
| **`mobileAccess.enabled` lazy check at request time regresses cold-start pairing flow.** | Unit test for the 503 path + integration test: enable toggle, immediately generate pairing code, expect success. |

---

## Acceptance criteria (wave-level)

- [ ] All seven phase commits present on master.
- [ ] `timeout 360 npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (parent, not subagent):
  - [ ] Fresh install with a dev config containing `layout.chatPrimary: true` → first launch migrates to `immersiveChat: true`; second launch is idempotent.
  - [ ] Mobile QR: generate, scan from phone, deep link opens, pair succeeds. Host shown below QR is a real LAN IP, not `127.0.0.1`.
  - [ ] Toggle `mobileAccess.enabled` off → on in Settings, generate pairing without relaunch — works.
  - [ ] Enter chat-only mode: background uniform, no status bar at rest, title bar has model + permission chips, composer is pill, textarea grows.
  - [ ] Send long prompt to Sonnet: streaming is smooth (no jitter); tool cards render flat; gutter aligned.
  - [ ] Exit chat mode: IDE shell unchanged, model chips back in composer footer.
- [ ] No regression in IDE mode: file tree, terminal, editor, right sidebar all work as before.

---

## Out-of-wave follow-ups (candidates for Wave 44+)

- **Cross-window IDE-tool delegation** — deferred from Wave 42. Chat-only agent can query open files / selection from the main IDE window via IPC.
- **User-pick mobile LAN interface** — full picker in Settings when `detectLocalIp()` can't decide.
- **Mobile QR: production (electron-builder packaged) pairing** — scope of this wave is dev-mode; prod packaging path for the `ouroboros://` URL scheme registration on Android/iOS is a separate deliverable.
- **Streaming backpressure telemetry** — measure actual chunk rates vs. frame rates post rAF batching; may inform a future adaptive-throttle.
- **Composer keyboard-shortcut surface** — Claude Code CLI uses `Shift+Tab` for permission mode, `Ctrl+T` for thinking toggle; mirror once the header controls land.
- **Immersive-chat telemetry** — session length, diff-acceptance rate, streaming smoothness scores compared between shells.
