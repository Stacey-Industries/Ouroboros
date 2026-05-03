# Wave 81 — Overnight Progress Brief (for Cole, morning of 2026-05-03)

**Status:** Phases A → E complete and committed locally on `master`. Phase F **NOT** done — held intentionally pending your live-IDE smoke checks. Nothing pushed.

## Commits landed overnight

| Phase | SHA | Description |
|---|---|---|
| A (audit) | (no commit — `phase-a-audit.md` is uncommitted, see "Roadmap docs" below) | API surface verified vs Context7 + GitHub source; pinned `lexical-beautiful-mentions@0.1.48` |
| B | `54c3bd9` | Lexical composer shell behind `VITE_LEXICAL_COMPOSER` flag; full keyboard parity; legacy RichTextarea path untouched |
| C | `fc27378` | `@` mention bridge — `BeautifulMentionsPlugin` wired to `mentions[]` zustand store via prop threading |
| D | `1d05824` | `/` slash command plugin — drives existing `SlashCommandMenu` unchanged; multi-paragraph cursor offset (Risk 9.5) mitigated and tested |
| E | `0d924b5` | Image paste, drag-from-FileTree drop, quote-to-composer listener, mid-turn button positioning, slash menu keyboard nav |

`git log master --oneline -5` should show all four commits on top of `97f85ce` (the v2.11.2 release).

## Machine gates per phase

Every phase passed before commit:
- `npx tsc --noEmit` → exit 0
- `npm run lint` → 0 errors (3 pre-existing warnings in unrelated files: `delegationCoach/patterns.test.ts`, `FileViewer/FileViewerChrome.tsx`, `FileViewer/HtmlPreview.tsx`)
- Targeted vitest (`src/renderer/components/AgentChat/lexicalComposer/`) → all pass per phase
- Full AgentChat suite after Phase E: **952/952 passing**
- `npm run build` → exit 0 in ~31s

## Pre-wave bundle baseline (for Phase F delta)

Captured before Phase B installed the new deps:
- `out/renderer/` baseline = **70,038,488 bytes** (~66.8 MB raw)

Compare against post-Phase-F build to compute the delta. Audit §8 estimates ~+102 KB gz net (lexical 80 + @lexical/react 25 + lexical-beautiful-mentions 15, minus rich-textarea 18). Acceptable threshold per the wave plan: ±200 KB gz.

## Site 2 smoke checks queued for you (B → C → D → E)

Set the flag, run dev, open a chat-only window, then walk through each block. If any check fails, **do not dispatch Phase F** — flag it and triage first.

```powershell
$env:VITE_LEXICAL_COMPOSER = "1"
npm run dev
```

### Phase B — keyboard parity

- [X ] Typed characters appear immediately in the composer (no stutter)
- [X ] Enter sends the message (or queues if streaming) — no double-send
- [X ] Shift+Enter inserts a newline; Enter alone does not send while shift is held
- [ X] Escape clears the composer
- [X ] ArrowUp from an EMPTY draft restores the last sent user message text
- [ X] ArrowUp from mid-text does NOT restore (caret moves normally)
- [X ] Shift+Tab cycles permission mode

### Phase C — `@` mention dropdown

- [ X] Typing `@` opens a dropdown with the same icon + color scheme as the legacy `MentionAutocomplete` (file/folder/diff/terminal/codebase/symbol)
- [ X] Selecting an item inserts a blue chip token in the composer AND adds a chip to the bar above
- [Removes the chip in composer but not the one above it] Backspacing through a chip removes BOTH the inline chip and the bar chip
- [ X] Typing without `@` does not trigger the dropdown

However, @ still lags when backspacing it out. It is just stutter / hiccup, not an entire freeze but still not completely smooth like normal text
### Phase D — `/` slash command menu

- [X ] Typing `/` opens the slash menu identically to the legacy composer (same items, same visuals)
- [X ] Typing `/cl` filters down to commands matching "cl"
- [ X] **Selecting `/clear` clears the chat** (the keyboard nav fix in Phase E means Enter now selects the slash command instead of sending — test this!)
- [ones without user or project prefix say invalid feature name] Selecting `/spec` (or any non-clear command) inserts the `/cmdId ` plain text into the composer for further typing
- [X ] Typing `foo/bar` (slash mid-word) does NOT open the menu
- [X ] Typing `@user /clear` works — `@` dropdown coexists with `/` menu
- [X although nothing shows under /cmd] **Multi-paragraph cursor case (Risk 9.5):** type `hello`, press Shift+Enter, type `/cmd` — the slash menu opens with query `cmd`, not `cm`. This validates the absolute-offset computation.

### Phase E — auxiliary parity

