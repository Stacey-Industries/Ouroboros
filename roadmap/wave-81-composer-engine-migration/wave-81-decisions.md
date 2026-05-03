# Wave 81 — Locked Architectural Decisions

This file records architectural decisions committed before Phase B (implementation) starts. Decisions are referenced by the wave plan at `roadmap/wave-81-composer-engine-migration/waveplan-81.md` § "Locked decisions (Phase 0 — ADR)".

Format per `~/.claude/rules/best-practice-spectrum.md`:

- Decisions involving a recommendation spectrum (industry-standard / emerging / experimental) use the full form: Context / Options considered / Pick / Rationale / Consequences.
- Routine "use this existing pattern" decisions use the abbreviated form: Context / Pick / Rationale.

---

## Decision 1: Editor engine for the chat composer

**Context:**

The AgentChat composer at `src/renderer/components/AgentChat/AgentChatComposerInput.tsx` uses `rich-textarea` v0.27, an overlay-style React component that re-renders the highlight token tree from scratch on every value change. Live session investigation on 2026-05-02 showed this pattern produces 2-3 second renderer freezes when backspacing through inserted `@` mentions — confirmed via the `[trace:fuse-search]` instrumentation that surfaced 300-450ms Fuse.js searches doubled by React StrictMode in dev. Pre-wave fixes (substring search replacing Fuse, view selector for the conversation, memoized context preview) reduced the search cost to ~5ms but residual stutter remains. Research (haiku-research-extractor on 2026-05-02 via Context7, sources `/facebook/lexical` and `/sodenn/lexical-beautiful-mentions`) attributes the residual stutter to `rich-textarea`'s render-children pattern: every keystroke re-runs `tokenizeComposerHighlights` over the full value and re-renders all spans, not just the affected range. The bar is preserving every existing composer behavior — `@` mention dropdown with file/folder/diff/terminal/codebase/symbol items, `/` slash command menu, per-thread draft persistence, image paste, drag-from-FileTree, quote-to-composer, auto-resize, mid-turn inject button, send/stop/queue states — while eliminating the structural cause of per-keystroke full-tree re-renders.

**Options considered:**

- *Industry standard:* Lexical (Meta, used in Facebook chat, Workplace, Messenger) — immutable-node model, React 19 compatible, active maintenance.
- *Emerging best practice:* Slate.js — flexible plugin architecture, large community, but heavier API surface and historically more React-version drift.
- *Experimental / cutting-edge:* TipTap (ProseMirror wrapper) — rich-text first, complex for plain-text chat composer, larger bundle.
- *In-house:* keep `rich-textarea`, fix the overlay-render anti-pattern with React.memo + portal + CSS containment. Path A from the research; cheaper but doesn't address the structural cause.

**Pick:** Lexical — industry-standard tier.

**Rationale:**

Four independently weighted factors all favor Lexical over the alternatives:

1. **Reconciliation model fits the bug.** Lexical's immutable-node tree commits a delta per keystroke that touches only the affected text node. `rich-textarea` re-renders the entire highlight overlay; Slate has the same issue at scale; TipTap inherits ProseMirror's transactional model which is closer to what we want but ships a much larger bundle. The user-visible bug is structurally caused by overlay-render-everything; Lexical structurally eliminates it.
2. **React 19 compatibility, today.** Lexical core and `@lexical/react` are explicitly tested against React 19 per Context7 docs. `lexical-beautiful-mentions` (sodenn, benchmark 92.5) supports the same. Slate has a history of React major-version regressions; TipTap's React adapter lags ProseMirror core releases.
3. **Plugin ecosystem covers our parity surface.** `lexical-beautiful-mentions` provides exactly the `@`-trigger + chip token + custom menu component shape we need, with a stable `useBeautifulMentions` hook for programmatic insertion (drop-from-filetree, quote-to-composer). PlainTextPlugin handles the rest. We don't need to write a custom mention engine.
4. **Encapsulation is cheap.** New code lives under `src/renderer/components/AgentChat/lexicalComposer/`. The existing helpers (`MentionChipsBar`, `SlashCommandMenu`, `mentions[]` store, draft persistence, image attachments, the pre-wave perf fixes) all stay. The bridge surface from Lexical → existing helpers is small and well-defined per the audit phase. If Lexical surfaces an unexpected blocker mid-wave, reverting is 1 directory + 1 dependency line + a branching import.

The in-house "fix `rich-textarea`" path was rejected because the research determined it would only get to 100-150ms responsiveness (memoize tokenization + portal dropdown + CSS contain) versus Lexical's 16ms target. The user's reported symptom is "perceptible stutter," not "slow but functional" — Path A's ceiling is below the bar.

**Consequences:**

What this commits us to:

- Adding three runtime dependencies (`lexical`, `@lexical/react`, `lexical-beautiful-mentions`) and removing one (`rich-textarea`) at Phase F. Net dependency count rises by 2.
- Pinning `lexical-beautiful-mentions` to a specific minor version verified against React 19 at wave start. If the upstream surfaces a React 19 incompatibility we can't work around, fallback per the wave-plan risk row is to build a custom mention plugin on raw Lexical primitives — costs ~1 day of additional work in Phase C.
- A small Lexical learning curve for the next implementer who touches the composer. Mitigation: the audit phase produces an integration-seam document and sequence diagram before any implementation begins; the existing helpers (chip bar, slash menu, store) are unchanged so the surface area to learn is narrow.
- A custom Lexical plugin (`SlashCommandPlugin.ts`) becomes part of our maintenance footprint. The plugin is small (~50 lines) and its contract is stable — it watches editor state for cursor-position `/` patterns and toggles the existing `SlashCommandMenu` open state. Documented in the Phase D test surface.
- Auto-resize behavior moves from `rich-textarea`'s `autoHeight` JS to CSS rules on the ContentEditable container. Acceptable visual difference of up to ~4px is documented as a known regression in the wave-plan risk table.

What we punt to a future wave:

- **Lexical migration of other text inputs.** The IDE has other text-entry surfaces (Settings panel inputs, search overlays, terminal command-palette) — none of those have the perf problem this wave addresses, and no parity bar pushes us to migrate them. Each is a separate decision; keep the existing implementations.
- **JSON-state draft persistence.** Lexical can serialize `editor.getEditorState().toJSON()` to preserve mention chip positions across thread switches and reloads. Current behavior already loses partial mentions on thread switch (chips rebuild from `mentions[]` store, not from draft text). No user-visible win; the schema migration adds restore complexity. A future wave can revisit if telemetry shows users wanting chip-position fidelity.
- **Removing the `useAgentChatThreadView` selector and `useContextPreview` memoizations** introduced pre-wave. These are general perf wins regardless of editor engine; they remain after this wave. Their removal is not anticipated but if a future wave reshapes the chat-only conversation tree they may become unnecessary.

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
