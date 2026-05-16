# Wave 17 — Layout Preset Engine
## Implementation Plan

**Version target:** v1.4.1 (patch — additive scaffolding, no user-visible change)
**Feature flag:** `layout.presets.v2` (default `false`)
**Upstream dependencies:** Wave 16 (`Session.layoutPresetId` scaffold field)
**Unblocks:** Wave 20 (chat-primary), Wave 32 (mobile-primary)

---

## 1. Architecture Overview

### Core Types (`types.ts`)

```
SlotName  = 'sidebarHeader' | 'sidebarContent' | 'editorTabBar'
          | 'editorContent' | 'agentCards' | 'terminalContent'
PanelId   = 'leftSidebar' | 'rightSidebar' | 'terminal'
ComponentDescriptor = { componentKey: string; props?: Record<string, unknown> }
ResponsiveRules     = { minWidth: number; fallbackPresetId: string }
LayoutPreset = {
  id: string;
  name: string;
  slots: Partial<Record<SlotName, ComponentDescriptor>>;
  panelSizes: Partial<Record<PanelId, number>>;
  visiblePanels: Partial<Record<PanelId, boolean>>;
  breakpoints?: ResponsiveRules;
}
```

`ComponentDescriptor` uses a string `componentKey` (not a React component ref) so presets are
JSON-serialisable and can eventually be persisted to `sessions` config.

### Built-in Presets (`presets.ts`)

| Preset id       | Status      | Wave populated |
|-----------------|-------------|----------------|
| `ide-primary`   | Full        | Wave 17        |
| `chat-primary`  | Scaffold    | Wave 20        |
| `mobile-primary`| Scaffold    | Wave 32        |

`ide-primary` mirrors today's default layout verbatim — all 6 slots populated, default panel
sizes from `useResizable` defaults (leftSidebar 220, rightSidebar 300, terminal 280), all panels
visible.

### LayoutPresetResolver (`LayoutPresetResolver.tsx`)

React context provider that:
1. Reads `window.electronAPI.config.getAll()` once at mount via IPC.
2. Checks the `layout.presets.v2` flag. If off, returns `idePrimaryPreset` unconditionally.
3. When flag is on: reads the active session's `layoutPresetId` (passed as prop) and resolves it
   against `BUILT_IN_PRESETS`. Falls back to `idePrimaryPreset` if not found.
4. Exposes the resolved `LayoutPreset` via `useLayoutPreset()`.

The resolver does **not** drive slot swapping in Wave 17. It is purely a data-provision layer
that Wave 20 consumers will read.

---

## 2. File-by-File Breakdown

### New files

| File | Approx lines | Notes |
|------|-------------|-------|
| `src/renderer/components/Layout/layoutPresets/types.ts` | ~75 | Core types, all exported |
| `src/renderer/components/Layout/layoutPresets/presets.ts` | ~110 | 3 built-in presets + BUILT_IN_PRESETS array |
| `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.tsx` | ~95 | Context + provider + hook |
| `src/renderer/components/Layout/layoutPresets/index.ts` | ~10 | Barrel |
| `src/renderer/components/Layout/layoutPresets/types.test.ts` | ~30 | Runtime shape verification |
| `src/renderer/components/Layout/layoutPresets/presets.test.ts` | ~55 | Built-in preset contracts |
| `src/renderer/components/Layout/layoutPresets/LayoutPresetResolver.test.tsx` | ~85 | Provider + hook behaviour |

### Modified files

| File | Delta | Change |
|------|-------|--------|
| `src/main/configSchemaTail.ts` | +9 lines | `layout.presets.v2` boolean flag |
| `src/main/config.ts` | +3 lines | `layout?: { presets?: { v2?: boolean } }` on AppConfig |
| `src/renderer/types/electron-foundation.d.ts` | +3 lines | Same type on renderer AppConfig |
| `src/renderer/components/Layout/InnerAppLayout.tsx` | +5 lines | Wrap LayoutProviders in `<LayoutPresetResolverProvider>` |

---

## 3. Phase Sequencing

### Phase A — Core module (this wave, single commit)

All new files + all modified files in one commit. The feature flag is default-off so the
change is a no-op on existing installations. AppLayout is untouched — the provider wraps
`LayoutProviders` in `InnerAppLayout` without changing `AppLayout` semantics.

No Phase B or C in Wave 17 — the wave is intentionally scaffolding only.

---

## 4. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Provider re-renders on every config reload | Context value is memoized with `useMemo` |
| `window.electronAPI` unavailable in web mode | `hasElectronAPI()` guard; falls back to `idePrimaryPreset` |
| Flag-off regression | `useLayoutPreset()` returns `idePrimaryPreset` unconditionally when flag is off |
| Wave 20 breaking change | `ComponentDescriptor.componentKey` is opaque string — resolving to a component is Wave 20's concern |

---

## 5. Testing Strategy

- **`types.test.ts`**: Construct `LayoutPreset` objects at runtime to exercise all fields — serves
  as a compile-time type smoke test.
- **`presets.test.ts`**: Assert all 3 presets have `id`/`name`, `ide-primary` has all 6 slots,
  `BUILT_IN_PRESETS` length is 3, scaffolds have `TODO` markers in comments (verified via
  source inspection).
- **`LayoutPresetResolver.test.tsx`**: `@vitest-environment jsdom`. Tests: (1) provider renders
  children, (2) `useLayoutPreset` returns `idePrimaryPreset` when no session ID provided,
  (3) returns `idePrimaryPreset` when flag is off even if sessionPresetId is set,
  (4) resolves correct preset when flag is on and a valid presetId is provided.

---

## 6. Rollback Plan

Feature flag `layout.presets.v2` is `false` by default. Rolling back means:
- The provider is a pass-through — `useLayoutPreset()` returns `idePrimaryPreset` unconditionally.
- No slot swapping occurs in Wave 17 regardless of flag state.
- A full code revert removes the provider wrap from `InnerAppLayout` with no state impact.

---

## 7. Cross-Wave Stability Commitments

| Artifact | Consumed by |
|----------|-------------|
| `LayoutPreset` type | Wave 20, 28, 32 |
| `SlotName` union | Wave 20 (slot population) |
| `BUILT_IN_PRESETS` array | Wave 20, 32 |
| `useLayoutPreset()` hook | Wave 20 consumers |
| `layout.presets.v2` flag | Wave 20 (flip to true) |
| `idePrimaryPreset.id === 'ide-primary'` | Wave 20 migration |
