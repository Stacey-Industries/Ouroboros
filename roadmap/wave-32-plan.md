# Wave 32 — Mobile-Responsive Refinement

## Implementation Plan

**Version target:** v2.1.0 (minor — first formal mobile readiness milestone)
**Feature flag:** `layout.mobilePrimary` (default `false`; flips to `true` after 1-week phone dogfood passes — see soak gate).
**Dependencies:** Waves 17 (preset engine), 28 (drag/drop layout — `mobile-primary` slot already scaffolded).
**Reference:** `roadmap/roadmap.md:1499-1551`.

**Prior art already on disk:**
- `src/renderer/components/Layout/AppLayout.mobile.tsx` — `MobileNavBar`, `MobilePanel` type, icon set (4 panels: files / editor / terminal / chat), button styles. Wave 28 Phase A extracted this from `AppLayout.tsx`.
- `src/renderer/components/Layout/AppLayout.tsx:169` — owns `useState<MobilePanel>('chat')` + `handleMobilePanelSwitch`. The active panel is broadcast via `data-mobile-active` attribute on the app root (line 237) and consumed entirely by CSS in `mobile.css`.
- `src/renderer/styles/mobile.css` — already wires panel switching, safe-area insets, frosted glass title bar / nav, virtual-keyboard zoom guard (`font-size:16px` on inputs), iOS bounce prevention, and bottom-nav frosted treatment, all scoped under `.web-mode @media (max-width: 768px)`.
- `src/renderer/components/Layout/layoutPresets/presets.ts:86-95` — `mobilePrimaryPreset` is a SCAFFOLD with empty slots/panelSizes/visiblePanels and three `TODO(Wave 32)` markers.
- `src/renderer/components/Layout/AppLayout.mobile.test.tsx` — vitest coverage for the nav primitives (use as the test pattern).

