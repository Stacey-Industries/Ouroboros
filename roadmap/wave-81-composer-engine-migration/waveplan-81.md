# Wave 81 — Composer Engine Migration to Lexical

## Status

DRAFT · target v2.12.0 · drafted 2026-05-02.

## Context — why this wave exists

The chat composer at `src/renderer/components/AgentChat/AgentChatComposerInput.tsx` uses `rich-textarea` v0.27 with a render-children overlay pattern (`AgentChatComposerInput.tsx:215-249`). Live session investigation on 2026-05-02 surfaced 2-3 second renderer freezes when backspacing through inserted `@` mentions in the chat-only window. Root-cause traces showed Fuse.js fuzzy search costing 300-450ms per call against the 5K-file index (`MentionAutocompleteSupport.ts` per pre-wave traces), doubled by React StrictMode in dev. A pre-wave fix replaced Fuse with ranked substring matching (commit pending in this branch) and reduced search cost to ~5ms — but residual stutter remains, perceptible as "backspace stops, then commits 2-3 chars at once."

Research (haiku-research-extractor, 2026-05-02; sources: facebook/lexical and sodenn/lexical-beautiful-mentions via Context7) attributes the residual stutter to `rich-textarea`'s overlay model: every keystroke re-runs `tokenizeComposerHighlights` over the full value and re-renders all spans, not just the affected range. The `/` slash-command path doesn't exhibit the stutter despite using the same tokenizer, because `SlashCommandMenu` filters a small static list (~20 items) instead of a 5K file index. The structural fix is to swap the editor engine to Lexical, whose immutable-node model only reconciles the affected text node per keystroke.

Companion changes already landed in this branch (pre-wave) that are NOT this wave's deliverable but are load-bearing for it: (1) `.claude` skipped in `useProjectFileIndex.ts` SKIP_DIRS; (2) Fuse replaced with ranked substring in `MentionAutocompleteSupport.ts`; (3) `useAgentChatThreadView` selector added to stop conversation re-rendering on every keystroke; (4) `mentionLabels`/`pinnedFileNames` memoized through `useContextPreview`. All four stay after this wave — they are general-perf fixes, not engine-specific.

## Goal

