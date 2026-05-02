# Wave 71 — Architecture Decision Record

## Decision 1: Re-scope from "rules" to "files + @mentions"

**Context:** The filed plan claimed *"locally-disabled rules are still sent to the agent."* Code verification showed otherwise: `useToggleHandler` in `ComposerContextPreview.tsx` routes `rule:*` IDs through `fireRuleToggleIpc` → `toggleRuleFile` IPC, which moves the rule file to `<rules-root>-disabled/`. Wave 62's `firePostSpawnRestore` runs after Claude Code reads disk. Rules are honored.

The actual bug surface: `TOGGLEABLE_KINDS = ['file', 'mention', 'rule']`. With rules going to fs, `localIds` only ever holds `file:<path>` and `mention:<i>:<label>` IDs. Those never cross the IPC boundary — the send path uses the unfiltered `contextFilePaths` and `mentionRanges` arrays.

**Pick:** Re-scope to fix the file/mention bug. Leave Wave 62's rule mechanism untouched.

**Rationale:** The trust-erosion argument applies the same way (UI checkbox does nothing → user stops trusting it). Rules already have a working solution; duplicating it for per-message overrides would add complexity without user demand. This wave matches the plan's *pattern* (thread disabled set into send path) but fixes the bug that actually exists.

**Consequences:** No `disabledRuleIds` field on `TaskRequest`. Per-message rule overrides remain a future ask if real users surface it. The popover's "all toggleable items" UX now uniformly works (rules via fs, files/mentions via IPC).

---

## Decision 2: Lift state into the workspace controller, run popover in controlled mode

**Context:** `localDisabledIds` lived in `useState` inside `ComposerContextPreview`. To filter the send payload, the send code (in `agentChatWorkspaceActionHelpers.ts`) must see the set.

**Options considered:**
- *Industry standard:* Lift state to a shared owner (workspace controller / store). Popover becomes controlled.
- *Alternative:* Callback-up pattern — popover keeps local state but bubbles each toggle up via `onLocalIdsChange` prop.

**Pick:** Lift state — controlled popover.

**Rationale:** The set is read by the send path, the cleanup-on-success path, AND the popover. Three readers means a single owner is the right shape. The controlled-popover pattern also matches how the rest of the workspace state flows (zustand store + selectors). Backward-compat: `useLocalDisabledIds` falls back to internal `useState` when the controlled props are absent, preserving non-chat mounts.

**Consequences:** Adds `disabledLocalIds` + `setDisabledLocalIds` to the zustand store, selectors, model, and the prop chain (Conversation → ComposerSection → AgentChatComposer → ComposerContextPreview). Mechanical wiring, no behavior change for non-chat mounts.

---

## Decision 3: Clear the local set after a successful send (not persist per-thread)

**Context:** The plan flagged a design question: should the local-disabled set persist per-thread (sticky preference) or clear after each send (per-message override)?

**Pick:** Clear after successful send.

**Rationale:** Matches "per-message override" mental model — the toggle expresses *"don't include this file in the next prompt I'm about to send."* Persistent per-thread state is a different feature (sticky preferences) better filed separately if real users ask for it. Clearing is simpler, requires no new storage, and avoids the surprise of *"why is this rule still off three days later?"*

**Consequences:** `applyComposerSuccess` calls `setDisabledLocalIds?.(new Set())`. If the user wants stickiness, they re-toggle. Failure path (`applyComposerFailure`) does NOT clear — the user's intent is preserved if they retry.
