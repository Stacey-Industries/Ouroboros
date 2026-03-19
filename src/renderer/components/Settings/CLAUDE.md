<!-- claude-md-auto:start -->

Here's the generated CLAUDE.md content for `src/renderer/components/Settings/`:

---

`★ Insight ─────────────────────────────────────`
**Three architectural decisions worth understanding here:**

1. **Two-host, one-draft** — `SettingsModal` and `SettingsPanel` are completely separate React trees but share `useSettingsDraft()`. This separation lets the modal animate in/out independently without the panel needing to know about portal rendering.
2. **Draft-then-commit with live preview** — Theme changes apply immediately (via `setTheme`) but are tracked in `originalThemeRef` for rollback. Only on "Save" does `persistDraft` fire `set()` for every config key in parallel. This is why cancel must call `setTheme(originalThemeRef.current)`.
3. **Flat search index** — `settingsEntries.ts` is a pure data file with no component deps. `searchEntries()` runs against it synchronously. This means full-text search costs zero IPC and doesn't re-render any section components until the user clicks a result.
   `─────────────────────────────────────────────────`

The CLAUDE.md covers the two-host architecture, the 5-layer decomposition pattern for large sections, the draft/commit flow, the self-contained store sections (`ExtensionStore`, `McpStore`) that bypass draft, the step-by-step guide for adding new tabs, and gotchas including the animated modal lifecycle, `originalThemeRef` rollback, `ContextDocsSection`'s nested config shape, and `persistDraft`'s parallel writes.

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Settings — Full settings UI: modal, inline panel, 14 tabbed sections

## Architecture

Two host components render the same tab content:

- **`SettingsModal.tsx`** — overlay modal (portal-based, animated mount/unmount)
- **`SettingsPanel.tsx`** — inline panel for centre pane embedding

Both share `useSettingsDraft()` for draft state, save/cancel, and theme preview rollback. Tabs are defined in `settingsTabs.ts`; `SettingsTabContent.tsx` maps `TabId` → section component via a `TAB_RENDERERS` record.

## Decomposition Pattern

Large sections follow a strict split to stay under ESLint limits (40 lines/function, 300 lines/file):

| Layer                   | Naming                                                 | Role                                                                           |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Composition root        | `ClaudeSection.tsx`                                    | Thin — wires model hook to content                                             |
| Model hook              | `useClaudeSection.ts`                                  | State + callbacks, returns typed model                                         |
| Content                 | `ClaudeSectionContent.tsx`                             | Layout — composes Body + Controls                                              |
| Body / Controls / Parts | `ClaudeSectionBody.tsx`, `*Controls.tsx`, `*Parts.tsx` | Leaf UI components                                                             |
| Styles                  | `claudeSectionContentStyles.ts`                        | `CSSProperties` objects (no Tailwind in settings — inline styles via CSS vars) |

Not every section uses all layers. Simpler tabs like `GeneralSection.tsx` or `AppearanceSection.tsx` are single-file composition roots that inline their subsections.

## Key Files

| File                     | Role                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `settingsTabs.ts`        | `TabId` union + `TABS` array — add new tabs here first                                       |
| `settingsEntries.ts`     | Flat metadata for every setting field — powers full-text search                              |
| `SettingsTabContent.tsx` | Tab → component router (`TAB_RENDERERS` record)                                              |
| `useSettingsDraft.ts`    | Draft/save/cancel/theme-preview logic shared by Modal and Panel                              |
| `settingsStyles.tsx`     | Shared primitives: `SectionLabel`, `buttonStyle`, `smallButtonStyle`                         |
| `settingsModalStyles.ts` | Modal-specific footer button styles                                                          |
| `searchHelpers.tsx`      | `searchEntries()` — fuzzy-matches query against `SETTINGS_ENTRIES`                           |
| `ToggleSwitch.tsx`       | Reusable toggle used across all sections                                                     |
| `ToastBanner.tsx`        | Ephemeral success/error banner, driven by local `useToast()` (not the global `ToastContext`) |

## Store Sections (self-contained, bypass draft system)

Two sections manage their own IPC and don't use the draft/save flow:

| Section                     | Model hook               | IPC bridge                            |
| --------------------------- | ------------------------ | ------------------------------------- |
| `ExtensionStoreSection.tsx` | `extensionStoreModel.ts` | `window.electronAPI.extensionStore.*` |
| `McpStoreSection.tsx`       | `mcpStoreModel.ts`       | `window.electronAPI.mcpStore.*`       |

`ExtensionStoreSection` supports two sources (`openvsx` / `marketplace`) with paginated search and category filtering. Both sections dispatch `EXTENSION_THEMES_CHANGED_EVENT` on install/toggle to notify `useExtensionThemes`.

## Adding a New Settings Tab

1. Add `TabId` to `settingsTabs.ts` — both the union type and the `TABS` array
2. Create the section component(s) in this directory
3. Register it in `SettingsTabContent.tsx` under `TAB_RENDERERS`
4. Add searchable metadata in `settingsEntries.ts` via `createEntries()`
5. Export from `index.ts`

## Conventions

- **Inline styles via CSS vars** — settings UI uses `CSSProperties` objects with `var(--text)`, `var(--bg)`, `var(--border)`, etc. No Tailwind classes inside this directory.
- **Draft pattern** — all config-backed sections receive `draft: AppConfig` + `onChange: (key, value) => void`. Changes buffer in memory until Save. `persistDraft` calls `set()` for every key in parallel via `Promise.all`.
- **External change sync** — both Modal and Panel subscribe to `config.onExternalChange` and overwrite the draft when config changes externally while settings is open.
- **Search requirement** — every user-visible setting must have a `SettingsEntry` in `settingsEntries.ts` or it is invisible to settings search.

## Gotchas

- `ExtensionsSection`, `McpSection`, and `CodeModeSection` receive **no props** — they own their state via hooks, not the draft system. Passing `draft`/`onChange` to them would be wrong.
- `SettingsModal` has an animated mount/unmount cycle (`isMounted` + `isVisible` + 200 ms timeout). Removing the timer breaks the exit animation.
- Theme preview on cancel uses `originalThemeRef` — set at open time before any `handlePreviewTheme` call. If you add another live-preview setting, follow the same ref pattern with its own `original*Ref`.
- `ContextDocsSection` has its own `DEFAULT_SETTINGS` fallback for `ClaudeMdSettings` because those keys live in a sub-object of config, not in the flat `AppConfig` shape that the draft system handles.
- `useKeybindingCapture.ts` captures raw `KeyboardEvent` and translates to an accelerator string. The keydown handler must call `e.preventDefault()` to suppress browser shortcuts (e.g. `Ctrl+W`) during capture.
- `persistDraft` calls `set()` for every config key in parallel — new config keys with async side effects on save must tolerate concurrent writes.