Replace the `rich-textarea` engine in the AgentChat composer with a Lexical editor + `lexical-beautiful-mentions` plugin, eliminating per-keystroke full-tree span re-renders that cause stutter when editing `@` mentions. The composer preserves every existing behavior (mention dropdown, slash command menu, draft persistence, image paste, drag-from-FileTree, quote-to-composer, auto-resize, mid-turn inject button, send/stop/queue states) gated behind a `VITE_LEXICAL_COMPOSER` feature flag through phases B-E, then made default and `rich-textarea` removed in phase F. After this wave, backspacing through a 50-char `@` mention in the chat-only window produces no perceptible stutter, and `package.json` no longer depends on `rich-textarea`.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-81-composer-engine-migration/wave-81-decisions.md`.

1. **Editor engine: Lexical (`lexical` + `@lexical/react`)** over Slate, ProseMirror, TipTap, or in-house overlay. Industry-standard for React 19 chat composers in 2026; immutable-node reconciliation eliminates the per-keystroke full-tree-render anti-pattern; React 19 compatible; actively maintained by Meta. The full spectrum (industry-standard / emerging / experimental) is recorded in the ADR per `~/.claude/rules/best-practice-spectrum.md`.
2. **Mention plugin: `lexical-beautiful-mentions` (sodenn) wired with `@` trigger only** — NOT routed through the plugin for `/`. Mentions are label semantics; slash commands are action semantics, and `lexical-beautiful-mentions` would create mention nodes for both, which is wrong for `/`.
3. **Slash-command handling: a small custom Lexical plugin watches editor state for cursor-position `/` patterns** and drives the existing `SlashCommandMenu.tsx` UI unchanged. Slash tokens stay plain text; no mention nodes for `/`.
4. **Migration strategy: feature flag (`VITE_LEXICAL_COMPOSER` env var)** through phases B-E so the new path can be toggled in dev without ripping out the existing engine. Phase F removes the flag and the `rich-textarea` dep.
5. **Draft schema unchanged: per-thread string-based draft persistence (localStorage `agentChat:draft:` prefix) is preserved.** JSON-state migration to preserve mention chip positions across reloads is deferred — current behavior already rebuilds chips from `mentions[]` store, not from draft text.
6. **Existing helpers stay:** `MentionChipsBar`, `SlashCommandMenu` UI, `useAgentChatContext` mentions[] store, `useAgentChatDraftPersistence`, `useImageAttachmentHandlers`, `useAgentChatThreadView` selector. Only the textarea engine + its tokenizer change.

## Scope

**In scope:**

- New `src/renderer/components/AgentChat/lexicalComposer/LexicalChatComposer.tsx` (and supporting plugins/hooks under that directory)
- `src/renderer/components/AgentChat/AgentChatComposerInput.tsx` — branches between rich-textarea (default) and Lexical (flag-on) through phases B-E, defaults to Lexical in phase F
- `lexical`, `@lexical/react`, `lexical-beautiful-mentions` added to `package.json`
- `rich-textarea` removed from `package.json` in phase F
- Behavior parity: Enter-to-send, Shift-Enter-newline, Escape-clear, Tab-cycle-permission, ArrowUp-restore-last-user-message, `@` mention dropdown (file/folder/diff/terminal/codebase/symbol), `/` slash command menu (existing static + dynamic commands), per-thread draft persistence + restore, image paste, drag-from-FileTree drop → mention insertion, `agent-ide:quote-to-composer` event handling, auto-resize up to 40vh, mid-turn inject button, send/stop/queue button states
- `MentionChipsBar` continues to reflect `mentions[]` store contents (no behavioral change to the chip bar itself)
- `AgentChatComposerInput.test.tsx` rewritten to test the Lexical path in phase F
- Manual smoke entry in `roadmap/wave-81-composer-engine-migration/wave-81-auto-brief.md` per `~/.claude/rules/manual-smoke-gate.md`

**Out of scope:**

- JSON-state draft persistence (preserves mention chip positions across reload) — deferred to a future wave; not user-visible win for this wave's stutter problem
- Rich-text formatting (bold/italic/code) in composer — composer remains plain text + tokens
- Mobile / touch-target review of the new ContentEditable — separate mobile-responsive wave (per roadmap.md arc structure)
- Multi-line code-block syntax highlighting in composer — out
- Lexical migration of any *other* surface in the app (terminals, file viewer, settings text inputs) — composer-only this wave
- Migration of the Fuse-replacement substring search to a smarter algorithm — pre-wave fix is sufficient; revisit if telemetry shows otherwise
- Removing the `useAgentChatThreadView` selector — keep; it's load-bearing for general perf and orthogonal to engine swap

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| A | Architect pass — Lexical integration audit | sonnet-architect | Read-only deliverable to `roadmap/wave-81-composer-engine-migration/phase-a-audit.md`. Sequence diagram of the chat-only composer keystroke path: ContentEditable input → Lexical editor state → BeautifulMentionsPlugin trigger detection → menuItemComponent dropdown → mention insertion → bridge to `useAgentChatContext.addMention` → `mentions[]` store update → `MentionChipsBar` re-render. **Diagram terminus per Site 1: chat-only composer textarea visually reflects an inserted blue mention chip after `@` selection in a live IDE chat-only window with `VITE_LEXICAL_COMPOSER=1` set** — a user-observable endpoint Cole confirms by running the dev build. The audit also enumerates integration seams (which existing helpers stay, which retire), drop-handler reshape for ContentEditable vs textarea geometry, and the slash-command plugin's text-scan strategy. **API-surface verification (mandatory before Phase B dispatches):** query Context7 (`/sodenn/lexical-beautiful-mentions` and `/facebook/lexical`) and lock the exact names + signatures of (a) the trigger / mention-selection callback used by `BeautifulMentionsPlugin` (likely `onMentionsChange` or `onSelectOption` — verify), (b) the programmatic insertion API used in Phase E for drop-from-FileTree (`useBeautifulMentions` hook's `insertMention`, or equivalent), (c) `registerCommand` priority constants for the IME / Enter / paste interception, (d) the verified-working version of `lexical-beautiful-mentions` against React 19 (pin to that minor in Phase B). Audit document lists each name as "verified against ctx7 on 2026-05-02 — see `<source-id>`." Phase B/C/D/E descriptions inherit the locked names from this audit. |
| B | Foundation: feature-flagged Lexical composer shell | sonnet-implementer | Install `lexical`, `@lexical/react`, `lexical-beautiful-mentions`. Create `src/renderer/components/AgentChat/lexicalComposer/` directory with `LexicalChatComposer.tsx` (PlainTextPlugin + HistoryPlugin + OnChangePlugin + custom keyboard plugin). `AgentChatComposerInput.tsx` branches on `import.meta.env.VITE_LEXICAL_COMPOSER === '1'` to mount Lexical vs RichTextarea. No mentions, no slash commands yet — just plain text + draft sync (string round-trip via `editor.getEditorState().read(() => $getRoot().getTextContent())`) + the existing keyboard contract via a custom Lexical key-handler plugin: Enter-to-send (suppressed if `event.isComposing` is true OR IME composition is active — match existing `handleComposerKeyDown` semantics), Shift-Enter-newline, Escape-clear, Tab-cycle-permission, **ArrowUp-restore-last-user-message ONLY when the caret is at the editor start AND the draft text is empty** (existing gating in `AgentChatComposerKeyHandlers.ts` — port faithfully, do not relax). Auto-resize CSS for ContentEditable container (max-height: 40vh). |
| C | `@` mention parity | sonnet-implementer | Wire `BeautifulMentionsPlugin` with `@` trigger only, **using the API names locked in Phase A's audit** (do not rediscover; if the audit's locked name differs from a name written here, the audit wins). Custom `menuItemComponent` re-uses styling/icons from existing `MentionAutocomplete.tsx` (file/folder/diff/terminal/codebase/symbol type colors and SVG icons). Bridge the mention-selection callback to existing `useAgentChatContext.addMention` so `mentions[]` zustand store remains the single source of truth for context preview / send pipeline. Backspace-into-mention removes the chip via the chip-removal callback identified in the audit. Tests: trigger detection, store-bridge call, backspace removal. |
| D | `/` slash command integration | sonnet-implementer | Build a small custom Lexical plugin (`SlashCommandPlugin.ts` under `lexicalComposer/`) that registers an editor `update` listener, scans current text for cursor-position `/` patterns matching the existing `extractSlashQuery` rules, and drives the existing `SlashCommandMenu.tsx` component (no UI change). Slash tokens remain plain text — NOT routed through `BeautifulMentionsPlugin`. On selection: existing `selectComposerSlash` runs the action OR replaces with `/cmdId ` plain text. Tests: pattern detection at various cursor positions, menu open/close, selection behavior. |
| E | Auxiliary feature parity | sonnet-implementer | Image paste: custom Lexical paste plugin that intercepts clipboard items at `COMMAND_PRIORITY_HIGH`, calls existing `useImageAttachmentHandlers.handlePaste` for image files, lets text fall through to default handling. Drag-from-FileTree drop: custom drop handler on the ContentEditable container that parses the existing JSON dataTransfer payload and inserts a mention via `editor.update()` + the programmatic mention-insertion hook locked in Phase A's audit (e.g. `useBeautifulMentions().insertMention(...)` — use the audit's verified name). `agent-ide:quote-to-composer` event listener uses `editor.update()` + `TextNode` insertion to append text. **Mid-turn inject button: verify positioning, fix if it shifts.** Compute `MidTurnInjectButton`'s top/right offsets against the ContentEditable's bounding box; if the button visibly shifts vs. the legacy RichTextarea anchor, wrap the composer in a positioning shim div to preserve the existing visual anchor. Smoke-check by opening a chat-only window with the flag on and confirming the inject button lands in the same pixel zone as legacy. |
| F | Cutover + cleanup | sonnet-implementer | Flip `VITE_LEXICAL_COMPOSER` default behavior: Lexical mounts unconditionally; legacy RichTextarea path deleted from `AgentChatComposerInput.tsx`. Remove `rich-textarea` from `package.json` + `package-lock.json`. Verify `grep -r "from 'rich-textarea'" src/renderer` returns empty. Rewrite `AgentChatComposerInput.test.tsx` to test Lexical surface (existing tests assert RichTextarea-specific behavior). Append a Lexical-migration gotcha entry to `src/renderer/components/AgentChat/CLAUDE.md`. Manual smoke + result brief at `roadmap/wave-81-composer-engine-migration/wave-81-auto-brief.md` per `~/.claude/rules/manual-smoke-gate.md`. |

### Phase ordering

Phases execute strictly sequentially: A → B → C → D → E → F.

```
A (audit) → B (shell + flag) → C (@) → D (/) → E (aux) → F (cutover)
```

B requires A's audit (integration seams, slash plugin strategy). C requires B (Lexical mounts; mention plugin attaches). D requires C (verify slash plugin doesn't race with `@` trigger detection on shared editor state). E requires D (full parity feature surface to attach paste/drop/quote handlers to). F requires E (every behavior must work behind the flag before it's flipped). No parallelization opportunities — each phase produces the substrate the next builds on.

## Risks

| Risk | Mitigation |
|---|---|
| ContentEditable selection / cursor / IME composition diverges from textarea (RTL, screen reader, Asian-language input) | Phase A audit explicitly enumerates IME / RTL test cases. Phase B keyboard plugin handles compositionstart/compositionend events. Manual smoke (Phase F) tests with at least one IME input mode if available locally. |
| `lexical-beautiful-mentions` has a pending React 19 issue not yet surfaced | Pin to the latest version that's verified-working at wave start. If a blocker surfaces, fall back to building a custom mention plugin on raw Lexical primitives — costs ~1 day of additional work. |
| Custom slash-command plugin races with `BeautifulMentionsPlugin`'s `@` matcher (both run on every editor state change) | Phase D test suite includes a mixed `@user /clear` cursor-position case to verify both plugins coexist. **Use explicit Lexical command priorities, not registration order** — register slash-plugin handlers at `COMMAND_PRIORITY_LOW` so `BeautifulMentionsPlugin` (which registers at the default `COMMAND_PRIORITY_NORMAL`) consumes `@` triggers first; the slash plugin only acts on text that wasn't claimed. (Lexical resolves `registerCommand` listeners by explicit priority arg, not by registration order — the original wording was wrong.) |
| Auto-resize CSS for ContentEditable doesn't match `rich-textarea`'s `autoHeight` pixel-for-pixel | Acceptable visual regression up to ~4px difference; documented in Phase F result brief. If user reports visible jank, revisit with a ResizeObserver-based adjuster post-wave. |
| Image paste handler must run before Lexical's default paste-to-text | Custom paste plugin uses `editor.registerCommand(PASTE_COMMAND, fn, COMMAND_PRIORITY_HIGH)` to intercept first. Phase E tests verify image priority. |
| Drag-from-FileTree drop event landing target shape changes (textarea → ContentEditable div) | Phase E custom drop handler attached to the ContentEditable container's wrapper div, not the editable region itself. Tests verify drop on edge of composer surface still works. |
| Mid-turn inject button absolute-positioned against textarea geometry | Phase E review of `MidTurnInjectButton` positioning: top/right offsets recalibrated against ContentEditable's bounding box. May need a wrapper div to preserve the existing visual anchor. |
| Per-thread draft round-trip via `getTextContent()` loses inline mention positions if the user paused mid-mention | Acceptable — current behavior already loses partial mentions across thread switches because `mentions[]` is rebuilt from store, not from draft text. No regression. Documented in Phase F result brief. |
| Hidden transitive importer of `rich-textarea` not caught by grep (e.g., a barrel re-export) | Phase F `grep` probe in data-shape probes section confirms zero imports. Bundle analyzer (Vite `--analyze` flag) cross-checks. |
| Post-Phase-F regression discovered after release (Lexical-only path is shipped, `rich-textarea` dep removed — flag-flip revert is no longer available) | Recovery procedure: (1) `git revert` the release tag's merge commit on master, which restores `rich-textarea` in `package.json`, the branching import in `AgentChatComposerInput.tsx`, and the legacy code path; (2) cut a hotfix patch release (v2.12.1) flipping the runtime default back to RichTextarea while leaving Lexical files in place; (3) reopen Wave 81 with the discovered regression as the new gate. Document this procedure in the Phase F result brief so future-Cole doesn't have to reconstruct it under pressure. |
| Manual smoke gate in chat-only window requires Cole to run dev build with flag set during phases B-E for verification | Document the env-var setting in Phase A audit. **Each of phases B-E is gated on Cole's live-IDE observation per the Verification table and dispatch checklist** — implementer reports phase complete and pauses; orchestrator hands off to Cole for the live check before dispatching the next phase. Phase F's manual smoke is the wave-end blocking gate per `~/.claude/rules/manual-smoke-gate.md`. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| A | n/a | n/a | Read-only architect deliverable; sequence diagram + integration-seam enumeration. |
| B | `LexicalChatComposer.test.tsx` — keyboard plugin in isolation: Enter-sends, Shift-Enter-newlines, Escape-clears, Tab-cycles-permission. **Enter is suppressed when `event.isComposing === true` (IME composition active)** — fire a `keydown` with `isComposing: true` and assert no send. **ArrowUp restores only when caret is at editor start AND draft is empty** — assert no restore when caret is mid-text or draft has content. | n/a | Mount with empty editor; assert key behavior matches existing `handleComposerKeyDown` semantics including the gating conditions. |
| C | `lexicalMentionBridge.test.tsx` — trigger detection, `addMention` bridge call on selection, `removeMention` on backspace-into-chip | `AgentChatComposer.lexicalIntegration.test.tsx` (new) — mount full composer with flag on; type `@`, assert dropdown opens, click item, assert `mentions[]` store updated and chip rendered in `MentionChipsBar` | Mock `useAgentChatContext` to assert bridge calls. |
| D | `slashCommandPlugin.test.ts` — pattern detection at various cursor positions, mixed `@`/`/` cursor cases | n/a (covered by phase C integration test extended) | Verify slash menu open/close + selection callback unchanged. |
| E | `lexicalImagePaste.test.ts`, `lexicalFileTreeDrop.test.ts`, `lexicalQuoteListener.test.ts` | n/a | Each aux feature unit-tested in isolation. |
| F | Updated `AgentChatComposerInput.test.tsx` — Lexical-path assertions replace RichTextarea-path | Full vitest suite + lint + typecheck + `/review 81` | Manual smoke checklist in `wave-81-auto-brief.md`. |

## Acceptance criteria

- [ ] `lexical`, `@lexical/react`, `lexical-beautiful-mentions` listed in `package.json` dependencies after Phase B.
- [ ] `rich-textarea` removed from `package.json` after Phase F (`grep '"rich-textarea"' package.json` → empty).
- [ ] No `src/renderer/**/*.{ts,tsx}` file imports from `rich-textarea` after Phase F (`grep -r "from 'rich-textarea'" src/renderer` → empty).
- [ ] `src/renderer/components/AgentChat/lexicalComposer/LexicalChatComposer.tsx` exists and is the rendered composer when `import.meta.env.VITE_LEXICAL_COMPOSER === '1'` (phases B-E) or unconditionally (phase F).
- [ ] In a live chat-only window with the Lexical composer mounted, typing `@` opens a dropdown with file/folder/diff/terminal/codebase/symbol items matching the existing icon and color scheme; selecting an item inserts an inline blue chip token AND adds the mention to `mentions[]` store; the chip bar above the composer reflects it.
- [ ] In a live chat-only window with the Lexical composer mounted, typing `/` opens the existing `SlashCommandMenu` UI unchanged; selecting an action runs it OR replaces with `/cmdId ` plain text.
- [ ] In a live chat-only window with the Lexical composer mounted, backspacing through a 50-char `@` mention path produces no perceptible stutter — each backspace commits within a single frame (~16ms); confirmed via Cole's manual repro of the original 2026-05-02 bug case.
- [ ] Per-thread draft persists across thread switches in the new composer (string round-trip preserved).
- [ ] Image paste continues to attach images via `useImageAttachmentHandlers` (visible in `AttachmentChipsBar`).
- [ ] Drag from FileTree onto composer continues to insert a mention via `buildMentionFromDrop`.
- [ ] `agent-ide:quote-to-composer` event appends quoted text to the composer (verified by triggering the event from the message action menu and observing the composer text update).
- [ ] `npm run build` and `npm run dist` succeed cleanly post-Phase F.
- [ ] `npx tsc --noEmit` clean post-Phase F.
- [ ] Full vitest suite green post-Phase F.
- [ ] Manual smoke checklist in `roadmap/wave-81-composer-engine-migration/wave-81-auto-brief.md` complete and signed.

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| A | Internal — no observation point | n/a | Phase A is a read-only architect-pass deliverable producing `phase-a-audit.md`. The sequence diagram inside that document is bound to Site 1's user-observable-terminus rule, with the terminus stated in the Phases table Notes column (chat-only composer textarea visually reflecting an inserted blue mention chip in a live IDE window). |
| B | Chat-only composer textarea in Cole's live IDE window with `VITE_LEXICAL_COMPOSER=1` | Cole launches `npm run dev` with flag set → Electron renderer mounts → AgentChatComposerInput branches to LexicalChatComposer → keystroke in ContentEditable → Lexical editor state delta → OnChangePlugin → store.setDraft → useComposerDraftSync → ContentEditable text node | Cole types into the chat-only composer and the typed character appears immediately; pressing Enter sends the message (or queues if streaming); pressing Escape clears the composer; pressing ArrowUp from empty draft restores the last sent user message text. |
| C | Chat-only composer textarea + mention chip bar in Cole's live IDE window with flag set | Cole types `@` → BeautifulMentionsPlugin trigger matcher → menuItemComponent dropdown render → Cole clicks a file → onItemSelect bridge fires `useAgentChatContext.addMention` → mentions[] zustand store updates → MentionChipsBar re-renders → ContentEditable shows inline blue chip token | Cole sees the mention dropdown open below the composer with the same icon+color scheme as the existing dropdown; clicking a result inserts a blue chip in the textarea AND adds a chip to the bar above; backspacing into the chip removes both the inline token and the bar chip. |
| D | Chat-only composer slash-command menu in Cole's live IDE window with flag set | Cole types `/` → custom Lexical SlashCommandPlugin scans editor state → cursor-position `/` pattern detected → SlashCommandMenu open state set true → SlashCommandMenu component renders dropdown → Cole selects → action callback runs OR replaceSlashTrigger inserts `/cmdId ` plain text via editor.update() → ContentEditable text reflows | Cole sees the existing slash-command menu open identically to the legacy composer (same items, same visuals, same selection feedback); selecting `/clear` clears the chat; selecting `/spec` inserts the `/spec ` text into the composer for further typing. |
| E | Chat-only composer attachment chip bar + composer text in Cole's live IDE window with flag set | Cole pastes an image (Ctrl+V) → custom Lexical paste plugin intercepts at COMMAND_PRIORITY_HIGH → useImageAttachmentHandlers.handlePaste → ImageAttachment[] → onAttachmentsChange → AttachmentChipsBar re-renders. Separately: Cole drags a file from FileTree → drop on composer wrapper div → custom drop handler → buildMentionFromDrop → editor.update() → BeautifulMentionsPlugin insertMention → MentionChipsBar updates. Separately: Cole clicks "quote to composer" on a message → agent-ide:quote-to-composer dispatched → listener → editor.update() + TextNode insert → ContentEditable text appended | Cole sees an image thumbnail chip in the attachments bar after pasting; sees a blue mention chip in the composer (and chip bar) after dropping a file from the file tree; sees quoted text appear at the cursor position after clicking the quote action on a prior message. |
| F | Chat-only composer textarea in Cole's live IDE window WITHOUT any flag (Lexical is now default) | Cole launches `npm run dev` with no flag → Electron renderer mounts → AgentChatComposerInput unconditionally renders LexicalChatComposer → backspace key (held or pressed rapidly 10×) on a 50-char inserted mention → Lexical editor state delta per character → OnChangePlugin per character → React commit per character (no full-tree reconcile) → ContentEditable repaints character-by-character | Cole reproduces the original 2026-05-02 bug case (insert mention, backspace through it) and observes no stutter — each backspace commits in a single frame, the visible character count drops by one per keystroke without batching, and the chat-only conversation list does not visibly hitch. |

### Data-shape probes

```bash
# After Phase B — Lexical packages installed
grep -E '"lexical"|"@lexical/react"|"lexical-beautiful-mentions"' package.json
# Expected: 3 lines

