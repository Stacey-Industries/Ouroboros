---
status: LOCKED
created: 2026-05-17
updated: 2026-05-17
wave: 94
slug: chat-workbench-completion
---

# Wave 94 — Architecture Decisions

Companion to `waveplan-94.md`. Captures the five Phase-0 decisions that unblock Phases A–E. Decision 1 was pre-locked during the 2026-05-17 smoke-walk diagnostic; Decisions 2–5 locked 2026-05-17 in session with user.

---

## Decision 1: Title-bar surface split

**Context:** Wave 89's pivot left utility + artifact surfaces sharing a single `RightPaneToggleButton` with `lastRightPaneView` cycling. Users could only reach utility via implicit auto-open events (e.g., approval prompt) — no manual entry point. Smoke walk confirmed Activity/Approvals/Monitor/Rules were effectively dead UI.

**Options considered:**
- *Option A:* Two distinct toggle buttons in title bar (utility + artifact), each owning its own surface.
- *Option B:* Single button with dropdown menu listing both surfaces.
- *Option C:* Keep cycling button but add a long-press / right-click affordance.

**Pick:** Option A — locked during 2026-05-17 diagnostic.

**Rationale:** B and C both leave utility partially hidden behind an extra interaction. A is the only option where both surfaces are equally discoverable. Adds one button to the title bar; the bar has the width.

**Consequences:** `WorkbenchPanelToggleStrip` gains `UtilityPaneToggleButton` + `ArtifactPaneToggleButton` as siblings. `useChatWorkbenchLayout` exposes `toggleUtility()` + `toggleArtifact()` directly; the legacy `toggleRightPane` + `lastRightPaneView` cycling stays for any keyboard-shortcut consumers.

---

## Decision 2: Per-project terminal state shape

**Context:** Wave 89 left dock slots sharing a global session pool. Switching projects on the outer rail leaves the previous project's sessions still attached to the dock slots — confusing, and a leak vector. The shell needs per-project session ownership with atomic project-switch semantics.

**Options considered:**
- *2a — Industry standard:* New `useProjectTerminals(activeProject)` hook, single source of truth, replaces per-slot `useTerminalSessions`. State shape `Map<projectPath, ProjectTerminalState>`. Atomic swap on project change.
- *2b — Emerging:* Keep per-slot `useTerminalSessions` and add a project-key dimension to its persistence layer. Less invasive but dock slots still share global pool — switching has to filter visible set rather than swap.
- *2c — Experimental:* Lift session state into `ProjectContext` and expose via selector hooks. Most general; biggest refactor; overloads context with runtime PTY state.

**Pick:** 2a — locked 2026-05-17.

**Rationale:** Cleanest atomic switch, matches user mental model of "this project's terminals." 2b leaves stale single-project callers around and a confusing transitional state. 2c overloads `ProjectContext` with PTY runtime state that doesn't belong there.

**Consequences:** New `useProjectTerminals` hook in `src/renderer/hooks/`. New electron-store key `terminalSessionsPerProject` with migration from existing per-window-roots persistence (existing data discarded — sessions are runtime, not durable user content). Phase B becomes load-bearing — Phases C and D consume this hook.

---

## Decision 3: Diff-review snapshot strategy

**Context:** Phase E wires the diff-review producer to terminal Claude sessions' write-class tool calls. Open: when should `git.snapshot` fire?

**Options considered:**
- *3a — Industry standard:* Always-on. `pre_tool_use` hook captures `git.snapshot` synchronously for every Write/Edit/MultiEdit. Adds git-commit latency to every write regardless of whether the user opens diff review.
- *3b — Project convention:* Opt-in setting `ClaudeCliSettings.enableTerminalDiffReview`, default `true` per the "new features default to true" rule. Pays latency only when enabled; off-switch exists if it bites.
- *3c — Experimental:* Background async snapshot, doesn't block the tool call. Race possible where pre-state isn't captured before tool completes; needs a "no pre-state available" fallback in review UI.

**Pick:** 3b with default `true` — locked 2026-05-17.

**Rationale:** Matches existing `feedback_defaults_true` convention. Gives users an off-switch if `git.snapshot` cost shows up in their workflow without forcing them to discover the feature. 3c's race condition adds UI complexity (empty-state path) we don't need pre-launch.

**Consequences:** New `enableTerminalDiffReview: boolean` on `ClaudeCliSettings` (default `true`). Phase E gates all hooks-tap behavior behind this flag. If perf bites in practice, escalate to 3c as a follow-up — not now.

---

## Decision 4: Inner-rail Terminals tab promote semantics

**Context:** With per-project session lists in the rail, clicking a rail terminal entry should activate it in a dock slot. Open: which slot, and what's the affordance?

**Options considered:**
- *4a — VS Code parity:* Single-click promotes to the focused slot (or `primary` if neither focused). Right-click opens a context menu for explicit slot pick.
- *4b — Always explicit:* Single-click always opens a menu asking which slot.

**Pick:** 4a — locked 2026-05-17.

**Rationale:** VS Code parity; lowest friction for the common case (user knows which slot they want active). Power-users keep the explicit path via right-click. 4b adds a click to every promote.

**Consequences:** `InnerSidebarTerminals` needs `focusedSlot` awareness from `useChatWorkbenchLayout` (or equivalent). Existing right-click context-menu pattern from `DockSlot.tsx` likely reusable for explicit slot pick.

---

## Decision 5: Tab strip placement within slot header

**Context:** Phase C adds tabs to each dock slot. Open: where do the tabs live relative to the 28px `SlotHeader` (Wave 89 Phase 4c)?

**Options considered:**
- *5a — Compact:* Tabs replace the slot label (`Primary` / `Shell`) when sessions exist. Empty-slot state still shows the label.
- *5b — Always-labeled:* Tabs render below a persistent slot label (50px+ chrome).

**Pick:** 5a — locked 2026-05-17.

**Rationale:** Reclaims vertical space. The label is redundant identity once a tab is named — sessions ARE the slot's identity once spawned. Empty-state retains the label so the slot's purpose is still discoverable before first spawn.

**Consequences:** `SlotHeader` becomes conditional — `sessions.length === 0` renders the legacy label; otherwise it renders the tab strip. Tab strip max-height stays at 28px so chrome doesn't grow.