**What this wave is NOT:**
- A rewrite of mobile.css. Most CSS scaffolding exists; the wave fills implementation gaps the roadmap spec calls out.
- Native mobile app (Wave 33).
- Offline capability (out of scope per roadmap).
- Mobile-specific shortcuts (desktop affordance per roadmap).

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Feature flag plumbing + breakpoint hook.** Add `layout.mobilePrimary: boolean` to config schema. Add `useViewportBreakpoint()` hook returning `'phone' \| 'tablet' \| 'desktop'` from `window.matchMedia`. Add viewport meta tag (`width=device-width, initial-scale=1, viewport-fit=cover`) injection into `index.html` + web build's `index.html` if missing. | `src/main/configSchemaTail.ts` (flag), `src/main/config.ts` (default), `src/renderer/types/electron-foundation.d.ts` (mirror), `src/renderer/hooks/useViewportBreakpoint.ts` (new) + test, `index.html` (meta tag), `src/web/index.html` (meta tag) |
| B | **`mobile-primary` preset population.** Replace the empty scaffold with real slot assignments (single-pane, breakpoints `minWidth:768 → fallback:'ide-primary'`), panel sizes (left/right sidebars hidden, terminal collapsed), visiblePanels. Wire preset registry to honour the flag — when `layout.mobilePrimary` is on AND viewport < 768px, `LayoutPresetResolver` resolves to `mobile-primary`. | `src/renderer/components/Layout/layoutPresets/presets.ts` (replace scaffold), `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx` (consume flag + breakpoint), `presets.test.ts` (replace TODO assertions) |
| C | **Touch-target audit + lint rule.** Sweep every interactive element rendered inside `data-mobile-active` reachable surfaces (TitleBar mobile menu, MobileNavBar, FileTree row buttons, ChatComposer send/cancel, Terminal tab close, EditorTabBar close X). Where a button is < 44px, add a `mobile:min-h-[44px] mobile:min-w-[44px]` Tailwind variant or extend the existing `[data-layout='mobile-nav'] button { min-height: 44px }` rule in `mobile.css`. Add a custom ESLint rule `local/touch-target-min` (or a vitest snapshot test) that scans renderer files for inline `style={{ height: '<32px>' }}` on `<button>` tags rendered inside a known-mobile branch. | `src/renderer/styles/mobile.css` (extend min-target selectors), `tools/eslint-rules/touch-target-min.js` (new) + test fixture, `eslint.config.js` (register), audited components (small follow-up edits, design-token only) |
| D | **`MobileNavBar` polish + state lift.** Move `mobileActivePanel` state out of `AppLayout.tsx` into a dedicated hook `useMobileActivePanel()` so that DOM event handlers (e.g. `agent-ide:focus-agent-chat`) can `setMobileActivePanel('chat')` directly without prop-drilling. Add long-press support on a nav button (vibrate + opens panel-specific shortcut menu — phase scope: stub the shortcut menu, full content in Wave 34). Surface `activePanel` via React context (`MobileLayoutContext`) for Phase F (drawer/bottom-sheet). | `src/renderer/hooks/useMobileActivePanel.ts` (new), `src/renderer/contexts/MobileLayoutContext.tsx` (new), `AppLayout.tsx` (remove state, consume hook), `AppLayout.mobile.tsx` (no API change) + tests |
| E | **Hover-dependent UI alternatives.** At narrow breakpoints, hover-only affordances must be tap-equivalent. Concretely: (1) FileTree row inline action icons (rename / delete / new file) — currently `opacity:0` until `:hover` — switch to always-visible with a smaller hit area on phones. (2) EditorTabBar close X — same. (3) AgentChat message hover toolbar (copy / retry / branch) — replace hover-reveal with a tap-to-toggle pattern using a long-press detector or a persistent ⋯ button. Implement helper `useTapToReveal(ref)` that on tap toggles a `data-revealed` attribute the existing CSS already targets. | `src/renderer/components/FileTree/FileList.tsx` (revealed-on-mobile branch), `src/renderer/components/Layout/EditorTabBar.tabs.tsx` (close X always visible @ phone), `src/renderer/components/AgentChat/MessageHoverToolbar*.tsx` (tap-to-toggle), `src/renderer/hooks/useTapToReveal.ts` (new) + test, `mobile.css` (remove hover-only display rules where appropriate) |
| F | **Session sidebar → drawer + AgentMonitor → bottom sheet.** On phones, the left sidebar (when active via `files` tab) becomes an off-canvas drawer that slides in from the left and dims the rest. The AgentMonitor secondary views (monitor / git / analytics / memory / rules) become a bottom sheet that slides up over the chat surface. Reuse Wave 29 / Wave 25 overlay primitives if present; otherwise add `MobileDrawer.tsx` and `MobileBottomSheet.tsx` (focus-trap, swipe-down to dismiss, scrim click to close). Add `MobileLayoutContext` controls `isDrawerOpen` / `isSheetOpen`. | `src/renderer/components/Layout/MobileDrawer.tsx` (new) + test, `src/renderer/components/Layout/MobileBottomSheet.tsx` (new) + test, `RightSidebarTabs.tsx` (mobile branch swaps the dropdown trigger for the bottom-sheet), `mobile.css` (drawer/sheet z-index + scrim) |
| G | **Virtual keyboard awareness.** Composer textarea must stay above the soft keyboard. Implement `useVisualViewportInsets()` hook reading `window.visualViewport.height` and exposing it as a CSS custom property `--keyboard-inset` set on the `.web-mode` root via `document.documentElement.style.setProperty`. Update composer container in `mobile.css` to use `padding-bottom: max(env(safe-area-inset-bottom), var(--keyboard-inset, 0px))`. Editor cursor scroll: when the textarea/Monaco gains focus on phone, `scrollIntoView({ block: 'center' })`. | `src/renderer/hooks/useVisualViewportInsets.ts` (new) + test, `App.tsx` (mount the hook once at root), `mobile.css` (composer + editor focus rules), `src/renderer/components/AgentChat/AgentChatComposer*.tsx` (focus → scrollIntoView on phone) |
| H | **Monaco mobile fallback.** Monaco's worker overhead is painful on phones. When `useViewportBreakpoint()==='phone'` AND `layout.mobilePrimary===true`, render a read-only syntax-highlighted viewer (use Monaco's static `colorizeElement` or shiki — pick whichever the renderer already pulls in to avoid a new dep). For editing on phone, fall back to a plain `<textarea>` with monospace font + the same `language` highlight overlaid via a hidden Monaco colorizer. Editor-related actions (save / format / format on save) still work via the textarea path. | `src/renderer/components/FileViewer/MonacoMobileFallback.tsx` (new) + test, `src/renderer/components/FileViewer/FileViewerManager.tsx` (branch on viewport + flag), `src/renderer/components/FileViewer/MonacoEditor*.tsx` (skip mount on phone) |
| I | **Swipe gestures.** Two swipe surfaces: (1) horizontal swipe on the main content area cycles `MobileNavBar` panels in `MOBILE_NAV_ITEMS` order (files → editor → terminal → chat). (2) Horizontal swipe on the chat sidebar (when active) cycles between sessions in `SessionSidebar` order. Implement `useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold:50, axis:'x' })` hook reading `pointerdown` / `pointermove` / `pointerup` (no third-party gesture lib — keep deps clean). Block when target is inside a scrollable child (Terminal, code blocks). | `src/renderer/hooks/useSwipeNavigation.ts` (new) + test, `AppLayout.tsx` (mount on the centre column when viewport === phone), `src/renderer/components/AgentChat/SessionSidebar*.tsx` (mount on its own root for session cycling) |
| J | **Playwright mobile viewport tests.** Add a second Playwright project to `playwright.config.ts` configured with the iPhone 14 + Pixel 7 device profiles against the **web build** (not Electron). New e2e suite `e2e/mobile/mobile-nav.spec.ts` walks: load → tap each MobileNavBar item → assert `data-mobile-active` updates and the right surface is visible. New `mobile-touch-targets.spec.ts` asserts every visible `<button>` on each tab has `boundingBox().width >= 44 && height >= 44`. Document the manual 1-week phone dogfood in `roadmap/wave-32-plan.md` exit-criteria block. | `playwright.config.ts` (add `projects` array with `mobileWeb` project), `e2e/mobile/mobile-nav.spec.ts` (new), `e2e/mobile/mobile-touch-targets.spec.ts` (new), `e2e/mobile/fixtures/webBuild.ts` (helper that boots `vite preview` against `out/web`) |