# After Phase F — rich-textarea removed
grep '"rich-textarea"' package.json
# Expected: empty

# After Phase F — no renderer imports
grep -r "from 'rich-textarea'" src/renderer
# Expected: empty

# After Phase B — Lexical composer file exists
test -f src/renderer/components/AgentChat/lexicalComposer/LexicalChatComposer.tsx && echo "OK"
# Expected: OK

# After Phase F — typecheck + lint + tests
npx tsc --noEmit                                                    # exit 0
npm run lint                                                         # exit 0
timeout 360 npx vitest run src/renderer/components/AgentChat/        # exit 0

# After Phase F — bundle delta vs pre-wave baseline
# Capture before Phase B starts: `npm run build && du -sb out/renderer | cut -f1` → baseline_bytes
# Capture again after Phase F: `npm run build && du -sb out/renderer | cut -f1` → post_bytes
# Expected: net delta within ±200 KB. Larger deltas in either direction get explained
# in the Phase F result brief (lexical core ~80 KB gz + @lexical/react ~25 KB gz +
# lexical-beautiful-mentions ~15 KB gz minus rich-textarea ~18 KB gz; raw-byte numbers
# will be larger).
```

## Files the next agent should read first

1. `src/renderer/components/AgentChat/AgentChatComposerInput.tsx` — current `rich-textarea` integration; the file being substantially rewritten in Phase B and cleaned up in Phase F.
2. `src/renderer/components/AgentChat/AgentChatComposer.tsx` — parent composer; mostly preserved; reference shape for props and state flow.
3. `src/renderer/components/AgentChat/AgentChatComposerKeyHandlers.ts` — current keyboard-handler logic; ports into the custom Lexical key-handler plugin in Phase B.
4. `src/renderer/components/AgentChat/AgentChatComposerHooks.ts` — `useComposerDraftSync`, `useImageAttachmentHandlers`; some pieces port to Lexical, some retire.
5. `src/renderer/components/AgentChat/MentionAutocomplete.tsx` + `MentionAutocompleteSupport.ts` — current mention dropdown UI; styling/icons are the reference for Phase C `menuItemComponent`.
6. `src/renderer/components/AgentChat/SlashCommandMenu.tsx` — UI preserved as-is in Phase D; the custom Lexical slash plugin wraps it.
7. `src/renderer/components/AgentChat/useAgentChatContext.ts` — `addMention` / `removeMention` / `mentions[]` store contract; Phase C bridge target.
8. `src/renderer/components/AgentChat/useAgentChatDraftPersistence.ts` — string-based per-thread draft round-trip; Phase B reads + writes through this unchanged.
9. `src/renderer/components/AgentChat/AgentChatComposerInput.test.tsx` — current test surface; Phase F rewrites against Lexical.
10. `src/renderer/components/AgentChat/AgentChatComposerSupport.ts` — `extractMentionQuery`, `extractSlashQuery`, `replaceTriggerWithPath`, `buildMentionInsertion`; reference for Lexical plugin equivalents.
11. `src/renderer/components/AgentChat/CLAUDE.md` — composer subsystem docs; Phase F appends a Lexical migration gotcha entry.
12. `roadmap/wave-81-composer-engine-migration/phase-a-audit.md` — Phase A architect deliverable; required reading before phases B-F start.
13. `roadmap/wave-81-composer-engine-migration/wave-81-decisions.md` — locked architectural decisions for this wave.

## Note to the implementer

This is a structural performance fix, not a feature wave. The user value is "no stutter when editing `@` mentions"; everything else is parity work to preserve existing behavior. The migration is encapsulated in `src/renderer/components/AgentChat/lexicalComposer/` so the wave's work can be cleanly reverted if Lexical surfaces an unexpected blocker — that directory plus the package.json deps plus a couple of branching imports in `AgentChatComposerInput.tsx` are the entire footprint.

DO NOT take the opportunity to redesign the composer UI, change keyboard shortcuts, alter the `MentionChipsBar` styling, or refactor `SlashCommandMenu`. Lexical is the engine swap; everything else stays the same. DO NOT touch `AgentChatConversation`, the message list, or any selectors outside the composer subsystem. The pre-wave `useAgentChatThreadView` selector and `useContextPreview` memoizations are load-bearing for general perf and orthogonal to the engine swap — leave them. DO NOT migrate draft persistence to Lexical JSON state; string round-trip is the locked decision for this wave. DO NOT touch the substring search in `MentionAutocompleteSupport.ts` — the pre-wave fix is sufficient and revisiting it adds scope.

Phase A's audit is the single highest-leverage deliverable in this wave. Read it carefully before starting B. Phase F's manual smoke gate is non-negotiable per `~/.claude/rules/manual-smoke-gate.md` — Cole signs the checklist or the wave doesn't ship.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. Verify ADR exists at `roadmap/wave-81-composer-engine-migration/wave-81-decisions.md` with the six locked decisions filled in (decision 1 in full best-practice-spectrum form, others in abbreviated `Context / Pick / Rationale` form).
2. Phase A — `sonnet-architect` — produce `phase-a-audit.md` with sequence diagram. Gate: diagram terminus is the user-observable endpoint stated in the Phases table Notes (chat-only composer textarea reflecting inserted mention chip).
3. Phase B — `sonnet-implementer` — Lexical composer shell + keyboard plugin behind `VITE_LEXICAL_COMPOSER` flag. Gate: Cole verifies flag-on plain-text typing + Enter/Shift-Enter/Escape/ArrowUp/Tab parity in a live chat-only window.
4. Phase C — `sonnet-implementer` — `@` mention bridge to `mentions[]` store. Gate: Cole verifies typing `@` surfaces dropdown identical to legacy; selection inserts chip + populates store + chip bar.
5. Phase D — `sonnet-implementer` — custom slash-command plugin driving existing `SlashCommandMenu`. Gate: Cole verifies typing `/` opens existing menu identically; selection runs action OR replaces with plain text.
6. Phase E — `sonnet-implementer` — image paste, drag-drop, quote event, mid-turn-inject button positioning. Gate: Cole verifies each behavior in turn with flag on.
7. Phase F — `sonnet-implementer` — flip default to Lexical; remove `rich-textarea` from `package.json`; rewrite `AgentChatComposerInput.test.tsx`; append CLAUDE.md gotcha entry; manual smoke. Gate: full lint + typecheck + targeted tests pass; `/review 81` mechanical gap-check returns PASS or FLAG-with-resolutions; smoke checklist signed in `wave-81-auto-brief.md`.
8. Final wrap: full vitest suite green, formatter run, orchestrator diff review of the entire wave, commit + push to GitHub with release tag bump (target v2.12.0).
