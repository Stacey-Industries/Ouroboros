<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
This directory is notably large (~90 files) but follows a rigorous decomposition pattern that keeps each file under 304 lines. The split is: `Section.tsx` (thin orchestrator) → `SectionParts.tsx` (presentational) → `*Styles.ts` (style objects) → `useSection.ts` (business logic). Understanding this split is the key to navigating the directory without reading every file.
`─────────────────────────────────────────────────`
# Settings — Modal UI & Section Components

Full settings modal for the Electron IDE. Two-level tab navigation, full-text search, draft/save lifecycle, and ~15 discrete setting sections.

## Structural Decomposition Pattern

Every section follows the same split — do not collapse these into one file:

| Layer | Example | Role |
|---|---|---|
| `*Section.tsx` | `GeneralSection.tsx` | Thin orchestrator — composes subsections, reads hooks |
| `*Subsection.tsx` / `*Parts.tsx` | `GeneralProjectSubsection.tsx` | Presentational chunks; receive props only |
| `*Styles.ts` | `fileFilterSectionStyles.ts` | Style objects as JS constants (not Tailwind) |
| `use*.ts` | `useSettingsDraft.ts` | All business logic and local state |

## Key Files

| File | Role |
|---|---|
| `SettingsModal.tsx` | Entry point — owns draft lifecycle, wires all state |
| `SettingsModalParts.tsx` | Portal render + full prop surface for the modal UI |
| `SettingsModalFrame.tsx` | `ModalOverlay` / `ModalCard` primitives |
| `SettingsPanel.tsx` | Left-nav + content area shell |
| `SettingsTabBar.tsx` | Main tab navigation (renders `MainTabId` tabs) |
| `SettingsTabContent.tsx` | Routes `TabId` → section component |
| `settingsTabs.ts` | Defines `MainTabId` and `TabId` union types + tab metadata |
| `settingsEntries.ts` | `SettingsEntry[]` — full registry powering search |
| `settingsEntriesData.ts` | Static label/keyword data for search entries |
| `searchHelpers.tsx` | Fuzzy match logic; returns `SearchMatch[]` |
| `useSettingsDraft.ts` | Draft `AppConfig` state, save/cancel, error handling |
| `settingsStyles.tsx` | Shared primitives: `SectionLabel`, `SectionDescription` |

## Tab System

Two-level navigation — always distinguish these types:

```ts
MainTabId  // top-level tabs: 'general' | 'appearance' | 'terminal' | ...
TabId      // sub-tabs within a main tab (superset of MainTabId)
```

`settingsTabs.ts` is the canonical source for both. Tab routing happens in `SettingsTabContent.tsx`.

## Settings Change Handler

All sections receive the same typed `onChange`:

```ts
type SettingsChangeHandler = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
```

Sections **never own save state** — they call `onChange` which writes to draft. Save is triggered from the modal level only.

## Style Convention

Settings components use **inline style objects** from dedicated `*Styles.ts` files, not Tailwind classes. Each section has its own style file. Shared cross-section styles live in `settingsStyles.tsx` and `settingsModalStyles.ts`.

Do not add Tailwind classes to existing settings components — it will mix paradigms. New components in this directory should follow the existing inline-style pattern.

## Search System

1. `settingsEntries.ts` — defines every searchable entry with `id`, `label`, `keywords`, `tabId`, `subTabId`
2. `settingsEntriesData.ts` — static data consumed by entries
3. `searchHelpers.tsx` — `searchEntries(query, entries)` → `SearchMatch[]`
4. `SettingsSearchInput.tsx` / `SettingsSearchResults.tsx` — UI
5. Clicking a result fires `onResultClick(entry)` which navigates to the correct tab + sub-tab

## Hooks Reference

| Hook | Owns |
|---|---|
| `useSettingsDraft` | Draft `AppConfig`, save, cancel, import |
| `useClaudeSection` | Claude template editing state |
| `useCodexSection` | Codex provider config |
| `useAccountsSection` | Auth provider state |
| `useProviderApiKeysModel` | API key add/remove |
| `useProvidersSection` | Provider list management |
| `useCodeModeSectionModel` | CodeMode enable/status |
| `useCodeModeActions` | CodeMode toggle side-effects |
| `useCodeModeStatus` | Live CodeMode health |
| `useThemeEditorActions` | Theme create/delete/rename |
| `useThemeEditorOverrides` | Live CSS var overrides |
| `useClaudeTemplateEditor` | CLAUDE.md template editing |
| `useKeybindingCapture` | Keyboard capture for rebinding |
| `useToast` | Transient banner messages |

## Gotchas

- **`profilesSectionHelpers.ts`** contains shared logic for the Profiles section — not a hook, not a component. Check here before duplicating profile-merge logic.
- **`ThemeEditor` is split into 5 files**: `ThemeEditor.tsx` (shell), `.model.ts` (state), `.parts.tsx` (UI), `.shared.ts` (types/helpers), `.styles.ts` (styles). Edit the right layer.
- **`HooksSection` has 3 subsections**: `HooksConfigSubsection`, `HooksApprovalSubsection`, `HooksStatusSubsection` — each independently testable. `HooksConfigSubsection.test.ts` covers the config subsection only.
- **`terminalSectionShared.tsx`** exports shared types (`SettingsChangeHandler`, `ShellPreset`, `PromptPreset`) and UI primitives (`PresetButton`, `StepButton`) used by both `TerminalSectionParts.tsx` and `TerminalSection.tsx`.
- **`claudeSectionContentStyles.ts`** and `claudeTemplateEditorStyles.ts` are separate — the former styles the Claude section body, the latter styles the template editor modal within it.
- **`index.ts`** re-exports only the public surface (`SettingsModal`, `SettingsPanel`, `ToggleSwitch`). Add new exports there only if consumed outside this directory.

## Dependencies

- `../../types/electron` — `AppConfig` (all settings shape)
- `../../types/electron-claude-md` — `ClaudeMdGenerationStatus`
- `../../../shared/` — shared utility types
- IPC: sections call `window.electronAPI.*` directly for live operations (hook status, CodeMode toggle, etc.) — they do not go through `onChange`
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