**Phase order rationale:**
- A is foundational — flag + breakpoint hook unlock conditional rendering for every later phase.
- B depends on A. C is independent (CSS + lint). D depends on A (breakpoint hook used inside the lifted state).
- E + F + G are independent of each other; all depend on A and D's `MobileLayoutContext`.
- H depends on A (breakpoint hook). I depends on D (state lift) since gestures call `setMobileActivePanel`.
- J runs last; the suite needs every prior phase landed to be meaningful.

---

## Feature flag behaviour

`layout.mobilePrimary` (default `false`):
- **Off:** today's behavior. Mobile CSS still applies in `.web-mode @media (max-width: 768px)`. The `mobile-primary` preset is registered but inert (no resolver path picks it).
- **On:** when viewport width < 768px, `LayoutPresetResolver` resolves to `mobile-primary`, mounting Phase E/F/G/H/I behaviors. Desktop and tablet remain on `ide-primary`.

The flag exists to keep the desktop default boring during dogfood. Once the soak gate passes, flip the default to `true` and remove the gating one wave later (Wave 33 cleanup).

---

## Architecture notes

**Breakpoint detection (Phase A):**
- `useViewportBreakpoint()` returns `'phone' | 'tablet' | 'desktop'` from `window.matchMedia('(max-width: 768px)')` and `(max-width: 1024px)`. Memoised, listener-based — re-renders only on actual breakpoint crossings, not on every resize. Returns `'desktop'` in Electron mode regardless of window size (read `window.electronAPI?.platform === 'web'` first).
- Viewport meta: `index.html` already controls Electron, but the **web** `index.html` (served from `out/web/index.html` after the relocation in `vite.web.config.ts`) is the one that needs `viewport-fit=cover`. Verify before editing — `transformIndexHtml` may already inject this.

