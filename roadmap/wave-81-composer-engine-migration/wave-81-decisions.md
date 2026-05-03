# Wave 81 — Locked Architectural Decisions

This file records architectural decisions committed before Phase B (implementation) starts. Decisions are referenced by the wave plan at `roadmap/wave-81-composer-engine-migration/waveplan-81.md` § "Locked decisions (Phase 0 — ADR)".

Format per `~/.claude/rules/best-practice-spectrum.md`:

- Decisions involving a recommendation spectrum (industry-standard / emerging / experimental) use the full form: Context / Options considered / Pick / Rationale / Consequences.
- Routine "use this existing pattern" decisions use the abbreviated form: Context / Pick / Rationale.

---

## Decision 1: Editor engine for the chat composer

**Context:**

<!-- Fill: what's being decided, why now (the 2-3s stutter root cause), what the bar is (preserve all parity behaviors). -->

**Options considered:**

- *Industry standard:* Lexical (Meta, used in Facebook chat, Workplace, Messenger) — immutable-node model, React 19 compatible, active maintenance.
- *Emerging best practice:* Slate.js — flexible plugin architecture, large community, but heavier API surface and historically more React-version drift.
- *Experimental / cutting-edge:* TipTap (ProseMirror wrapper) — rich-text first, complex for plain-text chat composer, larger bundle.
- *In-house:* keep `rich-textarea`, fix the overlay-render anti-pattern with React.memo + portal + CSS containment. Path A from the research; cheaper but doesn't address the structural cause.

**Pick:** Lexical — industry-standard tier.

**Rationale:**

<!-- Fill: why Lexical fits the wave's constraints (React 19, perf model, active plugin ecosystem with lexical-beautiful-mentions, encapsulated migration). -->

**Consequences:**

<!-- Fill: what this commits us to (Lexical learning curve, pinning lexical-beautiful-mentions, watching for React 19 issues), what we punt to a future wave (Lexical migration of other surfaces, JSON-state draft persistence). -->

---

## Decision 2: Mention plugin and trigger routing

**Context:** `lexical-beautiful-mentions` supports multiple triggers in one plugin. Both `@` (label semantics) and `/` (action semantics) could route through it.

**Pick:** Use `lexical-beautiful-mentions` for `@` only. Slash commands handled by a custom Lexical plugin (Decision 3).

**Rationale:** Mention nodes are persisted as discrete tokens in the editor model — appropriate for `@user` (a label that survives serialization). Slash commands are *triggers for actions*, often consumed-and-cleared. Routing them through mention nodes would either persist `/clear` as a chip (wrong UX) or require post-serialization filtering (extra complexity). Cleaner to keep them separate.

---

## Decision 3: Slash-command UI integration strategy

**Context:** The existing `SlashCommandMenu.tsx` UI is preserved as a locked decision (no UI changes). Question is how Lexical drives it.

**Pick:** A small custom Lexical plugin (`SlashCommandPlugin.ts` under `lexicalComposer/`) registers an editor `update` listener, scans current text for cursor-position `/` patterns matching existing `extractSlashQuery` rules, and toggles the SlashCommandMenu's open state via callback props.

**Rationale:** Reuses 100% of the existing menu component. Slash tokens stay plain text. No mention nodes for `/`. Keeps the parity surface tight.

---

## Decision 4: Migration strategy — feature flag through phases B–E

**Context:** Migrating the composer engine touches the most-used UI surface in the app. A bad day for the user is shipping a half-done Lexical path that breaks send-flow.

**Pick:** `import.meta.env.VITE_LEXICAL_COMPOSER === '1'` env flag. `AgentChatComposerInput.tsx` branches between RichTextarea (default, phases B–E) and Lexical (flag-on). Phase F removes the branch + the flag + the `rich-textarea` dep.

**Rationale:** Cole can A/B in dev without risking a regression in his own working environment. The wave can be paused or reverted at any phase boundary by simply not flipping the flag in Phase F. Encapsulated migration footprint (`lexicalComposer/` directory + branching imports + package.json deps).

---

## Decision 5: Draft persistence schema unchanged

**Context:** Lexical's editor state can serialize to JSON (preserving mention chip positions across reloads). Current draft persistence is a plain string per thread in localStorage.

**Pick:** Keep the existing string-based per-thread draft persistence. Round-trip via `editor.getEditorState().read(() => $getRoot().getTextContent())`. JSON-state migration is deferred.

**Rationale:** Current behavior already loses partial mention positions across thread switches because chips are rebuilt from `mentions[]` store (not from draft text). The user gets no perceptible benefit from JSON-state; we'd add restore complexity for no win.

**Consequences:** Documented as a deferral in the wave plan's "Out of scope" section. A future wave can revisit if telemetry shows users wanting chip-position preservation.

---

## Decision 6: Existing helpers retained without modification

**Context:** Many existing helpers (chip bar, slash menu, mention store, draft persistence, image attachment hook, the pre-wave perf selector) are orthogonal to the engine swap.

**Pick:** Leave unchanged: `MentionChipsBar`, `SlashCommandMenu` UI, `useAgentChatContext` mentions[] store, `useAgentChatDraftPersistence`, `useImageAttachmentHandlers`, `useAgentChatThreadView` selector, the substring search in `MentionAutocompleteSupport.ts`.

**Rationale:** Each is either (a) load-bearing for general perf and orthogonal to Lexical (the threadview selector, the substring search), or (b) state-shape contract code that the new Lexical composer bridges into rather than replaces. Touching any of them adds wave scope without changing the user-visible result.