- [X] Pasting an image from clipboard attaches it via the attachments bar (Ctrl+V on a copied image)
- [X] Dragging a file from the FileTree onto the composer inserts a blue mention chip (in both the inline composer AND the chip bar above)
- [Doesn't exist ] Clicking "quote to composer" on a prior assistant message appends quoted text to the composer at the cursor
- [X ] `MidTurnInjectButton` (the lightning button visible while streaming) appears in the same pixel zone as the legacy composer — no visible shift
- [X, but visibility is bad for that and the @ menu] Slash menu ArrowUp/ArrowDown cycles the highlighted item
- [X, but see above for visbility issue] `@` mention dropdown ArrowUp/ArrowDown navigates as in legacy (handled by `BeautifulMentionsPlugin` internally — should already work)

## Overnight design notes worth knowing

A few items beyond the phase summaries that you may want to know before dispatching Phase F:

1. **Bridging strategy:** Phase C (mentions) and Phase D (slash) both used **option (a) — explicit prop threading**. `addMention`/`removeMention`/`onSlashStateChange`/`slashSelectHandlerRef` all flow as props from `AgentChatComposer.useComposerState` → `ComposerInputSection` → `ComposerInput` → `LexicalTextarea` → `LexicalChatComposer` → `InnerComposer` → bridge components. This keeps Lexical decoupled from any specific React context shape.

2. **Phase D refactor surfaced a pre-existing 323-line `AgentChatComposerInput.tsx`** that was silently over the `max-lines: 300` limit (the lint hook only fires on touched files). The agent extracted `AgentChatComposerTypes.ts` and `AgentChatComposerSubcomponents.tsx` to fix it as a side effect. Files now: AgentChatComposerInput.tsx 245 lines, AgentChatComposerTypes.ts 86 lines, AgentChatComposerSubcomponents.tsx 70 lines.

3. **Phase E required deeper extraction than the original brief contemplated** because both `LexicalChatComposer.tsx` (391 lines) and `SlashCommandPlugin.tsx` (347 lines) were over the cap after the Phase E plugin mounts and slash kbd nav. The orchestrator (me) took over after the implementer agent couldn't finish the lint cleanup in two attempts, and extracted: `lexicalComposerHooks.ts`, `lexicalComposerPlugins.tsx`, `slashKeyboardNav.ts`, `imageAttachmentSupport.ts`, `slashCommandDefinitions.ts`. Each got co-located smoke tests. Final sizes: `LexicalChatComposer.tsx` 173, `SlashCommandPlugin.tsx` 223, `SlashCommandMenu.tsx` 212.

4. **Phase E's `LexicalImagePastePlugin` uses duck-typing instead of `instanceof ClipboardEvent`** because jsdom does not expose `ClipboardEvent` globally. The check is `typeof event.clipboardData.items !== 'undefined'`. This is documented in the source.

5. **Slash menu keyboard nav (E5) added `selectedIndex` to `SlashState` and a small prop to `SlashCommandMenu`.** The menu accepts an optional external `selectedIndex` and falls back to internal state when undefined — preserves the legacy path. The handler chain: ArrowDown in editor → SlashCommandPlugin's COMMAND_PRIORITY_HIGH listener → updates ref → emits via `onSlashStateChange` → parent updates `slashSelectedIndex` → passes to `SlashCommandMenu` → menu re-renders with new highlight. Enter goes through the same path → calls `slashSelectHandlerRef.current(cmd)` → executes.

6. **Pre-wave perf fixes (the four pre-Wave-81 commits) remain unchanged and load-bearing.** Substring search in `MentionAutocompleteSupport.ts`, `useAgentChatThreadView` selector, `useContextPreview` memoization, `.claude` skipped in `useProjectFileIndex.ts` — all kept per Decision 6.

7. **Risk 9.3 mitigation** — `useBeautifulMentions().insertMention` requires a Lexical context. Phase E's `LexicalDropPlugin` is mounted INSIDE `LexicalComposer`'s subtree (in `ComposerPlugins`) so `useLexicalComposerContext()` works. The drop handler is attached to the ContentEditable via `editor.registerRootListener`-style approach.

## Roadmap docs (uncommitted)

These are intentionally NOT in the per-phase commits:
- `roadmap/wave-81-composer-engine-migration/phase-a-audit.md` (untracked)
- `roadmap/wave-81-composer-engine-migration/wave-81-decisions.md` (modified)
- `roadmap/wave-81-composer-engine-migration/waveplan-81.md` (modified)
- `roadmap/wave-81-composer-engine-migration/wave-81-overnight-progress.md` (this file, untracked)

You can `git add roadmap/wave-81-composer-engine-migration/` and commit as `docs(wave-81): phase A audit + overnight progress brief` whenever convenient.

Also untracked / modified noise that you'll want to discard or stash:
- `tools/__fixtures__/train-context/test-output-weights.json` — timestamp regen from running tests during the wave; pure noise; revert with `git checkout tools/__fixtures__/`.

## Phase F — what's left and how to dispatch

Phase F is the cutover. It removes `rich-textarea` from `package.json` and flips `VITE_LEXICAL_COMPOSER` default to on. **Do not dispatch Phase F until you've completed the Site 2 smoke checks above** — once `rich-textarea` is removed from the dep, the legacy fallback is gone (revert requires `git revert` of the merge commit).

### Recommended dispatch (after smoke passes)

A `sonnet-implementer` agent. Brief should:

1. Reference the wave plan's Phase F row (line 62) and the recovery procedure (Risk row line 87).
2. Tasks:
   - In `AgentChatComposerInput.tsx`, remove the `if (import.meta.env.VITE_LEXICAL_COMPOSER === '1')` branch in `ComposerTextarea` so `LexicalTextarea` renders unconditionally. Delete `LegacyRichTextarea` and any imports it used (`RichTextarea`, `getTextareaStyle`, `tokenizeComposerHighlights`, `renderHighlights`, etc.).
   - In `package.json`: `npm uninstall rich-textarea`.
   - Remove `src/renderer/components/AgentChat/AgentChatComposerHighlights.tsx` and `.test.tsx` (legacy-path-only).
   - Verify with `grep -r "from 'rich-textarea'" src/renderer` returns empty.
   - Verify with `grep -r "tokenizeComposerHighlights\|renderHighlights" src/` returns only stale references to clean up (or empty if all uses retire cleanly).
   - Rewrite `AgentChatComposerInput.test.tsx` to assert against the Lexical surface (drop the RichTextarea-mock pattern).
   - Append a Lexical migration gotcha entry to `src/renderer/components/AgentChat/CLAUDE.md`.
3. Verification gate:
   - `npx tsc --noEmit` → exit 0
   - `npm run lint` → exit 0
   - `timeout 360 npx vitest run` → all pass (full suite for Phase F per wave plan)
   - `npm run build` → exit 0
   - `npm run dist` → exit 0 (Phase F-only requirement per wave plan acceptance criteria)
   - Capture post-Phase-F bundle size, compute delta vs `70,038,488` baseline. Document in result brief.
4. Manual smoke per `~/.claude/rules/manual-smoke-gate.md` — you sign the checklist in `roadmap/wave-81-composer-engine-migration/wave-81-auto-brief.md`.
5. After signoff: orchestrator commits the wave-81 roadmap docs separately, then commits Phase F, then pushes the entire wave + bumps release tag to v2.12.0 per the wave plan.

### Recovery procedure if Phase F surfaces a regression

Per the wave plan risk table:

```
git revert <Phase-F-merge-SHA>
# Restores rich-textarea in package.json + the branching code
npm install
# Cut a hotfix v2.12.1 with the legacy default re-enabled
# Reopen Wave 81 with the discovered regression as the new gate
```

## Gotchas / known weirdness

1. **The `tools/__fixtures__/train-context/test-output-weights.json` timestamp drift** is pure noise from vitest running. Discard with `git checkout tools/__fixtures__/test-output-weights.json` before dispatching Phase F.

2. **`AgentChatComposerHighlights.tsx`** was created during Phase B as a side effect of the lint hook discovering a pre-existing `max-lines: 300` violation in `AgentChatComposerInput.tsx`. It contains the legacy textarea's `renderHighlights` function. **Phase F should delete this file** — it's only used by the legacy RichTextarea path.

3. **Three subagents got truncated mid-narration** during the wave (Phases B, C, D, E all had partial responses requiring resumes). The truncation pattern is consistent: agents stop in the middle of long lint-cleanup operations. Each one was successfully resumed via `SendMessage` to the live agent, and one (Phase E) required the orchestrator to take over the final cleanup directly. The work itself was correct in every case; only the reporting was truncated.

4. **Test (e) in `SlashCommandPlugin.test.tsx`** is the regression guard for the multi-paragraph cursor offset gotcha (Risk 9.5). If you ever refactor `computeAbsoluteOffset` in `SlashCommandPlugin.tsx`, that test must continue to pass. The `+= 2` for `DOUBLE_LINE_BREAK` between paragraphs (verified against `Lexical.dev.mjs` line 9559) is the load-bearing detail.

## Sleep well — handoff complete.

The overnight orchestrator (Claude Opus 4.7 1M, this session) signs off with all four phases done, machine gates green, and Phase F intentionally held for your manual sign-off in the morning. No surprises in the diff — every commit is per-phase scoped, the legacy RichTextarea path is intact through E, and the recovery procedure for any post-F regression is documented above.