**Preset resolver wiring (Phase B):**
- `LayoutPresetResolverProvider.tsx` currently picks the preset from config (`layout.activePresetId`). Phase B adds: if `layout.mobilePrimary === true` AND `useViewportBreakpoint() === 'phone'`, override to `'mobile-primary'`. Otherwise fall through to the existing logic.
- `mobilePrimaryPreset` slot assignments mirror today's mobile CSS behaviour: a single visible slot at a time, switched by `mobileActivePanel`. Slot population:
  ```ts
  slots: {
    sidebarHeader: { componentKey: 'ProjectPicker' },
    sidebarContent: { componentKey: 'SidebarSections' },
    editorTabBar: { componentKey: 'EditorTabBar' },
    editorContent: { componentKey: 'CentrePaneConnected' },
    agentCards: { componentKey: 'AgentSidebarContent' },
    terminalContent: { componentKey: 'TerminalManager' },
  },
  panelSizes: { leftSidebar: 0, rightSidebar: 0, terminal: 32 },
  visiblePanels: { leftSidebar: false, rightSidebar: false, terminal: false },
  breakpoints: { minWidth: 768, fallbackPresetId: 'ide-primary' },
  ```
  All panels mounted (state preservation) but visually hidden via CSS — same `display:none` pattern Wave 17 uses for collapsed panels.

**Touch-target lint rule (Phase C):**
- The existing `mobile.css` rule `[data-layout='mobile-nav'] button { min-height: 44px; min-width: 44px }` only covers the bottom nav. Phase C extends it via Tailwind `mobile:` variant on every component-rendered button reachable from a phone surface, and adds an AST-based ESLint custom rule that flags `<button style={{ height: '<32px' }}` or `className="...h-3..."` patterns inside files matching a known mobile branch.
- Lint rule lives in `tools/eslint-rules/touch-target-min.js` and is registered as `local/touch-target-min` in `eslint.config.js` (project already has `eslint-plugin-local-rules`-style infra — verify before assuming; if not, use a vitest snapshot scanner instead).

**Hover-reveal alternatives (Phase E):**
- `useTapToReveal(ref)` adds a `pointerdown` listener that toggles `data-revealed` on the ref. Outside-tap collapses. Existing CSS already supports `:hover, [data-revealed]` selectors in many places — verify by grep before adding new CSS.
- For ChatMessage hover toolbar: prefer "always-visible compact ⋯ button on phone" over tap-to-toggle. Discoverability beats density on small screens.

**Drawer / Bottom sheet (Phase F):**
- Reuse `react-focus-lock` if already a dep; otherwise use a small in-house focus trap (loop tab on first/last focusable). Both surfaces accept `onClose` and render a scrim with `role="presentation"`.
- Swipe-down-to-dismiss on bottom sheet uses Phase I's `useSwipeNavigation` hook with `axis: 'y'`, `direction: 'down'`. Phase F may land before Phase I lands — implement a minimal local pointer handler now and refactor when I lands.

**Visual viewport / virtual keyboard (Phase G):**
- iOS Safari and Android Chrome both expose `window.visualViewport.height`. When the soft keyboard opens, `visualViewport.height` shrinks. Compute `keyboardInset = window.innerHeight - window.visualViewport.height` and clamp to `>= 0`.
- Apply via `--keyboard-inset` CSS var; composer's `padding-bottom: max(env(safe-area-inset-bottom), var(--keyboard-inset, 0px))` ensures it sits above the keyboard without breaking notched-phone safe areas.
- Skip the hook entirely when `window.visualViewport === undefined` (older browsers).

**Monaco mobile fallback (Phase H):**
- Monaco workers cost ~5MB transferred + significant decode time. On a phone over LTE, this is the difference between a 2-second open and a 12-second open.
- Read-only path: `monaco.editor.colorizeElement(domNode, { mimeType, theme })` — synchronous, no worker. Already shipped in monaco-editor.
- Editable path: `<textarea>` overlaid with a transparent colorize layer is fragile (cursor positioning, selection rendering). Simpler: textarea-only on phone, with a "Open in desktop" CTA in the editor chrome.
- Gate behind `layout.mobilePrimary === true` so desktop never sees the fallback even at narrow window widths.

**Swipe gestures (Phase I):**
- Pointer events only — no touch event fallback (every supported phone browser supports pointer events as of 2026).
- Block swipe handling when `event.target.closest('[data-no-swipe]')` matches. Annotate Terminal, Monaco, code blocks, and any horizontal scroller with `data-no-swipe`.
- Threshold 50px + velocity check to avoid accidental nav on slow scroll.

---

## ESLint split points to anticipate

- `AppLayout.tsx` — already at the limit. Phase D removes ~30 lines (the mobile state). Don't add new lines back; if anything, this is an opportunity to extract another helper.
- `mobile.css` — currently 335 lines and not subject to the JS line cap, but it's getting hard to navigate. Phase F may want to split into `mobile.layout.css` + `mobile.surfaces.css`. Keep imports in `globals.css`.
- `MonacoMobileFallback.tsx` — small (≤ 80 lines) by design.
- `useSwipeNavigation.ts`, `useVisualViewportInsets.ts`, `useTapToReveal.ts` — pure hooks, easy to keep < 100 lines each.
- New `MobileDrawer.tsx` and `MobileBottomSheet.tsx` — use composition; if they grow, extract a `MobileOverlayShell.tsx` parent that owns scrim + focus trap + body-scroll lock.

---

## Risks

- **Monaco mobile fallback regresses editing UX.** Mitigation: textarea path is opt-in via flag. Desktop unaffected.
- **`useVisualViewportInsets` jitter on iOS.** Safari fires resize events during scroll-induced URL bar collapse. Mitigation: debounce the CSS var update at 100ms and only apply when the delta is > 50px.
- **Swipe conflicts with horizontal scrollers.** Mitigation: `data-no-swipe` opt-out, plus block when the swipe starts inside an element whose `scrollWidth > clientWidth`.
- **Touch-target lint rule false positives.** Mitigation: rule only fires on `<button>` elements with literal small heights in `style` or `className`; props-derived sizes are ignored. Author can disable per-line with the standard ESLint disable comment.
- **`mobile-primary` preset diverges from CSS-driven mobile behavior.** Mitigation: Phase B explicitly maps preset state onto the existing `data-mobile-active` attribute path; CSS does the work, preset just records intent.
- **Bottom sheet steals focus during streaming chat.** Mitigation: don't auto-open; open only on explicit user tap on a secondary view chip. Closing returns focus to the trigger.

---

## Acceptance

- iOS Safari + Chrome Android can: load the web build, tap each `MobileNavBar` panel, send a chat prompt, view terminal output, browse the file tree, open and view a file.
- All visible interactive elements pass the 44 px audit on phone viewport (`mobile-touch-targets.spec.ts` green).
- No interaction on phone requires a hover (sweep verified manually + via Phase E updates).
- Bottom nav switches surfaces in < 100ms (Phase B preset switch is purely CSS-driven, no React re-render storm).
- Soft keyboard does not obscure the composer (manual check on iPhone Safari, Android Chrome).
- `npm run build` green; `npx tsc --noEmit` clean; `npm run lint` 0 errors; `timeout 540 npx vitest run` all pass; `npx playwright test --project=mobileWeb` all pass.

---

## Soak gate

**Do not flip `layout.mobilePrimary` to `true` (default) until:**
1. 1-week phone dogfood by primary user against a desktop instance over LAN — chat, file browse, terminal output, prompt send all usable.
2. `mobile-touch-targets.spec.ts` green across iPhone 14 + Pixel 7 viewports.
3. Zero open `mobile`-tagged regressions in the last 3 days of dogfood.
4. WebSocket reconnect (Wave 32 doesn't ship reconnect/resume — that's the Phase E risk in roadmap.md:1546; if it bites during dogfood, add a sub-phase or defer the flip).

When flipping the flag default, also: bump `roadmap/session-handoff.md` notes, add a follow-up to remove the flag entirely in Wave 33 cleanup, and record the new default in `MEMORY.md`.

---

## Per-phase commit message format

`feat: Wave 32 Phase X — short summary`

Examples:
- `feat: Wave 32 Phase A — mobile feature flag + viewport breakpoint hook`
- `feat: Wave 32 Phase B — mobile-primary preset population + resolver wiring`
- `feat: Wave 32 Phase C — touch-target audit + lint rule`

Trailer on every commit:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**No `--no-verify`. No ESLint rule relaxation. No push from subagents.** Parent reviews aggregate diff, runs full test suite (`timeout 540 npx vitest run`), and pushes once after Phase J commits.
